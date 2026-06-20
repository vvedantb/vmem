/**
 * Shipped catalog seeds for the Skills Hub. `seedSystemSkillsInternal`
 * idempotently upserts these by name. Editing the text here and re-running
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
}

const CODEBASE_KNOWLEDGE_BASE_INSTRUCTIONS = `# Codebase Knowledge Base

Build a living, source-grounded knowledge base for the current codebase as a
**wiki inside vmem** — one folder of linked pages. Everything is stored in vmem
via the wiki tools; nothing is written to the repo or to GitHub.

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

## Step 3 — Re-run safely (idempotent)

Before creating anything, \`wiki_search\` / \`wiki_list\` for an existing knowledge-base folder for this repo (e.g. titled "<owner/repo> — Knowledge Base"). If it exists, UPDATE its pages with \`wiki_update\` (mode "replace") instead of creating a duplicate folder. Only create pages that are missing.

## Step 4 — Create the linked folder

\`wiki_create\` a **folder** titled \`"<owner/repo> — Knowledge Base"\`. When you found a matching synced codebase in Step 1, pass its id as \`sourceCodebaseId\` so vmem links the folder to the codebase (the web UI shows a "Generated from <repo>" badge). Keep the returned folder id.

## Step 5 — Write the pages (grounded)

For each planned page, \`wiki_create\` a **document** under the folder (\`parentId\` = the folder id) with markdown content. Rules:
- **Ground every claim in the code.** Reference real file paths and symbol names (e.g. \`src/auth/login.ts\`, \`createSession()\`). Never invent files, functions, or behaviour.
- If you are unsure about something, say so or omit it — do not guess.
- Use clear headings, short paragraphs, and code spans for identifiers.
- Prefer linking related pages by name so the knowledge base reads as a connected whole.

## Step 6 — Report

Tell the user the folder you created or updated, the pages written, and whether it was linked to a synced codebase. Suggest re-running this skill after significant changes to keep the knowledge base current.`;

export const SYSTEM_SKILL_SEEDS: SystemSkillSeed[] = [
  {
    name: "Codebase Knowledge Base",
    category: "Codebases",
    description:
      "Build an adaptive, source-grounded knowledge base for the current codebase as a linked wiki inside vmem (a folder of pages), using vmem's codebase and wiki tools.",
    instructions: CODEBASE_KNOWLEDGE_BASE_INSTRUCTIONS,
  },
];
