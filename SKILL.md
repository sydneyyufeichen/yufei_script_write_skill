---
name: yufei-script-write-skill
description: Shortlist evidence-backed English TCM short-video topics for Yufei, draft scripts from user-selected core content, or fuse explicitly selected source files. Use for work based on the project's Instagram, Xiaohongshu, and text source libraries and its bilingual script output format.
---

# Yufei topic and script writing

Follow the current user's requested mode. Read [references/account-persona.md](references/account-persona.md) for the creator's voice and identity and [references/actionable-rules.md](references/actionable-rules.md) in full before topic selection or drafting. [references/writing-workflow.md](references/writing-workflow.md) is the detailed procedure for the two modes below.

## Topic shortlist

Use the Instagram and Xiaohongshu selection scripts and the eligibility rules in `references/actionable-rules.md` to rank eligible topics from verifiable source performance. Search the complete Instagram, Xiaohongshu, and text libraries for relevant eligible material for each selected topic. Return three distinct topics with the performance basis, why each is filmable, and exact local source-file links. Stop for the user's source and core-content selection before drafting, unless the user has already provided script-ready content or expressly requested source fusion.

## Draft or revise scripts

Treat each user-supplied core or selected draft as its own content boundary. Fuse full source texts only when the user explicitly requests fusion of named sources. Ground each substantive claim and action in the applicable core or selected sources; do not import details from unrelated files or fill gaps from general knowledge. If a required source is missing or conflicts materially with the proposed script, surface the blocker before finalizing that unit.

Read [references/output-contract.md](references/output-contract.md) before writing. Produce the required English sections and faithful Chinese translation, cite only the selected local sources, and validate the whole delivery with `scripts/validate-batch.mjs`. Review grounding, natural spoken English, caption and hook, translation, and source coverage in addition to mechanical validation. After final review, update [management/material-catalog.md](management/material-catalog.md) with `scripts/update-material-catalog.mjs` as directed by the writing workflow; do not use the catalog to choose topics or draft.

If source performance or another required input cannot be verified, stop before finalizing the affected shortlist or draft and ask the user how to proceed. Do not replace missing evidence with estimates or unsupported inferences.
