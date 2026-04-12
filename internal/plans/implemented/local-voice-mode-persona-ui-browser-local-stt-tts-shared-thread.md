# Local Voice Mode: Persona UI + Browser-Local STT/TTS + Shared Thread

## Summary

Build a new local-only `/voice` route in `apps/web` that reuses the existing local chat LLM, adds browser-local speech-to-text and text-to-speech, and presents it with AI Elements `Persona` UI vendored into `packages/ui`. Voice and text stay in one Convex thread. Voice mode is push-to-talk v1. No cloud fallback.

## Chosen product decisions

- Runtime: browser-local only
- Placement: new `/voice` route, add to workspace nav
- Threading: same Convex thread as `/chat`
- Interaction: push-to-talk
- Voice stack: balanced
  - STT: local Whisper-base via `@huggingface/transformers`
  - Reply LLM: reuse current selected local WebLLM chat model
  - TTS: local Kokoro-82M ONNX
- Model UI: install/load controls in Preferences + compact status panel on `/voice`

## Why this stack

- `Persona` is a stateful voice UI primitive for `idle/listening/thinking/speaking/asleep`, built for this exact surface.
- Transformers.js officially supports browser-local audio tasks including ASR and TTS.
- `Xenova/whisper-base` has a documented Transformers.js browser usage path.
- Kokoro-82M ONNX is lightweight enough for local TTS and has built-in voice presets.
- Reusing the existing WebLLM local chat model keeps one assistant brain and one thread.

## Repo changes

### `packages/ui`

Add AI Elements voice primitives into the shared UI package, not directly into `apps/web`.

- Add `packages/ui/src/ai-elements/persona.tsx`
- Export from `packages/ui/src/ai-elements/index.ts`
- Vendor only the minimal extra voice primitives needed for v1 route:
  - `persona`
  - optional `audio-player` only if it materially simplifies playback UI
  - do not pull in `voice-selector`/`mic-selector` unless actually used in final route
- Add the minimal upstream dependency required by Persona’s source
  - expected: Rive WebGL2 runtime
- Keep component API close to upstream AI Elements so future updates are cheap

### `apps/web`

Add a dedicated voice route and local voice orchestration.

- Add `apps/web/app/(main)/voice/page.tsx`
- Add `apps/web/app/(main)/voice/VoiceClient.tsx`
- Add route-local children under `apps/web/app/(main)/voice/_components/`
- Add `/voice` to `apps/web/components/sidebar/nav-config.ts`

### Settings / Preferences

Extend the current local-model settings area instead of creating a second settings system.

- Keep existing local text LLM section
- Add a new `Local Voice Models` section for:
  - Whisper-base install/load state
  - Kokoro install/load state
  - selected Kokoro speaker/voice
- Keep a compact readiness card on `/voice` that reflects the same state and can trigger loads

## New architecture

### 1. Voice model registry

Create a dedicated local voice model registry, separate from WebLLM text models.

- New file in `apps/web/lib/` for voice model metadata
- Define:
  - STT model id, label, size, capabilities
  - TTS model id, label, size, available speaker presets
- Persist active STT/TTS selections in localStorage
- Do not mix these with existing WebLLM model IDs

### 2. Voice runtime services

Create three focused browser services in `apps/web/lib/voice/`.

- `stt-engine.ts`
  - wraps Transformers.js ASR pipeline
  - lazy-loads Whisper-base
  - exposes `transcribe(blob | Float32Array)`
- `tts-engine.ts`
  - wraps Kokoro ONNX inference
  - lazy-loads model + voices
  - exposes `synthesize(text, speakerId)`
- `voice-session.ts`
  - orchestrates mic capture, transient transcript, reply generation, TTS playback, cancellation
  - no persistence logic here
  - this is state machine logic, not React UI logic

### 3. Voice React context

Add a dedicated `VoiceContext` in `apps/web/components/contexts/`.
Responsibilities:

- voice model readiness
- loading/progress/error state
- active speaker selection
- current session phase:
  - `idle`
  - `listening`
  - `thinking`
  - `speaking`
  - `error`
- current transient transcript
- current transient assistant draft/audio state
- actions:
  - `loadStt`
  - `loadTts`
  - `setSpeaker`
  - `startRecording`
  - `stopRecording`
  - `cancelSession`

Do not use this context as message history storage. Shared history remains Convex-driven.

### 4. Shared-thread voice flow

Voice route uses the same thread source as text chat.
Flow:

1. User presses mic and records
2. Local STT transcribes audio
3. Transcript is inserted as a user message in the same Convex thread
   - `agentName` / metadata marks source as `local-voice`
4. Existing local LLM path generates the assistant text reply
   - same local WebLLM model as `/chat`
5. Assistant text is saved into the same Convex thread
   - also marked `local-voice`
6. Local TTS synthesizes spoken playback from the saved assistant text
7. UI shows transcript and provider/mode badges per message

This keeps `/chat` and `/voice` as two surfaces over one conversation.

### 5. Voice route UI

`/voice` should be voice-first, not a copy of the text chat page.
Layout:

- top: compact thread selector / conversation header if needed
- center: large `Persona` component
  - `listening` while recording
  - `thinking` during STT+LLM
  - `speaking` during TTS playback
  - `idle` otherwise
- below Persona:
  - transient live status line
  - current transcript preview while processing
  - mic button / stop button / cancel button
- side or lower rail:
  - shared thread history preview using existing message item component where possible
  - mode badge shown on each message (`Text Local`, `Voice Local`, `Cloud` if older messages exist)
- compact readiness card:
  - local chat LLM ready?
  - Whisper ready?
  - Kokoro ready?
  - quick load action if missing

Do not embed voice mode into `/chat` tabs for v1. Keep `/chat` and `/voice` separate routes over shared data.

## Message/source labeling

Standardize per-message mode labels in the message UI.

- Existing shared message component should show:
  - `Cloud`
  - `Local Text`
  - `Local Voice`
- Persist this via structured message metadata or normalized `agentName` values
- Avoid stringly-typed ad hoc checks spread across components; centralize badge mapping in one helper

## Public API / interface changes

### `packages/ui`

- new exported `Persona` component from `@vmem/ui/ai`
- keep props aligned with AI Elements upstream:
  - `state`
  - `variant`
  - lifecycle callbacks
  - `className`

### `apps/web`

New local interfaces/types:

- `VoicePhase = "idle" | "listening" | "thinking" | "speaking" | "error"`
- `VoiceModelKind = "stt" | "tts"`
- `VoiceSpeakerId` as a concrete union from the chosen Kokoro speaker list or a readonly config-derived string type
- `VoiceReadiness`
  - `llmReady`
  - `sttReady`
  - `ttsReady`

Message persistence:

- extend existing local-message save path to support source/mode metadata for voice-created messages
- no Convex schema fork unless current message tables cannot already represent source labels
- if schema change is required, use existing Convex types only; no manual interface duplication

## Dependencies

Expected additions in `apps/web` / `packages/ui` only if required by source:

- `@huggingface/transformers`
- ONNX/browser runtime dependency required by chosen STT/TTS path
- Rive WebGL2 package required by Persona source

Do not add more dependencies unless one of these proves insufficient during implementation.

## Failure modes / edge cases

- WebGPU unavailable:
  - local chat LLM remains unavailable
  - `/voice` shows blocked state with explicit reason
  - no cloud fallback
- STT/TTS not yet loaded:
  - `/voice` shows missing-model readiness card, not a broken mic button
- User enters `/voice` with no local text LLM loaded:
  - route explains that voice mode also requires a loaded local chat model
- User records, then cancels before transcription:
  - discard transient audio/transcript, save nothing
- STT succeeds, LLM fails:
  - save user transcript only
  - show assistant error state, no TTS
- LLM succeeds, TTS fails:
  - assistant text still saved and shown
  - show playback error, keep retry button
- Page reload mid-session:
  - persisted thread remains
  - transient recording / transient playback state resets
- Persona WebGL context pressure:
  - only one Persona instance on screen
  - route should not render multiple concurrent Persona visuals

## Test cases / scenarios

### Settings

- Preferences shows separate text-model and voice-model sections
- voice model selections persist across reload
- invalid cached voice model IDs are cleared safely

### Route behavior

- `/voice` appears in nav and loads without touching cloud code paths
- when all local models are ready, push-to-talk completes end-to-end:
  - record
  - transcript
  - local reply
  - TTS playback
  - shared thread persistence

### Shared-thread consistency

- a voice-created user message appears in `/chat`
- a text-created message appears in `/voice`
- message badges correctly distinguish `Local Text` vs `Local Voice`
- refresh preserves thread history in both routes

### Readiness / errors

- no local chat LLM loaded: `/voice` blocks with actionable message
- STT missing: can’t start recording, proper load CTA shown
- TTS missing: text reply still works, spoken playback disabled with clear status
- TTS failure after reply generation does not delete saved assistant text

### UX / state

- Persona transitions correctly:
  - idle -> listening -> thinking -> speaking -> idle
- cancel during listening returns to idle without persistence
- stop recording triggers thinking state exactly once
- no duplicate message save on retry or rapid button taps

## Implementation sequence

1. Vendor `Persona` into `packages/ui`, export it
2. Add voice model registry + local persistence
3. Build STT/TTS runtime wrappers
4. Build `VoiceContext`
5. Extend shared message metadata/badge mapping for `Local Voice`
6. Add Preferences voice-model section
7. Add `/voice` route + UI
8. Wire shared-thread persistence and playback
9. Verify edge states and badge rendering

## Assumptions / defaults

- `/voice` is the route name
- v1 is push-to-talk, not auto VAD or barge-in
- v1 speaks the full assistant reply after text generation completes; no streaming TTS
- v1 uses one existing local WebLLM chat model as the assistant brain
- v1 does not add a separate voice-only LLM selector
- v1 keeps one shared thread across `/chat` and `/voice`
- v1 manages voice models in both Preferences and a compact `/voice` readiness panel
- v1 uses a single Persona instance on the page

## Research basis

- AI Elements setup: https://elements.ai-sdk.dev/docs/setup
- Persona component: https://elements.ai-sdk.dev/components/persona
- Transformers.js browser-local audio support: https://github.com/huggingface/transformers.js/
- Whisper-base Transformers.js model card: https://huggingface.co/Xenova/whisper-base
- Kokoro ONNX model card: https://huggingface.co/NeuML/kokoro-base-onnx

## Unresolved questions

- None
