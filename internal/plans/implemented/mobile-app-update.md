# Mobile app parity with web (chat, voice, settings)

## Context

Mobile app (Expo 56, drawer: chat/record/settings) lags far behind web. Goal: port every web feature whose route exists on mobile, with matching UI. Decisions locked with user:

- **Cloud chat**: full parity — Local/Cloud provider toggle, OpenRouter model selector, `api.chat.initiateStreaming` (key via Secrets).
- **Settings**: add Preferences, Profiles, Secrets (Models stays).
- **Record screen**: full `/voice` port — persona orb, STT → local LLM grounded in memories → TTS (expo-speech), history drawer, shared chat thread.
- **Chat**: markdown rendering + skills `/` slash picker + all missing message features.
- **Dark theme**: neutralise mobile's purple-tinted (hue 260) dark tokens to web's neutral grey — whole-app visual change, intentional.
- **New deps approved**: `expo-speech`, `@ronradtke/react-native-markdown-display`, `@react-native-community/datetimepicker`, `@react-native-community/slider`. (expo-speech + community pickers ⇒ android prebuild once.)

Verified: `useUIMessages` from `@convex-dev/agent/react` already works on mobile with `{stream:true}` — cloud streaming needs no new transport. Convex fn names verified in `packages/backend/convex/chat.ts`: `initiateStreaming, getOrCreateThread, clearChatHistory, saveLocalMessages, getThreadMessageUsage, getThreadMessageMemoryRefs, listThreadMessages`.

## Phase 1 — shared code moves (`packages/shared`)

Move pure helpers so mobile can import them (mobile may only import `@vmem/backend` root + `@vmem/shared`); update web imports, delete originals:

1. `apps/web/src/lib/think-tags.ts` → `packages/shared/src/think-tags.ts` (`parseThinkTags`). Web consumer: `apps/web/src/hooks/useLocalChat.ts`.
2. `apps/web/src/components/chat/_utils/segmentInputBySkills.ts` → `packages/shared/src/skillSegments.ts`. Web consumer: `skillMentionEditorUtils.ts`.
3. `apps/web/src/components/chat/_utils/cloudModelGroups.ts` → `packages/shared/src/cloudModelGroups.ts` (`providerFromOpenRouterModelId`, `groupCloudModelsByProvider`, label fmt). Web consumer: `CloudModelSelector.tsx`.
4. `parseEnvVars` from `apps/web/.../EnvVarsTable.tsx` → `packages/shared/src/envParse.ts`.
5. `utcTimeToLocal`/`localTimeToUtc` from web `settings/preferences.tsx` → `packages/shared/src/time.ts`.
   Export all from `packages/shared/src/index.ts`.

## Phase 2 — mobile theme tokens

`apps/mobile/src/global.css` + `tailwind.config.ts` + `src/lib/theme.ts`:

- Add tokens mirroring web `apps/web/src/globals.css` (convert exact oklch→hsl at impl time, light+dark): `--surface`, `--surface-card`, `--surface-secondary`, `--surface-tertiary`, `--overlay`(+fg), `--default`(+fg), `--segment`(+fg), `--separator`.
- **Realign `--accent`** to web semantics (primary action: ~black light / ~white dark). Audit existing consumers first (`ui/badge.tsx`, `ui/Button.tsx`, `EmptyState.tsx`) — move subtle-fill uses to secondary/muted.
- **Neutralise dark base tokens**: background/card/border/muted/secondary etc. hue 260 → neutral grey matching web dark (`--surface` ladder oklch 21–27%).
- Mapping rules (document in global.css header): web `text-muted` → mobile `text-muted-foreground`; web `danger` → mobile `destructive`; mobile `primary` keeps web-`accent` role for buttons.
- Extend `THEME_COLORS` in `theme.ts` with surface/accent/separator/etc. for imperative `color=` props + NAV_THEME.

## Phase 3 — chat parity

### Services

- `src/services/chat-prefs.ts` (new): SecureStore `vmemChatProvider` ("local"|"cloud") + `vmemCloudModelId` (same pattern as `vmemActiveModelId` in `model-manager.ts`).
- `model-manager.ts`: add `contextLength` per GGUF model (TinyLlama 2048, Llama3.2-3B 4096, Phi-3.5 4096, Mistral-7B 8192).

### Hooks (mirror web 3-hook shape; web refs: `apps/web/src/hooks/useLocalChat.ts`, `useCloudChat.ts`, `useChatProvider.ts`)

- `src/hooks/useLocalChat.ts` (new, extracted from current `useChatProvider.ts`):
  - `streamText(...).fullStream` handling `text-delta` + `reasoning-delta`; `parseThinkTags` (@vmem/shared) per delta; build UIMessage parts (reasoning + text) like web `buildParts`.
  - Keep memory retrieval (`api.memoryApi.retrieveMemories` limit 8) but map full `trace` (score, scoreBreakdown, reason) into refs — currently dropped.
  - Usage: `await result.totalUsage` + delta-count fallback + tokensPerSecond; pass to `saveLocalMessages`; expose `usageByMessageKey` (draft + `api.chat.getThreadMessageUsage`).
  - `clearHistory`/`isClearing` via `api.chat.clearChatHistory` + thread swap (web pattern).
  - Keep mobile `mode` union + offline guards. Types via `FunctionReturnType` only — no hand-written Convex interfaces.
- `src/hooks/useCloudChat.ts` (new): port web; `chat-prefs` instead of localStorage (async hydrate); `hasOpenRouterKey` from `useQuery(api.userEnvVars.list)`; models via `api.openRouterModels.listFreeChatModels`; send = `api.chat.initiateStreaming({prompt, threadId, modelId})`; `isStreaming` from message status + transient pending flag (gap before first delta); offline ⇒ force local.
- `src/hooks/useChatProvider.ts` (rewrite, ~80 lines): orchestrator composing both; returns provider, setProvider, cloudModelId, setCloudModelId, messages, sendMessage, clearHistory, usage/refs maps, mode, hasOpenRouterKey.

### Components (`src/components/chat/`, each ≤250 lines; visual ports of web counterparts in `apps/web/src/components/chat/_components/` + `Chat.tsx`)

- `ui/BottomSheet.tsx` (new reusable): RN Modal + backdrop + slide-up `bg-overlay rounded-t-2xl`. Used by selectors/trace/usage.
- `chat/ProviderToggle.tsx`: segmented pill (Local/Cloud), track `bg-default`, active `bg-segment`.
- `chat/LocalModelSelectorSheet.tsx`: pill trigger → sheet of `MODELS` w/ download state; select calls `setActiveModelId`+`getLocalModel`; link → Settings.
- `chat/CloudModelSelectorSheet.tsx`: SectionList grouped via shared `groupCloudModelsByProvider`; auto-select first; expose selected `contextLength`.
- `chat/SkillSlashPicker.tsx` + `src/lib/skillSlashTrigger.ts`: port `findSlashTrigger`/`isValidSlashTrigger` from web `SkillMentionEditor.tsx` operating on TextInput `selection`. Overlay card anchored above input INSIDE KeyboardAvoidingView (not Modal — keeps keyboard), `keyboardShouldPersistTaps="always"`, tap inserts `/skillName `. Skill pills: preview row above input via shared `segmentInputBySkills` (accent pills); submitted text stays plain — `findSkillsReferencedInMessage` server-side matches as-is.
- `chat/ChatInputBar.tsx` (replaces `ChatInput.tsx`): web placeholder variants, footer left = ProviderToggle + model selector, right = VoiceButton (local only) + send. Hosts slash picker + pill row.
- `chat/MessageBubble.tsx` (moved, orchestrator) delegating to:
  - `ReasoningBlock.tsx` (extract existing),
  - `ToolCallBlock.tsx` — use `isToolOrDynamicToolUIPart`/`getToolOrDynamicToolName` from `ai` (fixes existing dead v4 `tool-invocation` filter); status badge + expandable JSON input/output.
  - `SourcesBlock.tsx` — `source-url` parts, collapsible, open via `expo-web-browser`, inline `[n]` citations.
  - `MarkdownResponse.tsx` — markdown lib wrapper, token-mapped styles; assistant only; plain Text while `status==="streaming"` if perf demands.
  - `MemoryRefChips.tsx` + `MemoryTraceSheet.tsx` — chips `bg-default`; tap → BottomSheet with score + 4 ScoreBar rows (content/semantic/recency/confidence) + reason. No graph nav (no mobile graph route). Trace-less refs non-tappable.
  - `MessageActions.tsx` + `UsageSheet.tsx` — copy, provider icon (`vmem-cloud`/`vmem-local-voice`), usage pill ("N% · X tok") → sheet w/ input/output/reasoning/cached + tok/s; maxContext from active model `contextLength` (fallback 131072).
- `chat/ChatEmptyState.tsx` (replaces EmptyState): web's 3 variants (no local model / OpenRouter key required / ready+3 suggestions) + mobile offline variant.
- `chat/ClearChatDialog.tsx`: centered Modal port of web dialog (destructive confirm + spinner).

### Screen

- `app/(main)/index.tsx`: trash header button (when messages>0) → ClearChatDialog; empty-state gating like web; pass usage/refs/maxContext; remove `console.log`; don't full-screen-block on `!isReady` in cloud mode (gate via placeholder like web).

## Phase 4 — voice (Record screen)

Web refs: `apps/web/src/components/voice/*`, `apps/web/src/components/contexts/VoiceContext.tsx`, orb config `packages/ui/src/ai-elements/persona.tsx`.

- `src/lib/memory-grounding.ts` (new): extract shared `buildGroundedPrompt({query, core, skills, retrieveMemories})` → `{systemPrompt, memoryRefs}` (try/catch fallback). Used by `useLocalChat` (VMEM_LOCAL_CHAT_CORE) and voice (`VMEM_VOICE_CORE`, already exported from @vmem/shared).
- `src/hooks/useVoiceSession.ts` (new): phases `idle|listening|thinking|speaking|error`.
  - STT: `expo-speech-recognition` (`interimResults:true`); promise-gate final result after `stop()` w/ ~3s timeout; empty transcript → idle.
  - LLM: `getLocalModel()` → `streamText`, await full text; persist BEFORE TTS via `api.chat.saveLocalMessages({source:"vmem-local-voice", memoryRefs, assistantOrder: highestOrder+2, assistantStepOrder: 0})` (shared thread w/ chat).
  - TTS: `Speech.speak(reply,{onDone,onStopped,onError})`; chunk on `Speech.maxSpeechInputLength` (Android ~4000) by sentence; `Speech.stop()` before new speak.
  - Cancel: `cancelledRef` checks after each await (llama can't abort); listening → `abort()`; speaking → `Speech.stop()`. `useFocusEffect` cleanup cancels on blur.
  - Readiness: llmState idle/loading/ready/error + "Load model" (`getLocalModel`), STT permission, TTS always ready.
- `src/components/voice/PersonaOrb.tsx`: port `VARIANT_COLOURS` (mana: `#4f46e5→#a855f7`, glow `rgba(129,140,248,.45)`, ring `rgba(167,139,250,.55)`) + `STATE_CONFIG` verbatim. Layers via react-native-svg gradients + reanimated `withRepeat` loops: glow (radial, wide falloff ≈ blur), orb (linear 135°), shimmer (rotates when thinking), listening ring ×1, speaking rings ×2 (`withDelay` 0.35s). Restart loops on state change.
- `src/components/voice/VoiceControls.tsx` (80px mic/stop circle, ping rings, cancel X), `VoiceStatusLine.tsx` (phase dot/label, transcript italic, reply preview), `VoiceReadinessPills.tsx` (LLM/STT/TTS pills + Load Model + Settings link), `VoiceHistorySheet.tsx` (pill trigger "Show conversation (n)", animated panel reusing chat MessageBubble).
- Rewrite `app/(main)/record.tsx`: thin orchestrator (keep drawer header), wires hook + thread queries + PHASE_TO_PERSONA map.

## Phase 5 — settings restructure + new sections

### Navigation: convert to stack dir

```
app/(main)/settings/
  _layout.tsx   — Stack, headerShown:false
  index.tsx     — hub: 4 chevron rows (Models/Preferences/Profiles/Secrets), drawer-menu header
  models.tsx    — existing settings.tsx moved; back chevron; extract ModelCard to src/components/settings/models/
  preferences.tsx | profiles.tsx | secrets.tsx
```

Drawer route name `settings` unchanged; `DrawerContent` matchPrefix `/settings` still works.

- `src/components/ui/modal.tsx` (new shared primitive): RN Modal sheet, backdrop dismiss, `bg-overlay` panel. Reused by profiles/secrets dialogs.

### Preferences (`src/components/settings/preferences/*`; web ref `routes/_main/settings/preferences.tsx`)

- Convex: `api.userSettings.get`/`update` (NOTE: dream schedule NOT in `update` — use `api.dreamSchedule.setDreamSchedule({enabled, time?})`).
- Bind inputs directly to query + `.withOptimisticUpdate` per keystroke (CLAUDE.md rule; web does exactly this). No useState mirrors.
- Cards: `AboutMeCard` (2 textareas, maxLength 500, counters), `MemoryBehaviorCard` (Switch + `@react-native-community/slider` 0–100 step 5, commit on slidingComplete), `DreamModeCard` (auto-accept Switch + schedule Switch + `@react-native-community/datetimepicker` mode="time"; UTC↔local via shared `time.ts`), `NotificationsCard` (3 Switch rows).

### Profiles (`src/components/settings/profiles/*`; web ref `routes/_main/settings/profiles.tsx`)

- Convex: `api.profiles.list/create/update`, `api.profiles.removeWithMemories` (ACTION — spinner, no optimistic), `api.userSettings.setDefaultProfile({source:"web"|"extension", profileId})` — no "mobile" source exists; render Web App + Browser Extension pickers like web.
- Copy `optimisticId.ts` to `src/lib/`; optimistic create/update like web.
- `ProfileCard` (single-column list), `ProfileFormModal` (name + 8 `PROFILE_COLORS` swatches + 12 `PROFILE_ICONS` grid — all exist in @tabler/icons-react-native), `DeleteProfileModal` (delete-all vs move-to options), `DefaultProfilesCard`.

### Secrets (`src/components/settings/secrets/*`; web ref `settings/secrets.tsx` + `EnvVarsTable`)

- Convex: `api.userEnvVars.list/removeVar` (optimistic remove), `api.userEnvVarsActions.upsertVar/editVar/revealValue/bulkUpsert`.
- `EnvVarList` (info card, Add + Paste buttons, rows, empty state), `EnvVarRow` (mono key, masked value, reveal/copy via expo-clipboard/edit/delete), `EnvVarFormModal` (surface server validation errors), `BulkPasteModal` (clipboard → shared `parseEnvVars` → preview → bulkUpsert).

## Phase 6 — deps + prebuild

- `pnpm add` in apps/mobile: `expo-speech`, `@ronradtke/react-native-markdown-display`, `@react-native-community/datetimepicker`, `@react-native-community/slider`. Verify React 19 peer resolution for markdown lib (fallback: original pkg w/ pnpm override; avoid react-native-marked — nested FlatList).
- Android prebuild required (user runs `pnpm prebuild:android` when testing; do NOT run build commands unprompted).

## Implementation order

1. Shared moves (Phase 1) → web typecheck still green.
2. Tokens (Phase 2).
3. Chat: prefs service → hooks split → components → screen.
4. Settings restructure + Preferences → Secrets → Profiles.
5. Voice (deps + grounding extraction + hook + orb + components + screen).
6. Verify: `npx tsc --noEmit` in apps/mobile + apps/web; `npx convex codegen --typecheck enable` untouched-but-cheap sanity; no any/unknown/as/!; CLAUDE.md learnings; user tests visually in dev client.

## Risks

- Markdown lib React 19 peers (fallback defined).
- Slash picker + Android keyboard (`adjustResize`, controlled `selection` quirks — set selection only on insert).
- Per-delta re-renders: `React.memo` MessageBubble.
- oklch→hsl conversions approximate — eyeball vs web side-by-side.
- `--accent` realignment touches existing badge/button — audit first.
- SecureStore async hydration → one-frame default provider (accept, like web SSR guard).
- STT final-result race after stop() — promise-gate w/ timeout.
- llama generation not abortable — cancel = discard via ref.
- New native deps ⇒ dev client rebuild before testing.

## Unresolved questions

None — cloud chat, settings scope (Preferences/Profiles/Secrets), full voice port w/ TTS, markdown + slash picker, dark-theme neutralisation, and picker deps all confirmed by user.
