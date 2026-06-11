# Dynamic Dreaming — Dream Mode V3

## Context

Current Dream Mode V2 is exactly the "cron job, fixed timer" the supermemory blog post criticises: opt-in daily cron at fixed HH:MM + manual button (1/hr), fixed depth (top 10 anomalies, 7d window), synthesis kinds insight/connection/contradiction/anomaly via proposals queue. Already matches the blog on grounding (validated `sourceMemoryIds`, `:DERIVED_FROM` edges) and instant queryability (vmem ingests immediately; dreaming is additive).

Gaps vs blog: (1) no dynamic trigger ("user went quiet / context piled up"), (2) no adaptive depth, (3) no reconsolidation — no merge, confidence frozen at write, contradictions dismiss-only (`TODO(V2 contradiction)` in `proposals.ts:455`), (4) isolated seeds with <2 graph neighbours are skipped entirely (`runProfile.ts:191`) — the opposite of "isolated memories find their neighbors", (5) no evolving user portrait, (6) no "will be dreamt on" UI.

User decisions: all 4 scopes in; Automatic mode default with optional daily schedule kept; reweighting auto-applied with audit trail; portrait per profile.

---

## Part 1 — Dynamic trigger + adaptive depth

**New table `dreamTriggerState`** (fields as `dreamTriggerStateFields` in `validators.ts`, used in `schema.ts`, index `by_user`):
`userId: v.id("users")`, `newMemoryCount: number`, `lastWriteAt: number`, `checkPending: boolean`, `lastAutoRunAt?: number`, `runsToday: number`, `dayKey: string` (UTC "YYYY-MM-DD").

**Pure decision fn** — new `convex/lib/dreamTriggerDecision.ts` (no ctx, unit-testable):
`decideDreamCheck(state, automaticEnabled, now) → { action: "run", depth } | { action: "reschedule", delayMs } | { action: "stop" }`

- Guards first: automatic off → stop. `now - lastAutoRunAt < MIN_GAP_MS` or `runsToday >= DAILY_CAP` → stop (counter persists; next write re-arms).
- `newMemoryCount >= PILE_THRESHOLD` → run (blog: "or when enough new context has piled up").
- Still writing (`now - lastWriteAt < QUIET_MS`) → reschedule for `lastWriteAt + QUIET_MS - now`.
- Quiet + `newMemoryCount >= MIN_NEW` → run; else stop.
- Depth from count: `<10` light, `10–25` standard, `>25` deep.

Constants: `QUIET_MS` 30 min, `MIN_NEW` 5, `PILE_THRESHOLD` 25, `MIN_GAP_MS` 2h, `DAILY_CAP` 4.

**State mutations** — new `convex/dreamTrigger.ts` (Convex runtime):

- `bumpActivityByClerkIdInternal(clerkId)`: upsert state (count+1, lastWriteAt=now; reset runsToday on new dayKey). Returns true when caller should schedule a check (automatic on — `userSettings.dreamModeAutomatic ?? true` — and `!checkPending` and count ≥ MIN_NEW); sets `checkPending` when returning true. Mirrors `contextPromptCache.markPendingByClerkIdInternal`.
- `getStateInternal`, `clearPendingInternal`, `consumeRunInternal` (reset count, stamp lastAutoRunAt, runsToday+1, checkPending=false).

**Write hook** — new `convex/lib/dreamTriggerInvalidate.ts` `scheduleDreamTriggerCheck(ctx, clerkId)` (mirrors `contextPromptInvalidate.ts`): runMutation bump → if true, `ctx.scheduler.runAfter(QUIET_MS, internal.neo4jActions.dreamMode.maybeRunDreamInternal, { clerkId })`. Call it next to `scheduleContextPromptInvalidation` in:

- `convex/neo4jActions/_memories/create.ts` `schedulePostCreate` (line ~248)
- `convex/neo4jActions/_memories/update.ts` (~line 81)
- `convex/neo4jActions/connectorData.ts` (~line 21)
  Do NOT hook delete (deleting isn't new context). Skip the bump for memories with `source === 'dream-mode'` (dream output must not re-trigger dreaming).

**Check action** — `maybeRunDreamInternal` in `convex/neo4jActions/dreamMode/entryPoints.ts`: resolve userId + settings, read state, call `decideDreamCheck`. "reschedule" → `scheduler.runAfter(delayMs, self)`. "run" → `consumeRunInternal` then `runDreamForUserInternal({ depth })`. "stop" → `clearPendingInternal`.

**Adaptive depth plumbing** — `convex/neo4jActions/dreamMode/runProfile.ts`:

- `DreamDepth = "light" | "standard" | "deep"`; optional `depth` arg on `runDreamForProfileInternal` + `runDreamForUserInternal` (default "standard" — manual button + daily cron unchanged).
- Per-depth params replace constants: `topAnomalies` 5/10/15, `mergeClusters` 2/4/6 (Part 2).
- Candidate window: replace fixed `RECENT_WINDOW_MS` 7d with `since = max(lastDreamRunAt, now - 30d)` (fallback 7d when never dreamt) — each memory is dream-seed once; still reachable later as cluster neighbour.

**Settings field**: add `dreamModeAutomatic: v.optional(v.boolean())` to `userSettings` schema fields + `userSettings.ts` defaults (`true`)/get/update. No migration (optional). Existing scheduled crons untouched.

---

## Part 2 — Reconsolidation

**a. Semantic neighbours for isolated seeds** — `engine/neo4j/memory/dreamMode.ts` `fetchAnomalyCluster`: when graph cluster < 4 members, augment with top-k vector neighbours (`db.index.vector.queryNodes`, same-user, status active/pinned, excluding members, cos ≥ 0.55, any age — this is the cross-time "dots without wires" path) with new relation `"semantic"`. Pass seed embedding in (already fetched in the recent pool). Add `"semantic"` to `DreamClusterMember.relation` union + one prompt line in `dreamPrompt.ts` explaining it. Keep the `< 2 → skip` check only if still alone after augmentation.

**b. Merge kind** — new `ProposedUpdateKind` `"merge"`:

- Detection is separate from surprisal (near-dupes are LOW surprisal): new `findMergeCandidates(driver, { userId, profileId, sinceMs, simThreshold, maxClusters, maxClusterSize })` in `engine/neo4j/memory/dreamMode.ts` — for each new-window memory, vector kNN within profile at cos ≥ `MERGE_SIM` 0.88; union overlapping pairs into clusters (≤5 members); exclude `pinned`. Cap clusters per depth (2/4/6).
- LLM: `buildMergeSynthesisPrompt(cluster)` + parser in `engine/neo4j/dreamPrompt.ts` → `{ title, content, sourceMemoryIds, confidence }` consolidated memory (or skip). Same id-validation as existing parser.
- Always a proposal — never auto-accepted even with `dreamModeAutoAccept` (supersedes sources = consequential). Reuse `createSynthesisProposal` with kind "merge"; existing `hasOverlappingPendingProposal` dedup applies.
- Approve — new `applyMergeApproval` in `engine/neo4j/memory/proposals.ts` (`resolveProposal` switch case): create consolidated `:Memory` (source 'dream-mode') + `:DERIVED_FROM` edges (like `applySynthesisApproval`), then each source: `status = 'suppressed'` + `(src)-[:SUPERSEDED_BY]->(new)` + `logEvent`. No hard delete — lifecycle/audit philosophy. Caller (`proposedUpdateApi`) already backfills embedding + schedules enrichment for materialized synthesis — verify merge takes the same path.
- Update kind unions: `engine/neo4j/memory/types.ts` (`ProposedUpdateKind`, `ALL_PROPOSED_UPDATE_KINDS`, doc comment), `convex/proposedUpdateApi.ts` validator, `convex/mcp/schemas.ts` if proposals kinds are enumerated there, `apps/web/src/hooks/useProposals.ts`.

**c. Contradiction pick-winner** (closes the existing TODO):

- `resolveProposal(driver, proposalId, action, winnerMemoryId?)` — kind `contradiction` + approve + valid `winnerMemoryId ∈ sourceMemoryIds`: winner `confidence = min(1, c + 0.1)`; each loser `status = 'suppressed'` + `logEvent('contradiction_resolved')`. Approve without winner → current dismiss-only behaviour (back-compat).
- Plumb optional `winnerMemoryId` through `convex/proposedUpdateApi.ts` resolve mutation/action (and MCP proposal tool if one exists — check `convex/mcp/` during implementation).

**d. Confidence reweighting** (auto-apply + audit, zero extra LLM calls):

- Extend the existing synthesis JSON contract in `dreamPrompt.ts` with optional `confidenceAdjustments: [{ memoryId, newConfidence, reason }]` — the model may reweight cluster members it sees anyway ("temper overconfident, boost corroborated"). Parser: ids must be ⊆ cluster, confidence clamped [0.05, 1].
- New `applyConfidenceAdjustments(driver, { userId, adjustments })` in `engine/neo4j/memory/dreamMode.ts`: per memory, clamp `|new − current| ≤ REWEIGHT_MAX_DELTA` 0.2, skip `pinned`, `SET m.confidence`, `logEvent('confidence_reweighted', 'dream-mode', { old, new, reason })`.
- Apply in `runProfile.ts` after each synthesis parse (regardless of proposal/skip outcome). Add `reweighted` count to `DreamRunResult`.

---

## Part 3 — Evolving portrait (per profile)

- Fields on `profileFields` (`validators.ts`): `dreamPortrait?: v.string()`, `dreamPortraitUpdatedAt?: v.number()`, `dreamPortraitSources?: v.array(v.string())` (memory ids — grounding, per blog "if it can't show its work, it doesn't get to claim the thought").
- New `engine/neo4j/portraitPrompt.ts`: `buildPortraitUpdatePrompt(currentPortrait | null, evidence)` → revised markdown portrait ≤ ~1500 chars + `sourceMemoryIds` + parse fn. Incremental ("update this portrait given new evidence"), not regenerate-from-scratch — the blog's "evolving picture". Evidence query (one Cypher in `engine/neo4j/memory/dreamMode.ts`): top ~30 profile memories by confidence + recency + pinned-first, plus this run's syntheses.
- End of `runDreamForProfileInternal`: when the run produced any output OR portrait older than 7d, one LLM call (new feature literal `"dream-portrait"` in the `validators.ts` openRouterCallLog feature union), then patch profile via new internal mutation in `convex/profiles.ts`, then `scheduleContextPromptInvalidationByClerkId` so MCP picks it up.
- Injection: `convex/contextPromptActions.ts` prompt builder — new "Inferred portrait" section after the aboutMe section (~line 173), explicitly marked AI-inferred.
- UI: read-only portrait card on the profile page (sources count + "last dreamt" timestamp).

---

## Part 4 — UI

- **Settings** `apps/web/src/routes/_main/settings/preferences.tsx` Dream Mode section: mode Select — Off / Automatic (default) / Daily at time (existing time picker shown only for Daily). Writes `dreamModeAutomatic` + existing `setDreamSchedule`. Keep auto-accept toggle; add "Last dreamt: X ago" from `api.userSettings.get().lastDreamRunAt`.
- **Dreaming indicator**: moon icon on memory list rows + detail header when `memory.createdAt > lastDreamRunAt` (tooltip "Will be considered in the next dream"). Client-side compare only — no backend change.
- **Proposal cards** `apps/web/src/components/proposals/SynthesisProposalCard.tsx`: merge variant (consolidated preview + "replaces N memories" sources panel); contradiction variant gains per-source "Keep this one" buttons → resolve with `winnerMemoryId` (plain Dismiss stays).
- Mobile `DreamModeCard`: add Automatic toggle (small parity change).

---

## Cost guardrails

Per auto run ≤ topAnomalies + mergeClusters + 1 portrait calls (light ~8, deep ~22 LLM calls). Bounded by DAILY_CAP 4 auto runs/day + MIN_GAP 2h + soft-fail when no `OPENROUTER_API_KEY` (existing behaviour). Manual button rate limit unchanged.

## Files

New: `convex/dreamTrigger.ts`, `convex/lib/dreamTriggerDecision.ts`, `convex/lib/dreamTriggerInvalidate.ts`, `engine/neo4j/portraitPrompt.ts`, `tests/dreamTriggerDecision.test.ts`, `tests/dreamPrompt.test.ts` additions (merge + adjustments parsing).
Modified (backend): `validators.ts`, `schema.ts`, `userSettings.ts`, `_memories/create.ts`, `_memories/update.ts`, `connectorData.ts`, `neo4jActions/dreamMode/runProfile.ts`, `neo4jActions/dreamMode/entryPoints.ts`, `engine/neo4j/memory/dreamMode.ts`, `engine/neo4j/dreamPrompt.ts`, `engine/neo4j/memory/proposals.ts`, `engine/neo4j/memory/types.ts`, `proposedUpdateApi.ts`, `contextPromptActions.ts`, `profiles.ts`, `mcp/schemas.ts` (if kinds enumerated).
Modified (web): `settings/preferences.tsx`, `SynthesisProposalCard.tsx`, `useProposals.ts`, memories list row + detail header, profile page. Mobile: `DreamModeCard.tsx`.

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable`; `npx tsc` in apps/web.
2. Unit (vitest, `pnpm test` in packages/backend): `decideDreamCheck` matrix (quiet/active/pile-up/caps/gap/day-rollover), merge prompt parse, adjustment clamp + pinned skip, portrait parse.
3. Visual E2E (dev deployment, temporarily lower QUIET_MS to 60s + MIN_NEW to 2): save 3 memories from web → go quiet → watch Convex logs `[dream]` → proposals (incl. merge) appear in inbox; resolve a contradiction picking a winner → loser suppressed in list; portrait card appears on profile; moon badges on fresh memories disappear after the run; settings mode select round-trips; confirm dream-mode memories don't re-trigger (no run loop).

## Resolved decisions (user-confirmed)

1. Constants as specified (quiet 30 min, min 5 new memories, pile-up 25, gap 2h, cap 4/day, merge sim 0.88, reweight max Δ0.2).
2. `dreamModeAutomatic` defaults true for everyone via `??` fallback — no migration; soft-fails without API key.
3. Merge approve = suppress sources + `SUPERSEDED_BY` edge; never hard-delete.
4. Connector bulk syncs count toward the trigger (caps bound the cost).
