// shipped catalog seeds for the skills hub

export interface SystemSkillSeed {
  name: string;
  description: string;
  instructions: string;
  category?: string;
  // former names of this seed
  previousNames?: string[];
}

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
