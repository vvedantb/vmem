# Raven and vmem: what to borrow

This note compares Raven with vmem and records which Raven ideas vmem adopted.

- **Raven:** [EverMind-AI/Raven](https://github.com/EverMind-AI/Raven), commit `b27126e`, shallow clone taken on 26 September 2026. Paths below are relative to that clone.
- **vmem:** paths are relative to this repo.

## Summary

Raven is an agent operating system. It has a host agent that delegates work, a DAG runner, four pluggable strategy modules, a per-turn context assembler, a skills forge, and two self-improvement loops.

vmem is a memory product. It stores a personal or team memory graph, ranks it with hybrid retrieve plus the Jev rerank, consolidates it with Dream Mode, and serves it through MCP, HTTP and the SDK. It does not run agents.

Most of Raven is therefore out of scope. Two ideas map well onto vmem's own surfaces:

1. **Per-turn context assembly** became a new MCP tool, `context_pack`. It returns one bundle with task memories, fitting skills and the profile, sized to a character budget.
2. **Curator feedback** became a change to Dream Mode. When a user rejects a merge, later Dream runs remember that decision.

## Raven concepts and their fit

| Raven concept                                    | Where in Raven                                                                                     | Fit for vmem                  | Notes                                                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context Assembler (segments plus a token budget) | `raven/context_engine/assembler.py`, `raven/contracts/assembled.py`                                | **Relevant, adopted**         | Each turn's window is built from ordered segments (identity, bootstrap, memory, skills, then history) against a `TokenBudget`. vmem's agents chain three calls instead. |
| Harness Curator and the Analyst feedback loop    | `experimental/curator/`, `experimental/analyst/feedback.py`, `experimental/iteration/protocols.py` | **Relevant in part, adopted** | Pass/fail signals drive a change only after it passes a check. vmem already has a human verdict (Inbox approve or reject) but threw rejections away.                    |
| Evolver promotion gates                          | `evolver/orchestrator/gates/strategies.py`                                                         | Idea only                     | Promote a change only if it beats the baseline. vmem's labelled IR evals (`eval:bench`, `eval:jev`) already do this offline. The tree is marked for retirement.         |
| Memory strategy protocol                         | `raven/contracts/harness.py` (`MemoryModule`), `experimental/curator/harness/strategies/`          | Deferred                      | Raven builds only its default at runtime (`raven/agent/loop/main.py`). vmem has one retrieve path and a strict Jev policy, so a plug-in layer adds surface for no user. |
| Long-term memory backend and store queue         | `raven/contracts/memory.py`, `raven/memory_engine/store_pipeline.py`                               | Already covered               | vmem already writes off-turn, with scheduled embedding, entity extraction and context prompt refresh (`convex/memoryRuntime.ts`).                                       |
| SkillForge (rank fusion over several sources)    | `raven/memory_engine/skill_forge/`                                                                 | Deferred                      | vmem has one skill store per grant. `skills_recommend` (lexical, then Jev) already covers the "pull" menu.                                                              |
| Skill extraction from turns                      | `ExtractionConfig` only                                                                            | Out of scope                  | Config exists; no implementation was found in the tree. vmem already lets agents call `skills_create`.                                                                  |
| Context Curator (LLM plan for history)           | `raven/context_engine/segments/curator.py`                                                         | Out of scope                  | vmem does not own the host's chat history.                                                                                                                              |
| Host Agent, DAG runner, playbooks                | `raven/agent/subagent/dag_tool.py`, `raven/playbook/`                                              | Out of scope                  | Agent orchestration, not memory.                                                                                                                                        |
| Personas                                         | README only                                                                                        | Out of scope                  | No `Persona` type exists in code. vmem profiles already give separate memory spaces.                                                                                    |
| Research, Code, Design and Oncall agents         | `agents/raven-research/`, `agents/raven-code/`, `agents/raven-design/`, `agents/raven-oncall/`     | Out of scope                  | These are agent products. vmem should serve them memory, not become them.                                                                                               |

## What was built and why

### 1. `context_pack` MCP tool

**Problem.** An agent that wants full vmem context must call `context_prompt_get`, then `memory_retrieve`, then `skills_recommend`. The skills index in `packages/shared/src/prompts/memoryRagPrompt.ts` asks for this. Each call costs a round trip and tokens. Hosts often skip steps, so agents miss task memories or skills. The profile also repeats the full skills index, which is not specific to the task.

**Raven idea.** `ContextAssembler` builds one window from ordered segments against a fixed budget, so the model gets a predictable, bounded context each turn.

**vmem version.**

- `packages/backend/engine/memory/contextPack.ts` is a pure function. It fills three sections in priority order until `maxChars`:
  1. task memories, with id, type and the Context Trace reason;
  2. suggested skills;
  3. the profile, without its generic skills index.
- The top memory always ships, so a tight budget never empties the pack.
- `memoryIds`, `skillNames`, `includesProfile` and `truncated` tell the agent exactly what it received.
- `packages/backend/convex/mcp/toolsContext.ts` runs the three existing reads in parallel.
  - Memories use `retrieveMemoriesForClerk` or `retrieveMemoriesForTeamProfile`. Jev is on by default, fails open, and does not hard-drop.
  - Skills use `recommendSkills`.
  - The profile uses the cached `mcpGetContextPrompt`, on the personal connector only.
- If the skills or profile read fails, that section is left out and the pack still returns.
- There is no new LLM call, provider, table or index.

**Why this is a strong win.** The tool cuts three round trips to one for every agent session, on both connectors. It changes no ranking behaviour, so it carries little risk. It also gives hosts a single budget control.

### 2. Dream Mode remembers rejected merges

**Problem.** Dream Mode clusters near-duplicate memories and writes a merge proposal for each cluster. It only checked for overlapping **pending** proposals (`hasOverlappingPendingProposal`). A merge the user **rejected** left both memories active. The next Dream run then:

- re-proposed the same merge, which is Inbox noise;
- could auto-accept it when auto-accept is on and Jev, or its fail-open path, marked it safe. This overrode an explicit user decision;
- used one of the eight cluster slots per run (`DEFAULT_MERGE_CLUSTERS`), so repeated rejections could stop new merges from surfacing.

**Raven idea.** The Curator and Analyst treat evaluator verdicts as signals that decide the next change. The user's Inbox verdict is vmem's strongest quality signal for Dream.

**vmem version.**

- `listRejectedDreamMergeSourceSets` (`packages/backend/convex/proposedUpdateStore.ts`) reads rejected `dream-mode` merges through the existing `by_profile_status` index.
- `clusterNearDuplicateMemories` (`packages/backend/engine/memory/clusters.ts`) takes `rejectedSourceSets`. It skips a cluster whose memories all sit inside one rejected set. The check runs **before** the cluster limit.
- Both Dream paths apply the same filter, so Jev decisions and the mutation pass see the same clusters. These are the action path (`runDreamPassForProfile`) and the mutation path (`runDreamPassInternal`).
- A cluster comes back once a new memory joins it. The situation has changed, so the user sees it again.

**Why this is a strong win.** It fixes a real way to override user consent. It uses one existing index and adds no schema change. It is independent of Jev: Jev still annotates every cluster Dream considers, and never skips a proposal. This change filters on the user's decision only.

## Deferred, and why

| Item                                                                                      | Reason                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retrieve feedback signals (agent marks a hit helpful or unhelpful) as a ranking input     | Needs a new table, a write path on every surface, and a ranking weight. Using the signal to demote or drop hits risks the Jev policy (always-on rerank, fail-open, no hard-drop). Worth doing only with a labelled eval showing a gain. Log-only capture is the safe first step. |
| Pluggable memory strategy hooks                                                           | Raven builds only its default strategy at runtime. vmem has one retrieve path, and hooks would add surface with no second caller.                                                                                                                                                |
| `context_pack` on HTTP and the SDK                                                        | MCP is the agent surface that needs it first. HTTP and SDK callers can already compose retrieve and skills. Add it if a client asks.                                                                                                                                             |
| Token-accurate budgets                                                                    | The pack uses characters, as the rest of vmem does (`RECENT_CONTENT_CHAR_CAP`, `truncateAtWord`). A tokenizer would add a dependency and be tied to one model.                                                                                                                   |
| Skill usage and quality scoring (a SkillForge-style Curator)                              | Raven itself states that skills have "no feedback-driven evolution or versioning" (`CONTEXT.md`, line 1159). vmem already has skill versions (`convex/skillVersions.ts`). Scoring needs usage events that vmem does not collect yet.                                             |
| Multi-source connector orchestration                                                      | Notion and Google Drive sync already run through the Convex workpool and workflow (`convex/connectors/`). No Raven pattern improves this without a larger rewrite.                                                                                                               |
| Undoing a rejection                                                                       | A rejected merge now stays hidden until its cluster changes. If users ask to "show it again", reopening the proposal in the Inbox is the simplest fix.                                                                                                                           |
| Host agent, DAG, personas, Research, Code, Design and Oncall agents, full Curator service | Explicitly out of scope. vmem is the memory layer these agents would call, not an agent runtime.                                                                                                                                                                                 |

## Tests

- `packages/backend/tests/memory/contextPack.test.ts` covers section order, removal of the profile's skills index, the budget limit, keeping the top hit, and empty results.
- `packages/backend/tests/mcp/contextPack.test.ts` runs the in-process MCP tool. It covers the personal pack, the team pack without a profile, `skillLimit: 0`, and input validation.
- `packages/backend/tests/memory/clusters.test.ts` covers skipping rejected clusters before the limit, re-proposing when a new memory joins, and `isRejectedMerge`.
- `packages/backend/convex/proposedUpdates.test.ts` (convex-test) rejects a merge, then re-runs Dream with auto-accept on. It checks that there is no new proposal and no materialised merge.
