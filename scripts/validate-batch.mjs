#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_XHS_DIR = "/Users/chenyufei/Documents/ChatGPT/video_media_search_skill/output/xiaohongshu";
const DEFAULT_INSTAGRAM_DIR = "/Users/chenyufei/Documents/ChatGPT/video_media_search_skill/output/instagram";
const DEFAULT_TEXT_DIR = "/Users/chenyufei/Documents/ChatGPT/video_media_search_skill/output/text";
const REQUIRED_SECTIONS = ["Topic", "Video Title", "Caption", "Spoken Script", "Chinese Translation", "Source References"];

function usage() {
  return [
    "Usage:",
    "  node scripts/validate-batch.mjs --topic TOPIC --file TOPIC_TITLE_TYPE_YYYYMMDD.md [...] [--topic TOPIC ...] [options]",
    "",
    "Options:",
    "  --output-dir PATH        Default: output",
    `  --xiaohongshu-dir PATH   Default: ${DEFAULT_XHS_DIR}`,
    `  --instagram-dir PATH     Default: ${DEFAULT_INSTAGRAM_DIR}`,
    `  --text-dir PATH          Default: ${DEFAULT_TEXT_DIR}`,
    "  --topic NAME             Start a topic-theme group; repeat as needed",
    "  --file PATH              One generated file for the preceding --topic; repeat N >= 1 times",
    "  --comment-prompt-file PATH  Reviewed next-topic question; repeat as needed",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { outputDir: "output", xiaohongshuDir: DEFAULT_XHS_DIR, instagramDir: DEFAULT_INSTAGRAM_DIR, textDir: DEFAULT_TEXT_DIR, topics: [], commentPromptFiles: [] };
  let currentTopic = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    if (arg === "--output-dir") options.outputDir = value;
    else if (arg === "--xiaohongshu-dir") options.xiaohongshuDir = value;
    else if (arg === "--instagram-dir") options.instagramDir = value;
    else if (arg === "--text-dir") options.textDir = value;
    else if (arg === "--topic") {
      currentTopic = { name: value, files: [] };
      options.topics.push(currentTopic);
    }
    else if (arg === "--comment-prompt-file") options.commentPromptFiles.push(value);
    else if (arg === "--file") {
      if (!currentTopic) throw new Error("Each --file must follow a --topic argument");
      currentTopic.files.push(value);
    }
    else throw new Error(`Unknown option: ${arg}`);
    index += 1;
  }
  if (options.topics.length < 1) throw new Error("Pass at least one --topic group");
  if (new Set(options.topics.map(topic => topic.name)).size !== options.topics.length) throw new Error("Each --topic name must be distinct");
  for (const topic of options.topics) if (!topic.files.length) throw new Error(`Topic ${topic.name} needs at least one --file`);
  return options;
}

function sectionsFrom(markdown) {
  const headingRegex = /^## ([^\r\n]+)\s*$/gm;
  const matches = [...markdown.matchAll(headingRegex)];
  const sections = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index + matches[index][0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length;
    sections.set(matches[index][1].trim(), markdown.slice(start, end).trim());
  }
  return { headings: matches.map((match) => match[1].trim()), sections };
}

function normalizedWords(text) {
  return (text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []).map((word) => word.toLowerCase());
}

function firstSentence(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  const match = clean.match(/^.*?[.!?](?:\s|$)/);
  return (match ? match[0] : clean).trim();
}

function sanitizeTitle(title) {
  return title
    .normalize("NFKD")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\\/:*?"<>|\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "");
}

function extractReferenceLinks(text) {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^- \[(.*\.md)\]\(<([^>]+)>\)$/);
      return match ? { label: match[1].replace(/\\([\[\]\\])/g, "$1"), target: match[2] } : { invalid: line };
    });
}

async function validateFile(filePath, topicTheme, outputDir, sourceDirs, errors, batchStats) {
  const basename = path.basename(filePath);
  if (path.dirname(filePath) !== outputDir) errors.push(`${basename}: generated file must be directly inside ${outputDir}`);
  if (!/^[\x20-\x7E]+_(?:问题解决|反常识纠错|深度解读)_\d{8}\.md$/.test(basename)) errors.push(`${basename}: use TOPIC_THEME_VIDEO_TITLE_问题解决|反常识纠错|深度解读_YYYYMMDD.md`);
  let markdown;
  try {
    markdown = await fs.readFile(filePath, "utf8");
  } catch (error) {
    errors.push(`${basename}: cannot read file (${error.message})`);
    return;
  }
  const { headings, sections } = sectionsFrom(markdown);
  if (headings.length !== REQUIRED_SECTIONS.length || headings.some((heading, index) => heading !== REQUIRED_SECTIONS[index])) {
    errors.push(`${basename}: level-two headings must be exactly ${REQUIRED_SECTIONS.join(" -> ")}`);
    return;
  }
  for (const section of REQUIRED_SECTIONS) if (!sections.get(section)) errors.push(`${basename}: ${section} is empty`);

  const title = (sections.get("Video Title") || "").replace(/\s+/g, " ").trim();
  const caption = sections.get("Caption") || "";
  const translation = sections.get("Chinese Translation") || "";
  const publishableFields = [sections.get("Topic") || "", title, caption, sections.get("Spoken Script") || "", translation].join("\n");
  if (/\b(?:the\s+)?(?:Chinese|Instagram|text)\s+(?:source|original|creator)\b|\b(?:the\s+)?sources?\s+(?:says?|said|adds?|describes?|connects?|explains?|suggests?|emphasizes?|cautions?|shows?)\b|\b(?:Xiaohongshu|Instagram)\b|\boriginal post\b/i.test(publishableFields)) {
    errors.push(`${basename}: provenance/process language may appear only in Source References`);
  }
  const suffix = basename.match(/_(问题解决|反常识纠错|深度解读)_(\d{8})\.md$/);
  const type = suffix?.[1];
  const date = suffix?.[2];
  if (type) batchStats.types.push(type);
  const iso = date ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}` : "";
  const parsedDate = new Date(`${iso}T00:00:00Z`);
  if (!date || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== iso) errors.push(`${basename}: filename requires a valid creation date after its type suffix`);
  const expectedBasename = `${sanitizeTitle(topicTheme)}_${sanitizeTitle(title)}_${type || "TYPE"}_${date || "YYYYMMDD"}.md`;
  if (basename !== expectedBasename) errors.push(`${basename}: filename must equal sanitized topic theme + Video Title + type + date (${expectedBasename})`);
  const titleWords = normalizedWords(title);
  if (titleWords.length < 2) errors.push(`${basename}: cover headline must contain at least 2 English words`);
  if (titleWords.length > 12) errors.push(`${basename}: cover headline exceeds the 12-word maximum (${titleWords.length})`);
  if (/#/.test(title)) errors.push(`${basename}: Video Title must not contain hashtags`);
  if (/\b(follow for more|comment ["'“”]|dm me|link in bio)\b/i.test(title)) errors.push(`${basename}: Video Title must not contain CTA or lead-capture copy`);
  if (title.includes("?")) batchStats.questionTitles.push(basename);

  const captionLines = caption.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const hashtagLine = captionLines.at(-1) || "";
  const hashtags = hashtagLine.match(/#[A-Za-z][A-Za-z0-9]*/g) || [];
  const captionProse = captionLines.slice(0, -1).join(" ");
  if (!captionProse) errors.push(`${basename}: Caption needs one or two concise English sentences before the hashtag line`);
  if (normalizedWords(captionProse).length > 80) errors.push(`${basename}: Caption prose exceeds 80 English words; distill the central idea instead of retelling the script`);
  if (hashtags.length < 5 || hashtags.length > 10 || hashtagLine.replace(/#[A-Za-z][A-Za-z0-9]*/g, "").trim()) {
    errors.push(`${basename}: Caption must end with a separate line containing only 5–10 English hashtags`);
  }

  const script = sections.get("Spoken Script") || "";
  if (translation && !/[\u3400-\u9FFF]/u.test(translation)) errors.push(`${basename}: Chinese Translation must contain Chinese text`);
  if (/(?:非|不是)(?:一份)?(?:医疗|医学)(?:诊断|建议)|及时就医|寻求医疗帮助|咨询(?:你的|您的)?(?:医生|医师)|遵医嘱/u.test(translation)) errors.push(`${basename}: remove generic Chinese diagnosis, medical-referral or clinician-advice copy`);
  batchStats.endings.set(filePath, script.trim().split(/\n\s*\n/).at(-1) || "");
  const genericMedicalCopy = /\b(?:not a diagnosis|seek (?:medical|professional) (?:care|help|attention)|get medical (?:care|help|attention)|(?:talk|speak) (?:to|with) (?:a |your )?(?:medical |healthcare )?(?:professional|provider|doctor|clinician)|consult (?:a |your )?(?:doctor|clinician|healthcare provider)|follow (?:a |your )?(?:doctor|clinician)(?:'s|’s) advice|needs? medical attention)\b/i;
  if (genericMedicalCopy.test(script)) errors.push(`${basename}: remove all diagnosis, medical-referral, clinician-advice, warning, restriction, and other safety-processing copy; do not replace it with a narrower disclaimer`);
  const words = normalizedWords(script);
  if (words.length < 90) errors.push(`${basename}: spoken script is too short (${words.length} English words; minimum 90)`);
  if (words.length > 340) errors.push(`${basename}: spoken script is too long (${words.length} English words; maximum 340 for accessible videos)`);
  batchStats.lengths.push({ basename, words: words.length });
  if (words.length >= 4) {
    const opening = words.slice(0, 4).join(" ");
    if (batchStats.openings.has(opening)) errors.push(`${basename}: duplicate first four spoken words with ${batchStats.openings.get(opening)} (${opening})`);
    else batchStats.openings.set(opening, basename);
  }
  if (firstSentence(script).includes("?")) batchStats.questionOpenings.push(basename);

  const references = extractReferenceLinks(sections.get("Source References") || "");
  if (references.length < 1) errors.push(`${basename}: list every materially used Instagram, Xiaohongshu, and text source`);
  const labels = references.filter((reference) => !reference.invalid).map((reference) => reference.label);
  if (new Set(labels).size !== labels.length) errors.push(`${basename}: duplicate source reference`);
  const sourceOrder = { Instagram: 0, Xiaohongshu: 1, text: 2 };
  let previousSourceKey = null;
  for (const reference of references) {
    if (reference.invalid) {
      errors.push(`${basename}: reference must use - [exact basename.md](<relative/path.md>) (${reference.invalid})`);
      continue;
    }
    const matchingSource = sourceDirs.find(source => {
      const expectedTarget = path.join(source.dir, reference.label);
      const expectedRelativeTarget = path.relative(path.dirname(filePath), expectedTarget).split(path.sep).join("/");
      return reference.target === expectedRelativeTarget;
    });
    if (path.isAbsolute(reference.target) || !matchingSource) {
      errors.push(`${basename}: reference must be the exact relative path to a file under Instagram, Xiaohongshu, or text (${reference.label})`);
      continue;
    }
    const currentSourceKey = [sourceOrder[matchingSource.name], reference.label];
    if (previousSourceKey && (currentSourceKey[0] < previousSourceKey[0] || (currentSourceKey[0] === previousSourceKey[0] && currentSourceKey[1].localeCompare(previousSourceKey[1]) < 0))) {
      errors.push(`${basename}: order Source References by Instagram, Xiaohongshu, text, then exact basename`);
    }
    previousSourceKey = currentSourceKey;
    const expectedTarget = path.join(matchingSource.dir, reference.label);
    try {
      const stat = await fs.stat(expectedTarget);
      if (!stat.isFile()) errors.push(`${basename}: reference is not a file (${reference.label})`);
      if (stat.isFile() && matchingSource.name === "Xiaohongshu") {
        const sourceText = await fs.readFile(expectedTarget, "utf8");
        const account = sourceText.match(/^- Account:[ \t]*(.*)$/m)?.[1]?.trim().normalize("NFKC");
        const normalizedLabel = reference.label.normalize("NFKC");
        const excludedAuthors = ["小七养生说", "袁姐姐全息健康笔记"];
        const excludedAuthor = excludedAuthors.find(author => account === author || normalizedLabel.startsWith(`${author} -`));
        if (excludedAuthor) {
          errors.push(`${basename}: excluded Xiaohongshu author ${excludedAuthor}; replace this source`);
        }
      }
      if (stat.isFile() && matchingSource.name === "Instagram") {
        const sourceText = await fs.readFile(expectedTarget, "utf8");
        const account = sourceText.match(/^- Account:[ \t]*(.*)$/m)?.[1]?.trim().normalize("NFKC").toLowerCase();
        const normalizedLabel = reference.label.normalize("NFKC").toLowerCase();
        if (account === "dr.franktcm" || normalizedLabel.startsWith("dr.franktcm -")) {
          errors.push(`${basename}: excluded Instagram author dr.franktcm; replace this source`);
        }
      }
    } catch {
      errors.push(`${basename}: missing ${matchingSource.name} reference (${reference.label})`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(options.outputDir);
  const sourceDirs = [
    { name: "Instagram", dir: path.resolve(options.instagramDir) },
    { name: "Xiaohongshu", dir: path.resolve(options.xiaohongshuDir) },
    { name: "text", dir: path.resolve(options.textDir) },
  ];
  const topics = options.topics.map(topic => ({
    name: topic.name,
    files: topic.files.map(file => path.isAbsolute(file) ? path.resolve(file) : path.resolve(outputDir, file)),
  }));
  const files = topics.flatMap(topic => topic.files);
  const commentFiles = options.commentPromptFiles.map(file => path.isAbsolute(file) ? path.resolve(file) : path.resolve(outputDir, file));
  const errors = [];
  if (new Set(files).size !== files.length) errors.push("The --file list contains duplicates");
  const batchStats = { openings: new Map(), questionOpenings: [], questionTitles: [], lengths: [], types: [], endings: new Map() };
  for (const topic of topics) for (const file of topic.files) await validateFile(file, topic.name, outputDir, sourceDirs, errors, batchStats);
  if (new Set(commentFiles).size !== commentFiles.length) errors.push("Duplicate --comment-prompt-file assignment");
  const validCommentFiles = new Set();
  for (const file of commentFiles) {
    if (!files.includes(file)) errors.push(`Comment prompt is not in this batch: ${file}`);
    else if (!/\?(?:\s+Let me know in the comments\.)?\s*$/i.test(batchStats.endings.get(file) || "")) errors.push(`Comment prompt must end in a question, optionally followed by "Let me know in the comments.": ${path.basename(file)}`);
    else validCommentFiles.add(file);
  }
  const requiredPrompts = Math.floor(files.length / 6);
  if (validCommentFiles.size < requiredPrompts) errors.push(`Need at least ${requiredPrompts} reviewed next-video-topic comment prompt(s); declare with --comment-prompt-file`);
  if (errors.length) {
    process.stderr.write(`Batch validation failed with ${errors.length} error(s):\n`);
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Validated ${files.length} files across ${topics.length} topic group(s). User-core grounding, source support, comment usefulness, single CTA, translation parity, and editorial review still require semantic verification.\n`);
}

main().catch((error) => {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
});
