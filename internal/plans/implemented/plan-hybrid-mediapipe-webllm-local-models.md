# Plan: Hybrid MediaPipe + WebLLM Local Models

## Context

User wants to optimize local model performance by using the fastest runtime for each model family:

- **MediaPipe** for Gemma models (Google's optimized runtime for their own models)
- **WebLLM** for Qwen, Llama, DeepSeek (MLC's general-purpose runtime)

Also adding back DeepSeek R1 1.5B model that was accidentally removed.

MiniMax/Kimi K models are too large (10B+ active params) for browser inference.

## Current Architecture

- `webllm-models.ts` - Model catalog
- `webllm-engine.ts` - Singleton engine management
- `WebLLMContext.tsx` - React context for loading/state
- `useLocalChat.ts` / `VoiceClient.tsx` - Inference via Vercel AI SDK `streamText()`

## Implementation Plan

### 1. Update Model Catalog

**File:** `apps/web/lib/webllm-models.ts`

Add `runtime` field to `WebLLMModelInfo`:

```typescript
runtime: "webllm" | "mediapipe";
```

Final model list:
| Model | Runtime | Size |
|-------|---------|------|
| Qwen 3 0.6B | webllm | ~400MB |
| Qwen 3 1.7B | webllm | ~1.1GB |
| Qwen 3 4B | webllm | ~2.5GB |
| Qwen 3 8B | webllm | ~4.5GB |
| Llama 3.2 1B | webllm | ~700MB |
| Llama 3.2 3B | webllm | ~1.8GB |
| Llama 3.1 8B | webllm | ~4.3GB |
| DeepSeek R1 1.5B | webllm | ~1.0GB |
| Gemma 4 E2B | mediapipe | ~500MB |
| Gemma 4 E4B | mediapipe | ~1.5GB |

### 2. Install MediaPipe

```bash
cd apps/web && npm install @mediapipe/tasks-genai
```

### 3. Create MediaPipe Engine

**New file:** `apps/web/lib/mediapipe-engine.ts`

- `loadMediaPipeModel(modelId, onProgress?)` - Load Gemma model via FilesetResolver + LlmInference
- `unloadMediaPipeModel()` - Cleanup
- `getMediaPipeModel()` - Get current instance
- `generateWithMediaPipe(prompt, onToken)` - Streaming generation with callback
- Custom progress tracking via fetch with Content-Length

Model URLs from HuggingFace:

- `google/gemma-4-E2B-it` → `.task` file
- `google/gemma-4-E4B-it` → `.task` file

### 4. Create MediaPipe AI SDK Adapter

**New file:** `apps/web/lib/mediapipe-model-adapter.ts`

Wrap MediaPipe's callback-based API to match Vercel AI SDK's `LanguageModel` interface so `streamText()` works unchanged.

### 5. Update Engine Router

**File:** `apps/web/lib/webllm-engine.ts`

Add routing logic:

```typescript
export async function loadEngine(modelId: string, onProgress?) {
  const modelInfo = findModel(modelId);
  if (modelInfo.runtime === "mediapipe") {
    return loadMediaPipeModel(modelId, onProgress);
  }
  return loadWebLLMModel(modelId, onProgress);
}
```

### 6. Rename Context

**File:** `apps/web/components/contexts/WebLLMContext.tsx` → `LocalLLMContext.tsx`

- Rename file to `LocalLLMContext.tsx`
- Rename `WebLLMContext` → `LocalLLMContext`
- Rename `WebLLMProvider` → `LocalLLMProvider`
- Rename `useWebLLM` → `useLocalLLM`
- Update all imports across codebase

### 7. Update UI to Show Runtime Badge

**File:** `apps/web/app/(main)/settings/preferences/_components/ModelCard.tsx`

Add small badge showing runtime:

- "MediaPipe" badge (green) for Gemma models
- "MLC" badge (blue) for WebLLM models

## Files to Modify

1. `apps/web/lib/webllm-models.ts` → rename to `local-models.ts`, add runtime field, add DeepSeek
2. `apps/web/lib/webllm-engine.ts` → rename to `local-engine.ts`, add routing logic
3. `apps/web/lib/mediapipe-engine.ts` - **NEW** MediaPipe loader
4. `apps/web/lib/mediapipe-model-adapter.ts` - **NEW** AI SDK adapter
5. `apps/web/components/contexts/WebLLMContext.tsx` → rename to `LocalLLMContext.tsx`
6. `apps/web/app/(main)/settings/preferences/_components/ModelCard.tsx` - Show runtime badge
7. `apps/web/app/(main)/settings/preferences/_components/LocalModelsSection.tsx` - Update imports
8. `apps/web/hooks/useLocalChat.ts` - Update imports
9. `apps/web/app/(main)/voice/VoiceClient.tsx` - Update imports
10. `apps/web/package.json` - Add `@mediapipe/tasks-genai`

## Verification

1. Run `npm install` in `apps/web`
2. Run `npx tsc` to verify no type errors
3. Open `/settings/preferences` in browser
4. Verify runtime badges show correctly (MediaPipe for Gemma, MLC for others)
5. Load a Gemma model → should use MediaPipe
6. Load a Qwen/Llama/DeepSeek model → should use WebLLM
7. Test chat generation works with both runtimes
