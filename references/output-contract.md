# Output contract

## Filename

Use `<Sanitized English Topic Theme>_<Sanitized English Cover Headline>_<内容类型>_YYYYMMDD.md`.

Sanitize the topic theme and headline separately to printable ASCII, remove forbidden filename characters, normalize whitespace, and trim spaces or dots. Append exactly one type—`问题解决`, `反常识纠错`, or `深度解读`—then the creation date in Asia/Shanghai. Preserve the original creation date during later edits. Do not overwrite an unrelated existing draft.

Example: `Nasal Congestion_Blocked Nose Follow This Routine_问题解决_20260914.md`.

## Exact document structure

```markdown
## Topic

<Concise English editorial angle.>

## Video Title

<Short English cover headline.>

## Caption

<Concise English caption that distills the central idea without retelling the script.>

<5–10 relevant English hashtags on a separate final line.>

## Spoken Script

<Complete English spoken script only.>

## Chinese Translation

<Faithful natural Chinese translation, in the same information and paragraph order.>

## Source References

- [Exact source basename.md](<../../video_media_search_skill/output/instagram/Exact source basename.md>)
- [Exact source basename.md](<../../video_media_search_skill/output/xiaohongshu/Exact source basename.md>)
- [Exact source basename.md](<../../video_media_search_skill/output/text/Exact source basename.md>)
```

Use exactly these six nonempty sections in this order. Keep `Caption` to one or two concise sentences that extract the central idea; do not summarize the script step by step. Put 5–10 specific, relevant English hashtags on a separate final line in that section. List every source named by the user for that unit and no unrelated source. Order references by Instagram, Xiaohongshu, text, then exact basename. Labels must be exact basenames and targets exact relative local paths; do not emit absolute paths, web URLs, review notes, scorecards, or production-process language in publishable sections.

For an actual viewer-comment reply, Topic may contain a concise verified `Opening-screen comment:` quote and anonymization cue. Provide the original comment link or screenshot separately; a comment is not a health-content source.

## Validation

Validate any batch of one or more files in one command. Group files by filename topic theme; the number of topic groups is unrestricted:

`node scripts/validate-batch.mjs --topic "Topic Theme" --file <path> [--file <path> ...] [--topic "Another Theme" --file <path> ...] [--comment-prompt-file <path> ...]`

Repeat `--comment-prompt-file` for drafts whose sole ending CTA asks a useful next-video question. The validator checks structure, filename, source paths, exclusions, and selected mechanical constraints. Semantic grounding to the user's core content, translation fidelity, CTA quality, humanization, and review status still require editorial review.
