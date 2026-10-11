// shipped catalog seeds for the skills hub

export interface SystemSkillSeed {
  name: string;
  description: string;
  instructions: string;
  category?: string;
  // former names of this seed
  previousNames?: string[];
  // always appears in MCP / context_prompt Available Skills, even if not installed
  alwaysInclude?: boolean;
}

const WIKI_WRITEUP_INSTRUCTIONS = `# wiki-writeup — Async learning (read later)

User invokes: \`/wiki-writeup <topic, link, or resource>\` — one line. They want a **written
note to read later** in Verve, not a lecture in chat.

## Know the learner first (do not ask)

Before writing, load the user's context from vmem — **never** prompt them for "your
level" or "what you already know" if this data exists:

1. \`context_prompt_get\` or MCP resource \`vmem://context_prompt\` (profile, preferences,
   pinned memories, portrait, Available Skills index).
2. Optionally \`memory_retrieve\` with the topic/resource as query for relevant prior knowledge.

Calibrate depth, jargon, and skipped prerequisites from that context only. Ask the user
only if context is genuinely empty for the domain.

## Tools

vmem:

- \`skills_get\` with name \`wiki-writeup\` when you need this playbook mid-session.
- \`memory_add\` (optional) — stub with URL + pointer to the Verve page.

Verve MCP (notes live here, not in vmem):

- \`search_pages\` (optional) — avoid duplicate titles under \`Learning/\`.
- \`create_folder\` — create \`Learning\` if it is missing.
- \`create_page\` — full markdown writeup in \`Learning/\` **before** chat reply.
- \`update_page\` / \`append_to_page\` — revise or extend an existing writeup.

## Teaching rules

1. Fetch or read the resource (WebFetch, pasted text). If unreadable, ask for a paste.
2. Teach step by step — each step a **chapter** in the page.
3. **Write the entire explainer into Verve at once** with \`create_page\` under \`Learning/\`. Never create the page at the Verve root.
4. Hard concepts: subdivide + concrete examples.
5. Fix poor source prose; optimize for clarity.

## Page structure

- **TL;DR**, numbered **Chapters**, **Key takeaways**, **Source** link/citation.

## Chat response

ONLY: Verve page title/path, 2-sentence teaser, estimated read time. **No full writeup in chat.**`;

const TEACH_ME_INSTRUCTIONS = `# teach-me — Interactive deep learning

User invokes: \`/teach-me <topic, link, or resources>\` — one line (may include several
links in the message). **Interactive** session: one step per turn, validate before advancing.
Can span days or weeks.

## MANDATORY workflow (do not skip)

1. \`skills_get\` with name \`teach-me\` when you need this playbook mid-session.
2. Read \`context_prompt_get\` or \`vmem://context_prompt\` + optional \`memory_retrieve\` for the topic **before** step 1.
3. **One teaching step per chat turn** — validate understanding before advancing.
4. Checkpoint validated steps to Verve pages under \`Learning/<topic-slug>/\`.

**Not this skill:** One-shot dumping the full course to Verve or chat — that is \`wiki-writeup\`.

## Know the learner first (do not ask)

Same as \`wiki-writeup\`: \`context_prompt_get\` or \`vmem://context_prompt\` + optional
\`memory_retrieve\` for the topic **before** step 1. Infer presumed knowledge and goals
from vmem — do not ask the user to state their background unless context is empty.

## Tools

Verve MCP (course notes):

- \`search_pages\` — find the course under \`Learning/<topic-slug>/\`.
- \`create_folder\` — create \`Learning/<topic-slug>\` on the first checkpoint.
- \`create_page\` — syllabus and each validated chapter.
- \`update_page\` / \`append_to_page\` — progress markers and new chapters.

vmem:

- \`memory_add\` (optional) — durable facts after validation.

## Session rules

1. **One step at a time** in chat — never dump the full curriculum.
2. Teach the current step; use examples for subtle points.
3. **Validate** before the next step (explain back, short scenario, or spot-the-error).
4. Weak understanding → re-teach; do not advance.
5. Solid understanding → checkpoint to Verve, then next step.
6. Ground claims in user-supplied resources + fetch where needed; no invented citations.

## Verve notebook

Folder \`Learning/<topic-slug>/\`: index (syllabus, resources, current step), chapter pages
for each **validated** step only.

## Do NOT

- One-shot the whole course to Verve (that is \`wiki-writeup\`).
- Skip validation on "just continue".
- Save wrong explanations as canonical notes.`;

const SEARCH_SKILLS_FIRST_INSTRUCTIONS = `# search-skills-first — Look up the matching playbook before acting

At the **start of a task** (and whenever the work changes), search the skills library before improvising.

## Workflow

1. Call \`skills_recommend\` with a short task/query string when that tool is available. Otherwise call \`skills_list\`.
2. If a returned skill's description matches the task, call \`skills_get\` with that **exact name** and follow its markdown instructions.
3. Enabled skills are also MCP resources at \`vmem://skills/<name>\` (same markdown). Prefer tools mid-chat if the host cannot re-read resources.
4. Do **not** bulk-load every playbook — do not \`skills_get\` the whole index, and do not paste every skill body into context.

## After lookup

- Matching playbook loaded → follow it.
- No match → proceed normally. Use \`skills_create\` only for a repeatable gap after checking the index.

## Notes

- Available Skills in \`vmem://context_prompt\` / \`context_prompt_get\` is an index (name + description), not full instructions.
- Personal \`/mcp\` and team \`/mcp/team\` each see only skills granted to that connector.
`;

export const RETIRED_SYSTEM_SKILL_NAMES = [
  "setup-wiki",
  "update-wiki",
  "Codebase Knowledge Base",
] as const;

export const SYSTEM_SKILL_SEEDS: SystemSkillSeed[] = [
  {
    name: "wiki-writeup",
    category: "Learning",
    description:
      "/wiki-writeup <topic> — chapter-style explainer written to Verve under Learning/ to read later; chat = path + 2-sentence teaser only.",
    instructions: WIKI_WRITEUP_INSTRUCTIONS,
    previousNames: ["writeup", "read-quick-dont-validate"],
  },
  {
    name: "teach-me",
    category: "Learning",
    description:
      "/teach-me <topic> — interactive tutor: one step per turn, validate before advancing; checkpoint progress to Verve pages under Learning/. Not one-shot wiki-writeup.",
    instructions: TEACH_ME_INSTRUCTIONS,
    previousNames: ["validate-my-understanding-and-teach-me"],
  },
  {
    name: "search-skills-first",
    category: "Meta",
    alwaysInclude: true,
    description:
      "At task start: skills_recommend (or skills_list), then skills_get for matching names. Do not bulk-load every playbook.",
    instructions: SEARCH_SKILLS_FIRST_INSTRUCTIONS,
  },
];
