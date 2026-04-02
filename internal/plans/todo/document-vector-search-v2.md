# Document Processing + Vector Search — Implementation Plan

## Context

vmem currently stores text memories in Neo4j with fulltext search. Users need to upload PDF/text files, have them chunked and embedded, and search them semantically via Neo4j vector index. Files stored in Convex, processing in Hono API, vectors in Neo4j.

Full spec: `docs/superpowers/specs/2026-03-22-document-vector-search-design.md`

---

## Step 1: Install dependency

Add `pdf-parse` to `apps/api/`:

```
cd apps/api && npm install pdf-parse
```

---

## Step 2: Convex schema + validators

### New file: `packages/backend/convex/validators.ts`

Export `documentFields` per CLAUDE.md convention:

```ts
import { v } from "convex/values";

export const documentFields = {
  clerkId: v.string(),
  title: v.string(),
  filename: v.string(),
  mimeType: v.union(
    v.literal("application/pdf"),
    v.literal("text/plain"),
    v.literal("text/markdown"),
  ),
  fileSize: v.number(),
  storageId: v.string(),
  neo4jDocumentId: v.string(),
  status: v.union(
    v.literal("processing"),
    v.literal("ready"),
    v.literal("failed"),
  ),
  chunkCount: v.number(),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
};
```

### Modify: `packages/backend/convex/schema.ts`

Add `documents` table using spread of `documentFields`:

```ts
import { documentFields } from "./validators";
// ...
documents: defineTable({ ...documentFields })
  .index("by_clerk_id", ["clerkId"])
  .index("by_clerk_status", ["clerkId", "status"]),
```

---

## Step 3: Convex document functions

### New file: `packages/backend/convex/documents.ts`

**Secret-based functions (called from Hono API via ConvexHttpClient):**

- `generateUploadUrl` — mutation, validates secret, calls `ctx.storage.generateUploadUrl()`, returns URL
- `createDocument` — mutation, validates secret, inserts into `documents` table, returns doc ID
- `updateDocumentStatus` — mutation, validates secret, patches status + chunkCount + errorMessage + updatedAt

**Auth-based functions (called from browser):**

- `listByUser` — `authQuery`, queries `by_clerk_id` index, returns docs ordered desc by `createdAt`
- `getByUser` — `authQuery`, gets single doc, validates ownership via clerkId match
- `deleteDocument` — `authMutation`, deletes doc + file from storage

Follow exact pattern from `memoryEvents.ts` for secret validation and `auth.ts` wrappers for browser functions.

---

## Step 4: Neo4j schema setup

### Modify: `apps/api/src/db/setup.ts`

Add after existing constraints (same `session.run()` pattern):

```cypher
CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE
CREATE CONSTRAINT document_chunk_id IF NOT EXISTS FOR (c:DocumentChunk) REQUIRE c.id IS UNIQUE
CREATE INDEX document_user_id IF NOT EXISTS FOR (d:Document) ON (d.userId)
CREATE INDEX document_user_created IF NOT EXISTS FOR (d:Document) ON (d.userId, d.createdAt)
CREATE VECTOR INDEX chunk_embedding IF NOT EXISTS FOR (c:DocumentChunk) ON (c.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}
```

---

## Step 5: Document service (Neo4j CRUD + vector search)

### New file: `apps/api/src/db/document-service.ts`

Class `DocumentService` — same pattern as `MemoryService` (constructor takes `Driver`, session/try/finally).

**Methods:**

1. `createDocument(params)` → CREATE Document node with: id (UUID), userId, title, filename, mimeType, convexFileId, status:"processing", chunkCount:0, createdAt, updatedAt

2. `createChunks(documentId, userId, chunks[])` → Transaction: UNWIND chunks, CREATE DocumentChunk nodes with embedding + HAS_CHUNK relationships. Update Document chunkCount + status:"ready" + updatedAt.

3. `updateDocumentStatus(userId, documentId, status, errorMessage?)` → MATCH + SET status, errorMessage, updatedAt

4. `getDocument(userId, documentId)` → MATCH Document + count chunks, return null if not found/wrong user

5. `listDocuments(userId, limit, offset)` → paginated list with `neo4j.int()`, ORDER BY createdAt DESC

6. `deleteDocument(userId, documentId)` → MATCH Document, DETACH DELETE document + all chunks. Return boolean.

7. `vectorSearch(userId, queryVector, limit)` → Key method:

   ```cypher
   CALL db.index.vector.queryNodes('chunk_embedding', $inflatedLimit, $queryVector)
   YIELD node, score
   MATCH (node)<-[:HAS_CHUNK]-(d:Document {userId: $userId})
   RETURN node.content AS content, node.index AS chunkIndex, score, d.id AS documentId, d.title AS title, d.filename AS filename
   ORDER BY score DESC
   LIMIT $limit
   ```

   Pass `inflatedLimit = limit * 3` to handle userId post-filtering.

8. `applyEnrichment(documentId, userId, tags[], relatedMemoryIds[])` → Transaction: MERGE tags + TAGGED_WITH, create RELATES_TO edges to Memory nodes. Same pattern as `MemoryService.applyEnrichment()`.

**Pattern references:**

- `apps/api/src/db/memory-service.ts` — session management, UUID, neo4j.int(), transaction pattern, applyEnrichment

---

## Step 6: Document processing service

### New file: `apps/api/src/services/document-processing.ts`

Standalone functions (not a class), same as enrichment pattern:

1. `extractText(buffer: Buffer, mimeType: string): string`
   - `text/plain`, `text/markdown` → `buffer.toString("utf-8")`
   - `application/pdf` → `pdfParse(buffer)` then `.text`
   - Throw on unsupported type

2. `chunkText(text: string): Array<{ text: string; index: number }>`
   - ~2000 chars per chunk, ~200 char overlap
   - Step forward by 1800 chars each iteration
   - Cap at 100 chunks
   - Return array with index

3. `embedTexts(texts: string[]): Promise<number[][]>`
   - POST `https://openrouter.ai/api/v1/embeddings`
   - Headers: `Authorization: Bearer $OPENROUTER_API_KEY`, `Content-Type: application/json`
   - Body: `{ model: "openai/text-embedding-3-small", input: texts }`
   - Zod-validate response, return array of vectors
   - Use env var `OPENROUTER_API_KEY` (already exists in codebase)

4. `processDocument(documentId, userId, fileUrl, mimeType, convexDocId)`: void (fire-and-forget)
   - Inner `async run()` with `.catch()` — same pattern as `enrichMemory()`
   - Fetch file from Convex storage URL
   - extractText → chunkText → embedTexts
   - Call `DocumentService.createChunks()`
   - Update Convex doc status → "ready" via ConvexHttpClient
   - On error: update Neo4j + Convex status → "failed" with errorMessage
   - Fire `enrichDocument()` on success

**Pattern references:**

- `apps/api/src/services/memory-enrichment.ts` — fire-and-forget, OpenRouter fetch, Zod validation

---

## Step 7: Document enrichment service

### New file: `apps/api/src/services/document-enrichment.ts`

Export `enrichDocument(documentId, userId, filename, firstChunksText): void`

Exact same pattern as `enrichMemory()`:

- Fire-and-forget async wrapper
- Get recent memory titles via `MemoryService.getRecentMemoryTitles()`
- Call OpenRouter chat completions (same model) with prompt asking for 3-5 tags + related memory IDs
- Zod validate response
- Call `DocumentService.applyEnrichment()`
- Push event to Convex

**Pattern references:**

- `apps/api/src/services/memory-enrichment.ts` — entire file is the template

---

## Step 8: Convex integration updates

### Modify: `apps/api/src/lib/convex.ts`

Add document event push function. Two options:

- Option A: Expand `MemoryEventType` to include document events + rename to generic
- Option B: Add separate `pushDocumentEvent` function

Go with **Option B** — minimal change, keeps memory events separate.

Add `pushDocumentEvent(clerkId, eventType, documentId, payload)` — same pattern as `pushMemoryEvent`.

### Modify: `packages/backend/convex/memoryEvents.ts`

Add document event types to `eventTypeValidator`:

```ts
v.literal("document_uploaded"),
v.literal("document_ready"),
v.literal("document_failed"),
```

### Modify: `packages/backend/convex/schema.ts`

Update `memoryEvents` table `eventType` field to include the new document literals.

---

## Step 9: Document routes

### New file: `apps/api/src/routes/documents.ts`

`const documents = new Hono<{ Variables: { userId: string } }>()`

**Zod schemas:**

- `uploadSchema` — for validating multipart metadata (title optional, falls back to filename)
- `searchSchema` — `{ query: string, limit?: number (default 10, max 50), scoreThreshold?: number (default 0.5) }`

**Routes:**

1. `POST /` — Upload
   - Parse multipart: `await c.req.formData()`
   - Get `file` (File object) + optional `title` from form data
   - Validate: file size ≤ 10MB, mimeType in allowed set
   - Call Convex `generateUploadUrl` → POST file to URL → get storageId
   - Call Convex `createDocument` with metadata
   - Create Document node in Neo4j (status: processing)
   - Fire `processDocument()` (async, don't await)
   - Return 201 with document metadata

2. `GET /` — List
   - Query params: `limit`, `offset`, `status` (optional)
   - Call `DocumentService.listDocuments()`
   - Return paginated list

3. `GET /:id` — Get single
   - Call `DocumentService.getDocument()`
   - 404 if not found

4. `DELETE /:id` — Delete
   - Call `DocumentService.deleteDocument()` (Neo4j)
   - Call Convex `deleteDocument` mutation
   - Push event
   - Return `{ status: "deleted" }`

5. `POST /search` — Vector search
   - Validate body with `searchSchema`
   - Call `embedTexts([query])` to get query vector
   - Call `DocumentService.vectorSearch(userId, vector, limit)`
   - Filter by scoreThreshold
   - Return `{ results: [...] }`

**Pattern references:**

- `apps/api/src/routes/memories.ts` — route structure, Zod validation, getService(), error responses

---

## Step 10: Mount routes

### Modify: `apps/api/src/index.ts`

Add import + auth middleware + route mount:

```ts
import { documents } from "./routes/documents";
// ...
app.use("/documents/*", authMiddleware);
// ...
app.route("/documents", documents);
```

---

## Step 11: Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — Convex types compile
2. `cd apps/api && npx tsc --noEmit` — API types compile
3. Start API, check console for "neo4j indexes and constraints ready" (includes new vector index)
4. Manual test flow:
   - Upload .txt file via `POST /v1/documents` → 201, status "processing"
   - Poll `GET /v1/documents/:id` → status "ready", chunkCount > 0
   - `POST /v1/documents/search` with `{ query: "relevant term" }` → matching chunks with scores
   - `DELETE /v1/documents/:id` → deleted, no orphaned chunks in Neo4j
5. Wire up frontend files page to use new endpoints (separate task)

---

## Critical Files

| File                                         | Action                                            |
| -------------------------------------------- | ------------------------------------------------- |
| `apps/api/src/routes/memories.ts`            | Reference (route patterns)                        |
| `apps/api/src/db/memory-service.ts`          | Reference (Neo4j service patterns)                |
| `apps/api/src/services/memory-enrichment.ts` | Reference (enrichment + OpenRouter patterns)      |
| `apps/api/src/lib/convex.ts`                 | Modify (add pushDocumentEvent)                    |
| `apps/api/src/db/setup.ts`                   | Modify (add constraints + vector index)           |
| `apps/api/src/index.ts`                      | Modify (mount routes)                             |
| `packages/backend/convex/schema.ts`          | Modify (add documents table, update memoryEvents) |
| `packages/backend/convex/memoryEvents.ts`    | Modify (add document event types)                 |
| `packages/backend/convex/auth.ts`            | Reference (authQuery/authMutation wrappers)       |
