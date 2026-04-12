# Persisted Per-Reply Usage In Chat

## Summary

- Ship usage footer on assistant replies in current chat tab.
- Cover both providers: cloud + local/WebLLM.
- Cloud uses persisted agent `usage`, aggregated to rendered assistant bubble.
- Local captures AI SDK `totalUsage` after completion, persists it on future saved assistant messages.
- V1 shows counts only. No %/context-window math until model metadata is real.

## Public API / Type Changes

- `packages/backend/convex/chat.ts`
  - Add `getThreadMessageUsage({ threadId })`.
  - Extend `saveLocalMessages({ threadId, userText, assistantText, usage })`.
- Client hook return shapes
  - `useCloudChat(): { ..., usageByMessageKey }`
  - `useLocalChat(): { ..., usageByMessageKey }`
- UI prop
  - `ChatMessageItem({ message, usage })`
- New shared UI primitive
  - `packages/ui/src/ai-elements/context.tsx`
  - export from `packages/ui/src/ai-elements/index.ts`
- New internal type
  - `MessageUsageSummary = { inputTokens: number; outputTokens: number; totalTokens: number }`

## Implementation

1. Backend usage query

- Keep `listThreadMessages` unchanged. `useUIMessages` depends on its current shape.
- Add separate thread-scoped query returning `Record<string, MessageUsageSummary>`, keyed by rendered `message.key`.
- Query reads raw agent messages, rebuilds assistant bubble grouping with same semantics as `@convex-dev/agent`:
  - group assistant/tool records by `order`
  - bubble key = first grouped message key (`threadId-order-stepOrder`)
  - sum `usage` across all grouped records
  - ignore records without `usage`
- Only emit assistant bubble entries.

2. Local persistence

- Import agent `vUsage` validator if available; use same shape for `saveLocalMessages` args.
- Persist `usage` on the saved assistant message only.
- Do not create new table/schema. Reuse existing agent message metadata.
- Older local history stays blank; no estimation/backfill.

3. Cloud hook

- `useCloudChat` keeps `useUIMessages`.
- Add `useQuery(api.chat.getThreadMessageUsage, threadId ? { threadId } : "skip")`.
- Return `usageByMessageKey`, default `{}` while loading.

4. Local hook

- After `streamText(...)`, await `result.totalUsage` once generation completes.
- Normalize to `MessageUsageSummary`.
- Store draft usage keyed by draft assistant `message.key`.
- Pass same usage into `saveLocalMessages`.
- Merge `draftUsageByKey` + persisted `usageByMessageKey`.
- No handoff cache after save; rely on Convex refresh.

5. UI

- Add compact footer component in `packages/ui/src/ai-elements/context.tsx`.
- Render simple counts summary: input, output, total.
- No progress bar, no hardcoded context window, no raw provider fields.
- In `ChatMessageItem`, show footer only on assistant messages with usage.
- Place in existing assistant footer chrome, alongside current provider/copy area, not as separate large block.

## Tests / Scenarios

- Backend: single assistant message with usage -> one map entry, correct key.
- Backend: tool-call chain in one order -> usages summed to one assistant bubble key.
- Backend: `_id` differs from `message.key` -> mapping still correct.
- Backend: missing usage on some grouped records -> sum remaining records only.
- Backend: `saveLocalMessages` stores assistant usage, not user usage.
- Hook: local reply captures `totalUsage` and exposes it on draft assistant bubble.
- Hook: persisted cloud usage map merges correctly with rendered messages.
- UI: assistant footer hidden when usage absent.
- UI: user messages never show usage footer.

## Assumptions / Defaults

- Scope = both cloud + local chat.
- Usage shown on assistant replies only.
- V1 details = basic counts only.
- No % unless explicit model window metadata exists later.
- If local provider returns no usage, show nothing; do not estimate.
- No unresolved questions.
