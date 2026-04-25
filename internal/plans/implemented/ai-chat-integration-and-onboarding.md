# AI Chat Integration & Onboarding

**Implemented:** 2026-04-25

## Problem

After adopting markdown extraction, OG metadata, keyboard shortcuts, and YouTube transcript support from Supermemory/Mem0, vmem's Chrome extension still lacked several high-impact features that competing extensions offer:

1. No automatic memory retrieval during AI chat conversations
2. No passive prompt capture — memories only created via explicit user action
3. No in-page feedback mechanism outside the popup (toasts)
4. No onboarding experience for new installs
5. No way to review/remove auto-retrieved memories before injection

## Research

Supermemory's extension auto-searches memories as users type in ChatGPT/Claude, shows results in a floating popup with per-item removal, and can auto-capture prompts. Mem0's YouTube extension injects a full chat sidebar. Both show in-page toasts for save feedback.

Key insight: auto-search turns vmem from "save and forget" into "save and automatically resurface." Combined with auto-capture, the extension builds memory passively while actively assisting during conversations.

## Solution

### 1. Toast Notification System (`content/shared/toast.ts`)

Shadow DOM-based in-page toast system:

- Types: success, error, loading, info
- Dark semi-transparent background with backdrop blur
- Bottom-right positioning, stacked
- Auto-dismiss (default 3s), configurable
- API: `showToast()`, `hideToast()`, `updateToast()`

### 2. Memory Panel (`content/shared/memory-panel.ts`)

Floating panel for displaying auto-search results:

- Shadow DOM for style isolation
- Anchored above the chat input field
- Per-memory remove button (×)
- "Clear all" option in header
- Max 240px height, scrollable
- Fade-in/slide-up animation

### 3. AI Chat Integration (`content/shared/ai-chat-integration.ts`)

Combined auto-search + auto-capture module:

**Auto-search:**

- Debounced (800ms) input monitoring on ChatGPT/Claude
- Minimum 10 chars before searching
- Sends RETRIEVE_MEMORIES, shows results in memory panel
- On send: injects non-removed memories as `[Context from vmem]` prefix
- Skips injection if context already present (e.g. from manual "Use vmem" button)

**Auto-capture:**

- Captures prompt text on send button click / Enter key press
- Minimum 20 chars, deduplicates within 5s window
- Saves with source: "prompt-capture", tags include platform name
- Shows toast on successful capture
- Non-blocking — never disrupts the user's chat flow

**Settings cached locally** and synced via `chrome.storage.onChanged` for instant toggle response.

### 4. Welcome Page (`src/welcome/index.html`)

Static HTML page (no build step needed, just copied to dist):

- vmem logo and tagline
- 4 feature cards: Auto-Search, Quick Save, YouTube Transcripts, Rich Extraction
- Getting started CTA with toolbar pin instructions
- Dark mode support via `prefers-color-scheme`
- Opened on `chrome.runtime.onInstalled` (reason === "install")

### 5. Settings Toggles

Two new toggles in popup Settings tab:

- **Auto-search memories in chats** (default: on)
- **Auto-capture prompts** (default: off — opt-in)

## Files Changed

| File                                        | Change                                                 |
| ------------------------------------------- | ------------------------------------------------------ |
| `src/types/storage.ts`                      | Added `autoSearchEnabled`, `autoCaptureEnabled` fields |
| `src/types/messages.ts`                     | Added `CAPTURE_PROMPT` message type                    |
| `src/content/shared/toast.ts`               | New: in-page toast notification system                 |
| `src/content/shared/memory-panel.ts`        | New: floating memory panel with removal                |
| `src/content/shared/ai-chat-integration.ts` | New: auto-search + auto-capture orchestrator           |
| `src/content/chatgpt/index.ts`              | Added `setupAIChatIntegration` call                    |
| `src/content/claude/index.ts`               | Added `setupAIChatIntegration` call                    |
| `src/background/message-handler.ts`         | Added `CAPTURE_PROMPT` handler                         |
| `src/background/index.ts`                   | Welcome page on first install                          |
| `src/popup/_components/SettingsForm.tsx`    | Added auto-search and auto-capture toggles             |
| `src/welcome/index.html`                    | New: welcome/onboarding page                           |
| `scripts/build.ts`                          | Copy welcome page to dist                              |

## Design Decisions

- **Combined module over separate**: auto-search and auto-capture share the send interception point, so they're in one module to avoid coordination bugs
- **Shadow DOM everywhere**: toasts and memory panel use closed Shadow DOM to avoid CSS conflicts with host pages (ChatGPT/Claude/any)
- **Settings cache**: content scripts cache settings synchronously (via `chrome.storage.onChanged`) so send interception doesn't need async reads
- **Static welcome page**: no React/Tailwind build needed — pure HTML/CSS keeps it lightweight and avoids another build target
- **Auto-capture off by default**: passive data collection should be opt-in
- **"Use vmem" button preserved**: manual fallback for when auto-search is off, or when user wants explicit control
