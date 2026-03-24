# Mobile Offline Mode with Local LLMs

## Context

When the mobile app has no internet connection, it should auto-detect offline state, switch to a local LLM running on-device, and still allow chat + memory search using cached memories. This is a later-phase feature, not MVP.

## Decisions Made

- **Package**: `@react-native-ai/llama` (Callstack) — wraps `llama.rn` (llama.cpp binding) with Vercel AI SDK compatibility
- **Why this package**: Codebase already uses AI SDK types via `@convex-dev/agent/react` (UIMessage, streaming, tool parts). This package provides the same `useChat` hook and streaming patterns, so `MessageBubble` works for both online and offline with zero UI changes
- **Why not alternatives**:
  - `llama.rn` (raw): No AI SDK compat — would need manual streaming/message bridging
  - `react-native-executorch`: .pte format (fewer models than GGUF), no AI SDK compat
  - `@react-native-ai/apple`: iOS 26+ only, kills Android
  - `@react-native-ai/mlc`: 179MB package, curated model list less flexible than GGUF
- **Chat model**: Llama 3.2 3B Q4 (~2GB GGUF) — best quality-to-size ratio for mobile
- **Embedding model**: nomic-embed-text-v1.5 GGUF (~260MB) — for local vector search over cached memories
- **Model delivery**: Download on first launch (not bundled in app binary — 2GB+ would bloat App Store download)
- **Offline detection**: Auto-detect, seamless switch between cloud and local
- **Memory search**: All memories cached locally with embeddings for offline vector search

## Architecture

```
Online:  ChatInput → Convex mutation → vmemAgent → OpenRouter → UIMessage stream
Offline: ChatInput → AI SDK useChat → @react-native-ai/llama → UIMessage stream
```

Same UI layer, different provider underneath. The switch happens at the transport layer.

## Requirements

- **Expo dev client required** — no Expo Go support (native C++ code)
- **React Native New Architecture required** — already on RN 0.76 which supports it
- **Device RAM**: 6GB+ recommended for 3B Q4 model inference
- **Storage**: ~2.3GB for models (2GB chat + 260MB embeddings)

## Implementation Outline

### 1. Model Management

- Download models on first launch with progress indicator
- Store in app's document directory via `expo-file-system`
- Allow re-download if corrupted/deleted
- Show model status in settings

### 2. Local Memory Cache

- Sync memories from Convex to local storage when online
- Store memory content + precomputed embeddings locally
- Use nomic-embed-text for embedding new queries offline
- Simple cosine similarity search over cached embeddings

### 3. Offline Detection + Provider Switch

- Monitor network state with `@react-native-community/netinfo`
- When offline: route chat through `@react-native-ai/llama` provider
- When online: route through Convex backend (current flow)
- Show subtle indicator in UI for which mode is active

### 4. Limitations (V1)

- No memory creation/editing while offline (read-only memory access)
- No tool calling from local LLM (tools require backend)
- Memory cache may be stale if not recently synced
- Smaller model = lower quality responses vs cloud

## Open Questions

- How much local storage budget is acceptable? (2.3GB for models + memory cache)
- Should offline-created conversations sync back to Convex when back online?
- Should there be a manual "download model" button in settings, or fully automatic?
- What's the minimum device spec to support? (RAM, storage, OS version)
