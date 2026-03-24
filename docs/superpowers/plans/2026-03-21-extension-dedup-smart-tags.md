# Extension Dedup + Smart Tags + Auto-Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deduplicate chrome extension memories by URL and replace hostname-only tags with LLM-generated semantic tags + auto-linking.

**Architecture:** API gains URL-based dedup (409 response) and async enrichment service that calls OpenRouter for semantic tags + relationship discovery. Extension handles 409 with update confirmation. No new dependencies — OpenRouter called via fetch.

**Tech Stack:** Hono, Neo4j, OpenRouter REST API, Chrome Extension APIs, Zod v4

**Spec:** `docs/superpowers/specs/2026-03-21-extension-dedup-smart-tags-design.md`

---

## File Structure

| File                                                        | Action | Responsibility                                           |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------- |
| `apps/api/src/lib/url.ts`                                   | Create | URL normalization utility                                |
| `apps/api/src/services/memory-enrichment.ts`                | Create | LLM tagging + auto-linking service                       |
| `apps/api/src/routes/memories.ts`                           | Modify | Add `url` to schema, 409 dedup logic, trigger enrichment |
| `apps/api/src/db/memory-service.ts`                         | Modify | Store `url`, dedup query, enrichment write methods       |
| `apps/chrome-extension/src/types/api.ts`                    | Modify | Add `url` to `CreateMemoryParams`                        |
| `apps/chrome-extension/src/types/messages.ts`               | Modify | Add `SAVE_DUPLICATE` response type                       |
| `apps/chrome-extension/src/background/api-client.ts`        | Modify | Handle 409, add `updateMemory` method                    |
| `apps/chrome-extension/src/background/message-handler.ts`   | Modify | Pass URL, handle duplicate response                      |
| `apps/chrome-extension/src/background/context-menu.ts`      | Modify | Pass URL to createMemory                                 |
| `apps/chrome-extension/src/background/import-bookmarks.ts`  | Modify | Pass URL, silent dedup skip                              |
| `apps/chrome-extension/src/background/import-history.ts`    | Modify | Pass URL, silent dedup skip                              |
| `apps/chrome-extension/src/popup/_components/QuickSave.tsx` | Modify | Duplicate confirmation UI                                |

---

### Task 1: URL Normalization Utility

**Files:**

- Create: `apps/api/src/lib/url.ts`

- [ ] **Step 1: Create normalizeUrl utility**

```typescript
// apps/api/src/lib/url.ts
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  const cleaned = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) {
      cleaned.set(key, value);
    }
  });
  url.search = cleaned.toString();

  let path = url.pathname.replace(/\/+$/, "");
  if (path === "") path = "/";
  url.pathname = path;

  return url.toString();
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/lib/url.ts
git commit -m "feat: add URL normalization utility for memory dedup"
```

---

### Task 2: API — URL Storage + Dedup Check

**Files:**

- Modify: `apps/api/src/routes/memories.ts:15-23` (createMemorySchema)
- Modify: `apps/api/src/routes/memories.ts:57-75` (POST handler)
- Modify: `apps/api/src/db/memory-service.ts:116-209` (createMemory method)

- [ ] **Step 1: Add `url` to createMemorySchema**

In `apps/api/src/routes/memories.ts`, add to the schema at line 15:

```typescript
const createMemorySchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  type: memoryTypeSchema,
  source: z.string().min(1),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1.0),
  expiresAt: z.string().optional(),
  url: z.string().url().optional(),
});
```

- [ ] **Step 2: Add dedup check to POST handler**

In `apps/api/src/routes/memories.ts`, replace the POST handler (lines 57-75):

```typescript
import { normalizeUrl } from "../lib/url";

memories.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = createMemorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const service = getService();
  const normalizedUrl = parsed.data.url
    ? normalizeUrl(parsed.data.url)
    : undefined;

  if (normalizedUrl) {
    const existing = await service.findMemoryByUrl(userId, normalizedUrl);
    if (existing) {
      return c.json(
        {
          error: "duplicate",
          existingMemory: {
            id: existing.id,
            title: existing.title,
            updatedAt: existing.updatedAt,
          },
        },
        409,
      );
    }
  }

  const memory = await service.createMemory({
    ...parsed.data,
    userId,
    url: normalizedUrl,
  });
  pushMemoryEvent(userId, "memory_created", memory.id, {
    id: memory.id,
    title: memory.title,
    content: memory.content,
    tags: memory.tags,
    createdAt: memory.createdAt,
  });
  return c.json(memory, 201);
});
```

- [ ] **Step 3: Add `url` to createMemory params + Cypher, add findMemoryByUrl**

In `apps/api/src/db/memory-service.ts`:

Add `url` to createMemory params interface (line 116-125):

```typescript
async createMemory(params: {
  userId: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
}): Promise<MemoryWithTags> {
```

Add `url: $url` to the CREATE Cypher (line 131-143) — add after `expiresAt`:

```
url: $url
```

And add to the params object (line 156-167):

```
url: params.url ?? null,
```

Add `findMemoryByUrl` method after `createMemory`:

```typescript
async findMemoryByUrl(
  userId: string,
  url: string,
): Promise<{ id: string; title: string; updatedAt: string } | null> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, url: $url})
       WHERE m.status IN ['active', 'pinned']
       RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
       LIMIT 1`,
      { userId, url },
    );
    if (result.records.length === 0) return null;
    const r = result.records[0];
    return {
      id: r.get("id") as string,
      title: r.get("title") as string,
      updatedAt: r.get("updatedAt") as string,
    };
  } finally {
    await session.close();
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/memories.ts apps/api/src/db/memory-service.ts
git commit -m "feat: add URL-based memory deduplication with 409 response"
```

---

### Task 3: Extension — Handle 409 + Pass URL

**Files:**

- Modify: `apps/chrome-extension/src/types/api.ts:36-44`
- Modify: `apps/chrome-extension/src/types/messages.ts:11-21`
- Modify: `apps/chrome-extension/src/background/api-client.ts:25-43`
- Modify: `apps/chrome-extension/src/background/message-handler.ts:34-48`
- Modify: `apps/chrome-extension/src/background/context-menu.ts:35-42`

- [ ] **Step 1: Add `url` to CreateMemoryParams**

In `apps/chrome-extension/src/types/api.ts` line 36-44:

```typescript
export interface CreateMemoryParams {
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
}
```

- [ ] **Step 2: Add duplicate response type to messages**

In `apps/chrome-extension/src/types/messages.ts`, update `BackgroundResponse` (line 11-21):

```typescript
export type BackgroundResponse =
  | { type: "RETRIEVE_RESULT"; memories: MemoryCandidate[] }
  | { type: "SAVE_RESULT"; success: boolean; memoryId?: string; error?: string }
  | {
      type: "SAVE_DUPLICATE";
      existingMemory: { id: string; title: string; updatedAt: string };
    }
  | {
      type: "IMPORT_RESULT";
      success: boolean;
      count: number;
      skipped?: number;
      error?: string;
    }
  | { type: "CONNECTION_RESULT"; connected: boolean; error?: string }
  | { type: "CANCEL_RESULT"; success: boolean };
```

- [ ] **Step 3: Update api-client to handle 409 and add updateMemory**

In `apps/chrome-extension/src/background/api-client.ts`, replace `createMemory` (lines 25-43) and add `updateMemory`:

```typescript
export interface DuplicateResponse {
  existingMemory: { id: string; title: string; updatedAt: string };
}

export type CreateResult =
  | { status: "created"; memory: MemoryWithTags }
  | {
      status: "duplicate";
      existingMemory: DuplicateResponse["existingMemory"];
    };

export async function createMemory(
  params: CreateMemoryParams,
): Promise<CreateResult> {
  const baseUrl = await getBaseUrl();
  const headers = await authHeaders();

  const response = await fetch(`${baseUrl}/memories`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (response.status === 409) {
    const data = (await response.json()) as DuplicateResponse;
    return { status: "duplicate", existingMemory: data.existingMemory };
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create memory: ${error}`);
  }

  const memory = (await response.json()) as MemoryWithTags;
  return { status: "created", memory };
}

export async function updateMemory(
  memoryId: string,
  params: { title?: string; content?: string; tags?: string[] },
): Promise<MemoryWithTags> {
  const baseUrl = await getBaseUrl();
  const headers = await authHeaders();

  const response = await fetch(`${baseUrl}/memories/${memoryId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update memory: ${error}`);
  }

  return response.json() as Promise<MemoryWithTags>;
}
```

- [ ] **Step 4: Update message-handler SAVE_PAGE to pass URL and handle dedup**

In `apps/chrome-extension/src/background/message-handler.ts`, replace the SAVE_PAGE case (lines 34-48):

```typescript
case "SAVE_PAGE": {
  try {
    const result = await createMemory({
      title: message.title,
      content: message.content.slice(0, 10000),
      type: "knowledge",
      source: "browser-extension",
      tags: [new URL(message.url).hostname],
      confidence: 1.0,
      url: message.url,
    });
    if (result.status === "duplicate") {
      return {
        type: "SAVE_DUPLICATE",
        existingMemory: result.existingMemory,
      };
    }
    return { type: "SAVE_RESULT", success: true, memoryId: result.memory.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return { type: "SAVE_RESULT", success: false, error };
  }
}
```

- [ ] **Step 5: Update context-menu to pass URL**

In `apps/chrome-extension/src/background/context-menu.ts`, update `createMemory` call (lines 35-42):

```typescript
const hostname = new URL(url).hostname;
const result = await createMemory({
  title: extraction.title || fallbackTitle,
  content: truncate(extraction.content, 10000),
  type: "knowledge",
  source: "browser-extension",
  tags: [hostname],
  confidence: 1.0,
  url,
});

if (result.status === "duplicate") {
  return { success: false, error: "Already saved" };
}

return { success: true, memoryId: result.memory.id };
```

- [ ] **Step 6: Commit**

```bash
git add apps/chrome-extension/src/types/api.ts apps/chrome-extension/src/types/messages.ts apps/chrome-extension/src/background/api-client.ts apps/chrome-extension/src/background/message-handler.ts apps/chrome-extension/src/background/context-menu.ts
git commit -m "feat: extension handles 409 dedup and passes URL to API"
```

---

### Task 4: Extension — QuickSave Duplicate Confirmation

**Files:**

- Modify: `apps/chrome-extension/src/popup/_components/QuickSave.tsx`

- [ ] **Step 1: Add duplicate confirmation UI**

Replace entire `QuickSave.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@vmem/ui";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { updateMemory } from "@/background/api-client";

export function QuickSave() {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{
    memoryId: string;
    title: string;
    content: string;
    url: string;
  } | null>(null);

  function handleSave() {
    setSaving(true);
    setResult(null);
    setPendingUpdate(null);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id || !tab.url) {
        setSaving(false);
        setResult({ success: false, message: "No active tab found" });
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => document.body.innerText,
        },
        (results) => {
          const content = results?.[0]?.result ?? "";
          const pageContent = typeof content === "string" ? content : "";

          const message: ContentMessage = {
            type: "SAVE_PAGE",
            url: tab.url ?? "",
            title: tab.title ?? "Untitled",
            content: pageContent,
          };

          chrome.runtime.sendMessage(
            message,
            (response: BackgroundResponse | undefined) => {
              setSaving(false);
              if (response?.type === "SAVE_RESULT") {
                setResult(
                  response.success
                    ? { success: true, message: "Page saved to vmem" }
                    : {
                        success: false,
                        message: response.error ?? "Failed to save",
                      },
                );
              } else if (response?.type === "SAVE_DUPLICATE") {
                setPendingUpdate({
                  memoryId: response.existingMemory.id,
                  title: tab.title ?? "Untitled",
                  content: pageContent.slice(0, 10000),
                  url: tab.url ?? "",
                });
              }
            },
          );
        },
      );
    });
  }

  async function handleUpdate() {
    if (!pendingUpdate) return;
    setSaving(true);
    try {
      await updateMemory(pendingUpdate.memoryId, {
        title: pendingUpdate.title,
        content: pendingUpdate.content,
      });
      setPendingUpdate(null);
      setResult({ success: true, message: "Memory updated" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      setResult({ success: false, message: msg });
    } finally {
      setSaving(false);
    }
  }

  function handleDismiss() {
    setPendingUpdate(null);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Save the current page as a memory in vmem.
      </p>

      <Button
        variant="outline"
        className="w-full"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Current Page"}
      </Button>

      {pendingUpdate && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm text-muted-foreground">
            Already saved — update it?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleUpdate}
              disabled={saving}
            >
              Update
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {result && (
        <p
          className={`text-sm ${result.success ? "text-success" : "text-destructive"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/chrome-extension/src/popup/_components/QuickSave.tsx
git commit -m "feat: add duplicate confirmation UI in QuickSave popup"
```

---

### Task 5: Bulk Imports — Silent Dedup Skip

**Files:**

- Modify: `apps/chrome-extension/src/background/import-bookmarks.ts`
- Modify: `apps/chrome-extension/src/background/import-history.ts`

- [ ] **Step 1: Update import-bookmarks with URL pass-through and dedup skip**

Replace `apps/chrome-extension/src/background/import-bookmarks.ts`:

```typescript
import { createMemory } from "./api-client";
import { isCancelled, resetCancel } from "./import-cancel";

interface FlatBookmark {
  title: string;
  url: string;
  folderPath: string[];
}

function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  path: string[] = [],
): FlatBookmark[] {
  const result: FlatBookmark[] = [];

  for (const node of nodes) {
    if (node.url) {
      result.push({ title: node.title, url: node.url, folderPath: path });
    }
    if (node.children) {
      const childPath = node.title ? [...path, node.title] : path;
      result.push(...flattenBookmarks(node.children, childPath));
    }
  }

  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function importBookmarks(): Promise<number> {
  resetCancel();
  const tree = await chrome.bookmarks.getTree();
  const bookmarks = flattenBookmarks(tree);
  let imported = 0;
  let skipped = 0;

  for (const bookmark of bookmarks) {
    if (isCancelled()) break;

    try {
      const result = await createMemory({
        title: bookmark.title || bookmark.url,
        content: `${bookmark.title}\n${bookmark.url}`,
        type: "knowledge",
        source: "bookmarks",
        tags: bookmark.folderPath,
        confidence: 0.8,
        url: bookmark.url,
      });

      if (result.status === "duplicate") {
        skipped++;
      } else {
        imported++;
      }

      chrome.runtime.sendMessage({
        type: "IMPORT_PROGRESS",
        current: imported + skipped,
        total: bookmarks.length,
      });
    } catch {
      // skip failed bookmarks
    }

    await delay(100);
  }

  return imported;
}
```

- [ ] **Step 2: Update import-history with URL pass-through and dedup skip**

Replace `apps/chrome-extension/src/background/import-history.ts`:

```typescript
import { createMemory } from "./api-client";
import { isCancelled, resetCancel } from "./import-cancel";

const SKIP_PREFIXES = ["chrome://", "chrome-extension://", "about:", "edge://"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function importHistory(days: number): Promise<number> {
  resetCancel();
  const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

  const entries = await chrome.history.search({
    text: "",
    maxResults: 1000,
    startTime,
  });

  const filtered = entries.filter((entry) => {
    if (!entry.url) return false;
    return !SKIP_PREFIXES.some((prefix) => entry.url?.startsWith(prefix));
  });

  const seen = new Set<string>();
  const deduplicated = filtered.filter((entry) => {
    if (!entry.url || seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });

  let imported = 0;
  let skipped = 0;

  for (const entry of deduplicated) {
    if (isCancelled()) break;
    if (!entry.url) continue;

    try {
      const hostname = new URL(entry.url).hostname;
      const result = await createMemory({
        title: entry.title || entry.url,
        content: `${entry.title || ""}\n${entry.url}\nVisited ${entry.visitCount ?? 1} times`,
        type: "episodic",
        source: "browsing-history",
        tags: [hostname],
        confidence: 0.6,
        url: entry.url,
      });

      if (result.status === "duplicate") {
        skipped++;
      } else {
        imported++;
      }

      chrome.runtime.sendMessage({
        type: "IMPORT_PROGRESS",
        current: imported + skipped,
        total: deduplicated.length,
      });
    } catch {
      // skip failed entries
    }

    await delay(100);
  }

  return imported;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/chrome-extension/src/background/import-bookmarks.ts apps/chrome-extension/src/background/import-history.ts
git commit -m "feat: bulk imports pass URL and silently skip duplicates"
```

---

### Task 6: Memory Enrichment Service

**Files:**

- Create: `apps/api/src/services/memory-enrichment.ts`
- Modify: `apps/api/src/db/memory-service.ts` (add enrichment write methods)

- [ ] **Step 1: Add enrichment write methods to memory-service**

Add these methods to `MemoryService` class in `apps/api/src/db/memory-service.ts`:

```typescript
async getRecentMemoryTitles(
  userId: string,
  excludeId: string,
  limit = 30,
): Promise<Array<{ id: string; title: string }>> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.id <> $excludeId AND m.status IN ['active', 'pinned']
       RETURN m.id AS id, m.title AS title
       ORDER BY m.updatedAt DESC
       LIMIT $limit`,
      { userId, excludeId, limit: Number(limit) },
    );
    return result.records.map((r) => ({
      id: r.get("id") as string,
      title: r.get("title") as string,
    }));
  } finally {
    await session.close();
  }
}

async applyEnrichment(
  memoryId: string,
  userId: string,
  tags: string[],
  relatedIds: string[],
): Promise<void> {
  const session = this.driver.session();
  try {
    await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})
       OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
       DELETE r`,
      { memoryId, userId },
    );

    if (tags.length > 0) {
      await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         FOREACH (tagName IN $tags |
           MERGE (t:Tag {name: tagName})
           MERGE (m)-[:TAGGED_WITH]->(t)
         )`,
        { memoryId, userId, tags },
      );
    }

    await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})
       OPTIONAL MATCH (m)-[r:RELATES_TO]-()
       WHERE r.reason = 'content similarity'
       DELETE r`,
      { memoryId, userId },
    );

    if (relatedIds.length > 0) {
      await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         UNWIND $relatedIds AS relId
         MATCH (m2:Memory {id: relId, userId: $userId})
         MERGE (m)-[r:RELATES_TO]->(m2)
         ON CREATE SET r.reason = 'content similarity'`,
        { memoryId, userId, relatedIds },
      );
    }
  } finally {
    await session.close();
  }
}
```

- [ ] **Step 2: Create enrichment service**

```typescript
// apps/api/src/services/memory-enrichment.ts
import { z } from "zod/v4";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";
import { pushMemoryEvent } from "../lib/convex";

const ENRICHMENT_MODEL =
  process.env.ENRICHMENT_MODEL ?? "google/gemini-2.0-flash";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const MAX_CONTENT_LENGTH = 2000;

const enrichmentResponseSchema = z.object({
  tags: z.array(z.string()),
  relatedMemoryIds: z.array(z.string()),
});

function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(" ", maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen);
}

function sanitizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "")
    .slice(0, 50);
}

async function callOpenRouter(
  title: string,
  content: string,
  existingMemories: Array<{ id: string; title: string }>,
): Promise<{ tags: string[]; relatedMemoryIds: string[] } | null> {
  const memoryList = existingMemories
    .map((m) => `${m.id}: ${m.title}`)
    .join("\n");

  const prompt = `You are a memory tagging system. Given a memory and a list of existing memories:

1. Generate 3-5 semantic topic tags for this memory. Tags should be lowercase, specific, and reusable (e.g. "react", "authentication", "graph-algorithms", "typescript"). Avoid generic tags like "programming" or "article".

2. From the provided list, identify any memories that are semantically related to this one. Only include strong relationships — shared topic, continuation of the same work, or direct reference.

Memory:
Title: ${title}
Content: ${truncateAtWord(content, MAX_CONTENT_LENGTH)}

Existing memories:
${memoryList || "(none)"}

Respond in JSON only:
{"tags": ["tag1", "tag2"], "relatedMemoryIds": ["id1"]}`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://vmem.vedantb.com",
        },
        body: JSON.stringify({
          model: ENRICHMENT_MODEL,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = data.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = enrichmentResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

export function enrichMemory(
  memoryId: string,
  userId: string,
  title: string,
  content: string,
): void {
  const validIds = new Set<string>();

  const run = async () => {
    const service = new MemoryService(getDriver());
    const existing = await service.getRecentMemoryTitles(userId, memoryId);
    for (const m of existing) validIds.add(m.id);

    const result = await callOpenRouter(title, content, existing);
    if (!result) return;

    const tags = result.tags
      .map(sanitizeTag)
      .filter((t) => t.length > 0)
      .slice(0, 5);

    const relatedIds = result.relatedMemoryIds.filter((id) => validIds.has(id));

    if (tags.length === 0) return;

    await service.applyEnrichment(memoryId, userId, tags, relatedIds);

    pushMemoryEvent(userId, "memory_enriched", memoryId, {
      tags,
      relatedIds,
    });
  };

  run().catch((err) => {
    console.error(`[enrichment] failed for ${memoryId}:`, err);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/memory-enrichment.ts apps/api/src/db/memory-service.ts
git commit -m "feat: add LLM-powered memory enrichment service"
```

---

### Task 7: Wire Enrichment into API Routes

**Files:**

- Modify: `apps/api/src/routes/memories.ts:57-75` (POST handler)
- Modify: `apps/api/src/routes/memories.ts:109-134` (PATCH handler)

- [ ] **Step 1: Trigger enrichment after create and update**

In `apps/api/src/routes/memories.ts`, add import at top:

```typescript
import { enrichMemory } from "../services/memory-enrichment";
```

After the `pushMemoryEvent` call in the POST handler, add:

```typescript
enrichMemory(memory.id, userId, memory.title, memory.content);
```

In the PATCH handler (around line 109-134), after the existing `pushMemoryEvent`, add:

```typescript
enrichMemory(memory.id, userId, memory.title, memory.content);
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/memories.ts
git commit -m "feat: trigger enrichment on memory create and update"
```

---

### Task 8: Update Changelog + Type Check

**Files:**

- Modify: `internal/changelog.md`

- [ ] **Step 1: Run type check on API**

```bash
cd apps/api && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run type check on extension**

```bash
cd apps/chrome-extension && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 3: Update changelog**

Add entry to `internal/changelog.md`.

- [ ] **Step 4: Commit**

```bash
git add internal/changelog.md
git commit -m "docs: add changelog for dedup + enrichment feature"
```
