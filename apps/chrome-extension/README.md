# vmem Chrome Extension

Browser extension for saving web content, conversations, bookmarks, and history to vmem.

## Development

```bash
pnpm install
pnpm build
```

Load `dist/` as an unpacked extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked.

## Features

- **Export to vmem** — Button injected into ChatGPT/Claude to export conversations via MCP
- **Use vmem** — Retrieve relevant memories and prepend as context to your message
- **Save page** — Right-click context menu or popup button to save any page
- **Import bookmarks** — Bulk import browser bookmarks as knowledge memories
- **Import history** — Bulk import browsing history as episodic memories
