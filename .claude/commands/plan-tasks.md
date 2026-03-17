---
description: Use when the user wants to plan and queue multiple tasks for overnight Eva execution through a conversational session. Triggers on "plan tasks", "let's queue some tasks", "set up overnight work", or starting a task planning session.
---

# Plan Tasks Session

Start a conversational task-planning session. The user brings issues one at a time; for each, discuss → plan → create task via Eva. Goal: end session with multiple queued tasks ready for overnight execution.

## Session Start

1. Launch 1-2 Explore agents to understand the codebase: architecture, key patterns, file structure, shared components, data layer. This context is reused for ALL tasks in the session.
2. Resolve the repo name using `mcp__claude_ai_Eva__list_repos` once upfront.
3. Tell the user: "Ready. Bring your first issue."
4. Track task count internally. After each task is created, report: "Task N created. [title]. What's next?"

## Per-Issue Flow

```dot
digraph per_issue {
  rankdir=TB;
  node [shape=box];

  discuss [label="1. Discuss: Understand the issue"];
  assess [label="2. Assess: Simple or complex?"];
  quick [label="3a. Quick plan:\n2-3 sentences + approach"];
  deep [label="3b. Deep plan:\nFile paths, specs,\nreference patterns"];
  confirm [label="4. Confirm plan with user"];
  write [label="5. Write task prompt"];
  create [label="6. Create task via Eva"];
  next [label="7. Report + await next issue"];

  discuss -> assess;
  assess -> quick [label="simple"];
  assess -> deep [label="complex"];
  quick -> confirm;
  deep -> confirm;
  confirm -> confirm [label="revisions"];
  confirm -> write [label="agreed"];
  write -> create;
  create -> next;
}
```

### 1. Discuss

Ask clarifying questions until the issue is fully understood:

- What's the problem / what needs to happen?
- Where in the app does this live?
- Any constraints or dependencies?
- Is this frontend, backend, or both?

### 2. Assess Complexity

**Simple** (quick plan): config change, small bug fix, straightforward feature addition, copy/style tweak
**Complex** (deep plan): new feature with multiple components, architectural change, cross-cutting concern, anything touching 3+ files

### 3. Plan

**Quick**: 2-3 sentence description + approach. Reference relevant files from the upfront exploration.

**Deep**: Include file paths, behavioral specs, reference patterns, skills to invoke, "Do NOT" constraints — similar to create-eva-tasks prompt quality.

### 4. Confirm

Present the plan to the user. Revise until they agree. Do NOT create the task until the user confirms.

### 5. Write Task Prompt

The task prompt must be **self-contained** — the executing agent has no prior context.

Every task prompt includes:

- What to do and why
- Relevant file paths from the upfront exploration
- Approach agreed in discussion
- Reference files / patterns to follow
- Constraints from CLAUDE.md (no `any`, no `as`, no comments, etc.)
- Skills to invoke if applicable

### 6. Create Tasks

**Two modes — choose based on whether tasks are related:**

**Related tasks (same feature/initiative):** Use `mcp__claude_ai_Eva__create_tasks_batch` with:

- `projectTitle`: Groups tasks under a named project — **ask the user first** whether they want a project and what to call it
- `dependsOn`: Array of 0-based indices for task dependencies
- `tasks`: Array of `{ title, description, dependsOn? }`

```
mcp__claude_ai_Eva__create_tasks_batch({
  repoName: "...",
  app: "...",
  baseBranch: "...",
  projectTitle: "Project Name",  // only if user confirms
  tasks: [
    { title: "...", description: "..." },
    { title: "...", description: "...", dependsOn: [0] },
  ]
})
```

**Unrelated tasks (separate issues):** Use `mcp__claude_ai_Eva__create_task` individually as each issue is confirmed. No project grouping needed.

**When to prompt the user:** If the session produces 2+ tasks that share a theme (same feature, same area of the app, dependencies between them), ask: "These tasks are related — want me to group them under a project? If so, what should I call it?" Do NOT assume — let the user decide.

### 7. Report + Next

Print: **"Task [N] created: [title]. What's next?"**

If user says done / no more / that's it → print session summary:

```
Session complete. Project "[name]" created with [N] tasks:
1. [title]
2. [title] (depends on #1)
...
Ready for overnight execution.
```

## Rules

- Never create a task without user confirmation on the plan
- Never skip the upfront codebase exploration
- Reuse codebase context across all issues — don't re-explore unless user mentions a part of the codebase not covered
- Keep the conversation natural — this is a chat, not a rigid form
- Adapt plan depth to complexity — don't over-specify simple tasks
- Use `create_tasks_batch` with `projectTitle` only when the user confirms they want a project grouping
- Use individual `create_task` for unrelated standalone issues
- Always prompt the user before grouping tasks into a project
- Set `dependsOn` for tasks that require prior tasks to complete first
