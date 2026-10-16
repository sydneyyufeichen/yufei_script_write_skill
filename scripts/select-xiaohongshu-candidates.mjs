#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_DIR = "/Users/chenyufei/Documents/ChatGPT/video_media_search_skill/output/xiaohongshu";
const EXCLUDED_AUTHORS = new Set(["小七养生说", "袁姐姐全息健康笔记"]);

function args(argv) {
  const out = { xiaohongshuDir: DEFAULT_DIR, limitPerAccount: 25, manifest: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--xiaohongshu-dir") out.xiaohongshuDir = value;
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

function percentile(group, value, key) {
  if (value === null) return null;
  const comparable = group.filter((item) => item[key] !== null);
  if (comparable.length < 2) return null;
  const below = comparable.filter((item) => item[key] < value).length;
  return below / (comparable.length - 1);
}

function compare(a, b) {
  return b.performanceScore - a.performanceScore ||
    (b.likes ?? -1) - (a.likes ?? -1) ||
    (b.shares ?? -1) - (a.shares ?? -1) ||
    (b.comments ?? -1) - (a.comments ?? -1) ||
    a.account.localeCompare(b.account) ||
    a.file.localeCompare(b.file);
}

async function main() {
  const options = args(process.argv.slice(2));
  const names = (await fs.readdir(options.xiaohongshuDir)).filter((name) => name.endsWith(".md") && !name.startsWith("."));
  const records = [];
  for (const name of names) {
    const file = path.join(options.xiaohongshuDir, name);
    const markdown = await fs.readFile(file, "utf8");
    const record = {
      file: name,
      path: file,
      account: field(markdown, "Account") || "unknown",
      title: firstHeading(markdown),
      likes: numberField(markdown, "Likes"),
      shares: numberField(markdown, "Shares"),
      comments: numberField(markdown, "Comments"),
      heat: numberField(markdown, "Heat"),
      duration: numberField(markdown, "Duration"),
      caption: section(markdown, "Caption"),
      script: section(markdown, "Script"),
    };
    if (!EXCLUDED_AUTHORS.has(record.account)) records.push(record);
  }

  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.account)) groups.set(record.account, []);
    groups.get(record.account).push(record);
  }

  const selected = [];
  for (const group of groups.values()) {
    for (const record of group) {
      record.withinAccount = {
        likesPercentile: percentile(group, record.likes, "likes"),
        sharesPercentile: percentile(group, record.shares, "shares"),
        commentsPercentile: percentile(group, record.comments, "comments"),
        heatPercentile: percentile(group, record.heat, "heat"),
      };
      const values = Object.values(record.withinAccount).filter((value) => value !== null);
      record.performanceScore = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    }
    selected.push(...group.filter((record) =>
      record.title && record.script && [record.likes, record.shares, record.comments, record.heat].some((value) => value !== null)
    ).sort(compare).slice(0, options.limitPerAccount));
  }
  selected.sort(compare);
  if (!selected.length) throw new Error("Cannot establish a Xiaohongshu performance pool from verifiable metrics");

  const result = {
    generatedAt: new Date().toISOString(),
    xiaohongshuDir: path.resolve(options.xiaohongshuDir),
    excludedAuthors: [...EXCLUDED_AUTHORS],
    semanticExclusionsStillRequired: ["culture-or-customs-led", "excessively-deep-theory", "incomplete-body"],
    totalEligibleAuthorRecords: records.length,
    candidates: selected,
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (options.manifest) {
    await fs.mkdir(path.dirname(path.resolve(options.manifest)), { recursive: true });
    await fs.writeFile(options.manifest, json, "utf8");
  }
  process.stdout.write(json);
}

main().catch((error) => { process.stderr.write(`ERROR: ${error.message}\n`); process.exitCode = 1; });
