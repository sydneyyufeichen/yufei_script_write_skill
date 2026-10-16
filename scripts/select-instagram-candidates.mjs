#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_DIR = "/Users/chenyufei/Documents/ChatGPT/video_media_search_skill/output/instagram";
const EXCLUDED_AUTHORS = new Set(["dr.franktcm"]);

function normalizedAccount(value) {
  return value.trim().normalize("NFKC").toLowerCase();
}

function args(argv) {
  const out = { instagramDir: DEFAULT_DIR, limitPerAccount: 25, manifest: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--instagram-dir") out.instagramDir = value;
    else if (key === "--limit-per-account") out.limitPerAccount = Number(value);
    else if (key === "--manifest") out.manifest = value;
    else throw new Error(`Unknown option: ${key}`);
  }
  if (!Number.isInteger(out.limitPerAccount) || out.limitPerAccount < 1) throw new Error("--limit-per-account must be a positive integer");
  return out;
}

function section(markdown, name) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${name}`.toLowerCase());
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) { end = index; break; }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

function field(markdown, name) {
  return (markdown.match(new RegExp(`^- ${name}:\\s*(.+)$`, "mi"))?.[1] || "").trim();
}

function numberField(markdown, name) {
  const raw = field(markdown, name).replace(/,/g, "");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function firstHeading(markdown) {
  return (markdown.match(/^#\s+(.+)$/m)?.[1] || "").trim();
}

function percentile(sorted, value, key) {
  if (value === null || sorted.length < 2) return null;
  const below = sorted.filter((item) => item[key] !== null && item[key] < value).length;
  const comparable = sorted.filter((item) => item[key] !== null).length;
  return comparable < 2 ? null : below / (comparable - 1);
}

async function main() {
  const options = args(process.argv.slice(2));
  const names = (await fs.readdir(options.instagramDir)).filter((name) => name.endsWith(".md") && !name.startsWith("."));
  const records = [];
  for (const name of names) {
    const file = path.join(options.instagramDir, name);
    const markdown = await fs.readFile(file, "utf8");
    const record = {
      file: name,
      path: file,
      account: field(markdown, "Account") || "unknown",
      title: firstHeading(markdown),
      likes: numberField(markdown, "Likes"),
      views: numberField(markdown, "Views"),
      comments: numberField(markdown, "Comments"),
      heat: numberField(markdown, "Heat"),
      engagement: numberField(markdown, "Engagement"),
      duration: numberField(markdown, "Duration"),
      caption: section(markdown, "Caption"),
      script: section(markdown, "Script"),
    };
    const excludedByAccount = EXCLUDED_AUTHORS.has(normalizedAccount(record.account));
    const excludedByFilename = [...EXCLUDED_AUTHORS].some((author) => normalizedAccount(name).startsWith(`${author} -`));
    if (!excludedByAccount && !excludedByFilename) records.push(record);
  }
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.account)) groups.set(record.account, []);
    groups.get(record.account).push(record);
  }
  const selected = [];
  for (const [account, group] of groups) {
    for (const record of group) {
      record.withinAccount = {
        likesPercentile: percentile(group, record.likes, "likes"),
        viewsPercentile: percentile(group, record.views, "views"),
        heatPercentile: percentile(group, record.heat, "heat"),
        engagementPercentile: percentile(group, record.engagement, "engagement"),
      };
      const values = Object.values(record.withinAccount).filter((value) => value !== null);
      record.performanceScore = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    }
    selected.push(...group.filter((record) =>
      record.title && record.script && [record.likes, record.views, record.heat, record.engagement].some((value) => value !== null)
    ).sort((a, b) =>
      b.performanceScore - a.performanceScore ||
      (b.likes ?? -1) - (a.likes ?? -1) ||
      (b.views ?? -1) - (a.views ?? -1) ||
      (b.engagement ?? -1) - (a.engagement ?? -1) ||
      a.account.localeCompare(b.account) ||
      a.file.localeCompare(b.file)
    ).slice(0, options.limitPerAccount));
    if (!account) throw new Error("Instagram record has no account");
  }
  selected.sort((a, b) =>
    b.performanceScore - a.performanceScore ||
    (b.likes ?? -1) - (a.likes ?? -1) ||
    (b.views ?? -1) - (a.views ?? -1) ||
    (b.engagement ?? -1) - (a.engagement ?? -1) ||
    a.account.localeCompare(b.account) ||
    a.file.localeCompare(b.file)
  );
  if (!selected.length) throw new Error("Cannot establish an Instagram performance pool from verifiable metrics");
  const result = { generatedAt: new Date().toISOString(), instagramDir: path.resolve(options.instagramDir), totalFiles: names.length, totalRecords: records.length, excludedAuthors: [...EXCLUDED_AUTHORS], completeRecords: records.filter((r) => r.title && r.script).length, candidates: selected };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (options.manifest) {
    await fs.mkdir(path.dirname(path.resolve(options.manifest)), { recursive: true });
    await fs.writeFile(options.manifest, json, "utf8");
  }
  process.stdout.write(json);
}

main().catch((error) => { process.stderr.write(`ERROR: ${error.message}\n`); process.exitCode = 1; });
