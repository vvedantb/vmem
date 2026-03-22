# Document Processing + Vector Search

## Overview

Process PDF/text files, chunk them, generate embeddings via OpenRouter, store in Neo4j with vector index. Enables semantic search over uploaded documents alongside existing memory graph.

## Decisions

- **Vector store:** Neo4j native vector index (not Convex RAG) — keeps documents in same graph as memories, enables cross-linking
- **Embedding model:** `openai/text-embedding-3-small` via OpenRouter (1536 dimensions)
- **File storage:** Convex file storage (for viewing/downloading originals)
- **Chunking:** Fixed-size ~500 tokens, ~50 token overlap. Upgrade to semantic chunking later.
- **Supported formats:** PDF (`pdf-parse`) + plain text (.txt, .md)
- **Limits:** 10MB per file, ~100 chunks max per document
- **Search:** Separate `/v1/documents/search` endpoint. Unified search with memories deferred.
- **Enrichment:** Async background job after chunking — tags document + links to related memories via existing enrichment pattern
- **Metadata:** Stored in both Convex (file blob + UI reactivity) and Neo4j (graph relationships)

## Data Model

### Neo4j Nodes

**Document**

- `id` (UUID)
- `userId`
- `title`
- `filename`
- `mimeType`
- `convexFileId` (reference to Convex storage)
- `chunkCount`
- `status`: processing | ready | failed
- `createdAt`
- `updatedAt`

**DocumentChunk**

- `id` (UUID)
- `documentId`
- `index` (position in document)
- `content` (raw text)
- `embedding` (float[] — 1536 dimensions)
- `tokenCount`
- `createdAt`

### Neo4j Relationships

- `Document -[:HAS_CHUNK]-> DocumentChunk` (ordered by index)
- `Document -[:TAGGED_WITH]-> Tag` (reuse existing Tag nodes)
- `Document -[:RELATES_TO]-> Memory` (cross-linking via enrichment)

### Neo4j Vector Index

```cypher
CREATE VECTOR INDEX chunk_embedding FOR (c:DocumentChunk) ON (c.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}
```

### Convex — `documents` table

- `clerkId`
- `title`
- `filename`
- `mimeType`
- `fileSize`
- `storageId` (Convex file storage reference)
- `neo4jDocumentId`
- `status`: processing | ready | failed
- `chunkCount`
- `errorMessage` (optional — failure reason)
- `createdAt`
- `updatedAt`

Fields defined as `const documentFields` in `validators.ts` per codebase convention.

## Pipeline (Hono API)

```
1. POST /v1/documents/upload
   → Receive multipart file upload
   → Upload file to Convex storage
   → Create Document node in Neo4j (status: processing)
   → Create document record in Convex
   → Return documentId immediately

2. Background processing:
   → Download file from Convex storage
   → Extract text (pdf-parse for PDF, raw read for .txt/.md)
   → Chunk text (~500 tokens, 50 token overlap)
   → Batch embed chunks via OpenRouter (openai/text-embedding-3-small)
   → Create DocumentChunk nodes in Neo4j with embeddings
   → Update Document status → ready (Neo4j + Convex)
   → Async enrichment: tag document + find related memories

3. POST /v1/documents/search
   → Embed query via OpenRouter
   → CALL db.index.vector.queryNodes('chunk_embedding', k * 3, queryVector) YIELD node, score
   → Post-filter by userId + scoreThreshold (vector index has no pre-filtering)
   → Return matched chunks with: content, score, documentTitle, filename, chunkIndex
```

## API Endpoints

- `POST /v1/documents/upload` — multipart file upload + trigger processing
- `GET /v1/documents` — list user's documents (paginated, filtered by status)
- `GET /v1/documents/:id` — document metadata + chunk list
- `DELETE /v1/documents/:id` — delete document + all chunks + relationships
- `POST /v1/documents/search` — semantic vector search (query, limit, scoreThreshold)

## File Structure (new files)

- `apps/api/src/routes/documents.ts` — route handlers
- `apps/api/src/db/document-service.ts` — Neo4j CRUD + vector search
- `apps/api/src/services/document-processing.ts` — text extraction, chunking, embedding
- `apps/api/src/services/document-enrichment.ts` — async tag + memory linking

## New Dependencies

- `pdf-parse` — PDF text extraction

## Enrichment

- Runs async after chunking completes (same pattern as memory-enrichment.ts)
- Takes document title + first few chunks as context
- Calls OpenRouter (google/gemini-2.0-flash) to generate 3-5 tags + identify related memory IDs
- Applies TAGGED_WITH and RELATES_TO relationships to Document node
- Logs event to Convex

## Error Handling

- Extraction failure → status: failed, no chunks created
- Partial embedding failure → retry failed chunks, don't reprocess successful ones
