/**
 * Shipped catalog seeds for the Skills Hub. `seedSystemSkillsInternal`
 * idempotently upserts these by name (and renames in place via
 * `previousNames`, preserving installs). Editing the text here and re-running
 * the seed updates every installer (system skills are linked, not copied).
 *
 * Instructions are a markdown PLAYBOOK aimed at an MCP agent (e.g. Claude
 * Code with vmem connected) — they drive the agent to build the artefact
 * entirely through vmem's existing tools. Keep tool names exact.
 */

export interface SystemSkillSeed {
  name: string;
  description: string;
  instructions: string;
  category?: string;
  /**
   * Former names of this seed. If no row matches `name` but one matches a
   * previous name, it is renamed in place (id + installs preserved) instead
   * of inserting a duplicate.
   */
  previousNames?: string[];
}

const SETUP_WIKI_INSTRUCTIONS = `# setup-wiki — Codebase Knowledge Base

Build a living, source-grounded knowledge base for the current codebase as a
**wiki inside vmem** — one folder of linked pages. Everything is stored in vmem
via the wiki tools; nothing is written to the repo or to GitHub. Use this the
FIRST time a codebase needs a knowledge base; use \`update-wiki\` to refresh it later.

You have vmem's MCP tools available. The relevant ones:
- \`codebases_list\` — vmem's synced codebases (id, repo name, language, stats).
- \`codebase_overview\` / \`codebase_graph\` / \`codebase_search\` / \`codebase_context\` — vmem's parsed graph for a synced codebase (files, functions, classes, interfaces, processes, and call/import edges). \`codebase_graph\` with \`kinds:["code-process"]\` returns the detected entry-point flows — the best raw material for a "how it works" page.
- \`wiki_list\` / \`wiki_search\` / \`wiki_get\` — read the existing wiki.
- \`wiki_create\` — create a folder or a document. On a folder you may pass \`sourceCodebaseId\` to link it to a vmem codebase.
- \`wiki_update\` — replace or append a document's markdown.

## Step 1 — Locate the codebase and decide the link

1. Determine the repo you are working in (its \`owner/name\`).
2. Call \`codebases_list\`. If a synced codebase matches this repo, note its \`id\` — you will pass it as \`sourceCodebaseId\` and you can read structure from vmem's graph instead of re-reading every file.
3. If there is no match, that is fine — read structure from the local working tree instead, and omit \`sourceCodebaseId\`.

## Step 2 — Survey, then PLAN the pages (adaptive)

Survey the codebase before writing anything:
- If synced: \`codebase_overview\` for stats, then \`codebase_graph\` (start with \`kinds:["code-file"]\` and \`kinds:["code-process"]\`) for structure and flows. Use \`codebase_search\` / \`codebase_context\` to drill into key symbols.
- If not synced: read the README, manifests (package.json / pyproject / go.mod / etc.), entry points, and the directory layout.

Then decide a page set that FITS THIS REPO — do not force a fixed template. Typical pages, include only those that apply:
- **Overview** — what it is, language/stack, how to run it.
- **Architecture** — major modules and how they depend on each other.
- **Entry points & flows** — the request/process flows (lean on \`code-process\` nodes when synced).
- **Key modules** — the most-connected files/classes and what they do.
- **Data model** — schema/tables/types, if the repo has one.
- **Conventions** — notable patterns a new contributor must follow.

Keep it proportional: a small repo may need 3 pages, a large one 6–8.

## Step 3 — Don't duplicate

Before creating anything, \`wiki_search\` / \`wiki_list\` for an existing knowledge-base folder for this repo (e.g. titled "<owner/repo> — Knowledge Base"). If it already exists, STOP and run \`update-wiki\` instead — that refreshes pages in place rather than duplicating the folder.

## Step 4 — Create the linked folder

\`wiki_create\` a **folder** titled \`"<owner/repo> — Knowledge Base"\`. When you found a matching synced codebase in Step 1, pass its id as \`sourceCodebaseId\` so vmem links the folder to the codebase (the web UI shows a "Generated from <repo>" badge). Keep the returned folder id.

## Step 5 — Write the pages (grounded)

For each planned page, \`wiki_create\` a **document** under the folder (\`parentId\` = the folder id) with markdown content. Rules:
- **Ground every claim in the code.** Reference real file paths and symbol names (e.g. \`src/auth/login.ts\`, \`createSession()\`). Never invent files, functions, or behaviour.
- If you are unsure about something, say so or omit it — do not guess.
- Use clear headings, short paragraphs, and code spans for identifiers.
- Prefer linking related pages by name so the knowledge base reads as a connected whole.

## Step 6 — Report

Tell the user the folder you created, the pages written, and whether it was linked to a synced codebase. Suggest running \`update-wiki\` after significant changes to keep the knowledge base current.`;

const UPDATE_WIKI_INSTRUCTIONS = `# update-wiki — Refresh a Codebase Knowledge Base

Bring an existing codebase knowledge base in vmem back in line with the current
code. Use this AFTER the codebase has changed and a knowledge base (built with
\`setup-wiki\`) already exists. Update pages in place — do not rebuild from scratch.
Everything stays in vmem via the wiki tools.

Relevant tools: \`codebases_list\`, \`codebase_overview\` / \`codebase_graph\` / \`codebase_search\` / \`codebase_context\`, \`wiki_list\`, \`wiki_search\`, \`wiki_get\`, \`wiki_update\`, \`wiki_create\`.

## Step 1 — Find the existing knowledge base

1. Determine the repo (\`owner/name\`); \`codebases_list\` to find the matching synced codebase id (if any).
2. \`wiki_search\` / \`wiki_list\` for the knowledge-base folder for this repo (e.g. "<owner/repo> — Knowledge Base"). If there is NONE, stop and tell the user to run \`setup-wiki\` first — this skill only refreshes an existing base.
3. \`wiki_get\` each page in the folder so you know what the base currently claims.

## Step 2 — Find what changed

- If synced: \`codebase_overview\` + \`codebase_graph\` for the current structure and flows; compare against what the pages describe. \`codebase_search\` / \`codebase_context\` to confirm specific symbols still exist.
- If not synced: read the current working tree (README, manifests, entry points, changed areas).
- Identify three buckets: (a) pages whose described files/symbols changed or no longer exist, (b) new modules/flows that have no page yet, (c) pages that are still accurate.

## Step 3 — Update in place

- For each drifted page (bucket a): \`wiki_get\` it, then \`wiki_update\` (mode "replace") with corrected, re-grounded markdown. Keep the parts that are still right.
- For genuinely new areas (bucket b): \`wiki_create\` a new document under the existing folder (\`parentId\` = the folder id).
- If a page describes something that was removed, correct it to reflect reality — never leave stale claims.
- Leave accurate pages (bucket c) untouched.
- Same grounding rule as setup: reference real file paths and symbol names; never invent. If unsure, say so.

## Step 4 — Report

Tell the user which pages you updated, which you added, and anything you flagged as removed or uncertain — and confirm what you left unchanged.`;

const WIKI_WRITEUP_INSTRUCTIONS = `# wiki-writeup — Async learning (read later)

User invokes: \`/wiki-writeup <topic, link, or resource>\` — one line. They want a **wiki
writeup to read later**, not a lecture in chat.

## Know the learner first (do not ask)

Before writing, load the user's context from vmem — **never** prompt them for "your
level" or "what you already know" if this data exists:

1. \`context_prompt_get\` or MCP resource \`vmem://context_prompt\` (profile, preferences,
   pinned memories, portrait, Available Skills index).
2. Optionally \`memory_retrieve\` with the topic/resource as query for relevant prior knowledge.

Calibrate depth, jargon, and skipped prerequisites from that context only. Ask the user
only if context is genuinely empty for the domain.

## vmem tools

- \`skills_get\` with name \`wiki-writeup\` when you need this playbook mid-session.
- \`wiki_search\` (optional) — avoid duplicate titles under \`Learning/\`.
- \`wiki_create\` with \`parentPath: "Learning"\` — full markdown writeup **before** chat reply (server creates \`Learning\` if missing; never omit or the doc lands at wiki root).
- \`wiki_update\` — revise an existing writeup.
- \`memory_add\` (optional) — stub with URL + pointer to wiki doc.

## Teaching rules

1. Fetch or read the resource (WebFetch, pasted text). If unreadable, ask for a paste.
2. Teach step by step — each step a **chapter** in the wiki doc.
3. **Write the entire explainer into wiki at once** via \`wiki_create\` (\`kind: "document"\`, \`parentPath: "Learning"\`, \`contentMarkdown\` = full doc). Do not call \`wiki_create\` without \`parentPath\`.
4. Hard concepts: subdivide + concrete examples.
5. Fix poor source prose; optimize for clarity.

## Wiki doc structure

- **TL;DR**, numbered **Chapters**, **Key takeaways**, **Source** link/citation.

## Chat response

ONLY: wiki title/path, 2-sentence teaser, estimated read time. **No full writeup in chat.**`;

const TEACH_ME_INSTRUCTIONS = `# teach-me — Interactive deep learning

User invokes: \`/teach-me <topic, link, or resources>\` — one line (may include several
links in the message). **Interactive** session: one step per turn, validate before advancing.
Can span days or weeks.

## MANDATORY workflow (do not skip)

1. \`skills_get\` with name \`teach-me\` when you need this playbook mid-session.
2. Read \`context_prompt_get\` or \`vmem://context_prompt\` + optional \`memory_retrieve\` for the topic **before** step 1.
3. **One teaching step per chat turn** — validate understanding before advancing.
4. Checkpoint validated steps to wiki under \`Learning/<topic-slug>/\`.

**Not this skill:** One-shot dumping the full course to wiki or chat — that is \`wiki-writeup\`.

## Know the learner first (do not ask)

Same as \`wiki-writeup\`: \`context_prompt_get\` or \`vmem://context_prompt\` + optional
\`memory_retrieve\` for the topic **before** step 1. Infer presumed knowledge and goals
from vmem — do not ask the user to state their background unless context is empty.

## vmem tools

- \`wiki_list\` / \`wiki_search\` / \`wiki_get\` — course under \`Learning/<topic-slug>/\`.
- \`wiki_create\` with \`parentPath: "Learning/<topic-slug>"\` / \`wiki_update\` — syllabus, validated chapters, progress markers.
- \`memory_add\` (optional) — durable facts after validation.

## Session rules

1. **One step at a time** in chat — never dump the full curriculum.
2. Teach the current step; use examples for subtle points.
3. **Validate** before the next step (explain back, short scenario, or spot-the-error).
4. Weak understanding → re-teach; do not advance.
5. Solid understanding → checkpoint to wiki, then next step.
6. Ground claims in user-supplied resources + fetch where needed; no invented citations.

## Wiki notebook

Folder \`Learning/<topic-slug>/\`: index (syllabus, resources, current step), chapter docs
for each **validated** step only.

## Do NOT

- One-shot the whole course to wiki (that is \`wiki-writeup\`).
- Skip validation on "just continue".
- Save wrong explanations as canonical wiki text.`;

export const SYSTEM_SKILL_SEEDS: SystemSkillSeed[] = [
  {
    name: "setup-wiki",
    category: "Codebases",
    description:
      "Build an adaptive, source-grounded knowledge base for a codebase as a linked wiki inside vmem (a folder of pages), using vmem's codebase and wiki tools.",
    instructions: SETUP_WIKI_INSTRUCTIONS,
    previousNames: ["Codebase Knowledge Base"],
  },
  {
    name: "update-wiki",
    category: "Codebases",
    description:
      "Refresh an existing codebase knowledge base in vmem — update pages to match the current code, add missing areas, and correct stale content in place.",
    instructions: UPDATE_WIKI_INSTRUCTIONS,
  },
  {
    name: "wiki-writeup",
    category: "Learning",
    description:
      "/wiki-writeup <topic> — chapter-style wiki explainer in Learning/ to read later; chat = path + 2-sentence teaser only.",
    instructions: WIKI_WRITEUP_INSTRUCTIONS,
    previousNames: ["writeup", "read-quick-dont-validate"],
  },
  {
    name: "teach-me",
    category: "Learning",
    description:
      "/teach-me <topic> — interactive tutor: one step per turn, validate before advancing; checkpoint progress to Learning/ wiki. Not one-shot wiki-writeup.",
    instructions: TEACH_ME_INSTRUCTIONS,
    previousNames: ["validate-my-understanding-and-teach-me"],
  },
];
