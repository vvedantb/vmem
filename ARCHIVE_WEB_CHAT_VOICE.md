# Archived web chat, voice, local models, and chat backend

This branch restores the web chat/voice UI, local models, free OpenRouter catalog helpers, and the Convex chat threads backend on top of current `staging`, for reference only.

- **UI snapshot:** `afe1d9b9` (parent of removal commit `c04a1d41` / #110)
- **Free-model catalog:** `be423217` (parent of `a4d378ca`)
- **Chat backend snapshot:** `1d33901d` (parent of `e7b28490`, which dropped threads from staging)
- **Submission branch:** `staging` — these surfaces stay deleted there
- **Do not merge into `staging`** — reference / restore only

## What is on this branch

- `apps/web` chat + voice routes, local models settings, WebLLM/MediaPipe/whisper/kokoro stack
- `packages/ui` ai-elements kit
- `packages/backend/convex/chat.ts`, `chatStreamActions.ts`, `agent.ts`, `cloudLib/*`
- Schema tables `threadProfiles` + `chatMessageMemoryRefs`, `@convex-dev/agent` component
- Shared chat/voice prompt helpers + free-model catalog helpers

## Restore locally

```bash
git checkout archive/web-chat-voice
# or copy the restored paths into your working tree
```
