# Chrome Extension Extraction Enhancements

**Implemented:** 2026-04-25

## Problem

The Chrome extension was saving pages with basic `innerText` extraction, missing:

- Rich formatting (headings, lists, links)
- OpenGraph metadata (og:image, og:title, og:description)
- Keyboard shortcuts for quick saving
- YouTube video transcript extraction

## Research

Compared extraction approaches from Mem0 and Supermemory browser extensions:

| Feature           | Mem0                   | Supermemory         | vmem (before) |
| ----------------- | ---------------------- | ------------------- | ------------- |
| Content format    | Plain text             | Markdown (Turndown) | Plain text    |
| OG metadata       | No                     | Yes                 | No            |
| YouTube           | Transcript via package | No                  | No            |
| Keyboard shortcut | No                     | Ctrl+Shift+M        | No            |

## Solution

### 1. Full Page Markdown Extraction

Added TurndownService to convert HTML to Markdown:

```typescript
// page-extraction.ts
import TurndownService from "turndown";

export function htmlToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  return turndownService.turndown(html);
}
```

Page extraction now:

1. Clones document body
2. Strips non-content elements (scripts, styles, nav, footer, ads)
3. Converts to Markdown
4. Preserves headings, lists, links, code blocks

### 2. OpenGraph Metadata Extraction

Extract OG metadata for richer memory cards:

```typescript
function extractPageContent() {
  const ogImage = document
    .querySelector('meta[property="og:image"]')
    ?.getAttribute("content");
  const ogTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content");
  const ogDescription = document
    .querySelector('meta[property="og:description"]')
    ?.getAttribute("content");
  // ... use for memory title and preview
}
```

### 3. Keyboard Shortcut (Ctrl+Shift+S)

Added Chrome commands API for quick save:

```json
// manifest.json
"commands": {
  "save-page": {
    "suggested_key": {
      "default": "Ctrl+Shift+S",
      "mac": "Command+Shift+S"
    },
    "description": "Save current page to vmem"
  }
}
```

Handler in background script:

```typescript
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-page") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) await savePageFromTab(tab);
  }
});
```

### 4. YouTube Transcript Extraction

New content script for YouTube (`content-youtube.js`) that:

1. Injects "Save to vmem" button in video action bar
2. Extracts video title, channel name from DOM
3. Fetches transcript from YouTube's timedtext API
4. Saves as memory with `source: "youtube"` tag

Transcript extraction approach:

```typescript
async function getTranscript(videoId: string): Promise<string | null> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  const html = await response.text();

  // Extract timedtext URL from page data
  const timedTextMatch = html.match(/"baseUrl":\s*"([^"]*timedtext[^"]*)"/);
  if (!timedTextMatch) return null;

  // Fetch and parse transcript XML
  const transcriptResponse = await fetch(timedTextUrl);
  const transcriptXml = await transcriptResponse.text();
  // Parse XML, extract text nodes, join...
}
```

## Files Changed

| File                                  | Change                                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| `manifest.json`                       | Added commands, YouTube host permission, content script             |
| `src/lib/page-extraction.ts`          | New: htmlToMarkdown utility                                         |
| `src/background/index.ts`             | Added keyboard shortcut handler                                     |
| `src/background/context-menu.ts`      | Updated to use markdown extraction                                  |
| `src/background/message-handler.ts`   | Added SAVE_YOUTUBE_VIDEO handler, markdown conversion               |
| `src/types/messages.ts`               | Added markdown, ogImage fields to SAVE_PAGE; new SAVE_YOUTUBE_VIDEO |
| `src/popup/_components/QuickSave.tsx` | Updated extraction to include OG metadata                           |
| `src/content/youtube/index.ts`        | New: YouTube content script with save button                        |
| `scripts/build.ts`                    | Added YouTube content script build                                  |

## Dependencies Added

- `turndown` - HTML to Markdown conversion
- `@types/turndown` - TypeScript types

## User Experience

1. **Richer content**: Saved pages now preserve formatting (headings, lists, code)
2. **Better titles**: OG title used when available (usually cleaner than document.title)
3. **Quick save**: `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) saves current page instantly
4. **YouTube support**: Save button on videos captures transcript for searchable memories
