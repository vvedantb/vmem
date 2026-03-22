# Document Processing + Vector Search — Design Spec

## Problem

vmem stores text-based memories in Neo4j with fulltext + hybrid ranking search. Users also have PDFs, notes, and text files they want to search semantically. Currently no way to upload, process, or vector-search documents.

## Solution

Add document upload, text extraction, chunking, embedding generation, and vector search — all within Neo4j alongside the existing memory graph. Documents are first-class graph citizens that can link to memories and tags.

## Architecture

### Storage Split

- **Convex file storage** — original file blobs (for viewing/downloading)
- **Convex `documents` table** — metadata for UI reactivity (list views, status updates)
- **Neo4j** — Document + DocumentChunk nodes, vector index, graph relationships

### Data Model

#### Neo4j Nodes

**Document**
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | string | Owner (Clerk ID) |
| title | string | Display title |
| filename | string | Original filename |
| mimeType | string | application/pdf, text/plain, text/markdown |
| convexFileId | string | Reference to Convex storage |
| chunkCount | number | Total chunks |
| status | string | processing, ready, failed |
| createdAt | string | ISO timestamp |
| updatedAt | string | ISO timestamp |

**DocumentChunk**
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| documentId | UUID | Parent document reference |
| index | number | Position in document (0-based) |
| content | string | Raw text of this chunk |
| embedding | float[] | 1536-dimension vector |
| tokenCount | number | Token count for this chunk |
| createdAt | string | ISO timestamp |

#### Neo4j Relationships

- `Document -[:HAS_CHUNK]-> DocumentChunk`
- `Document -[:TAGGED_WITH]-> Tag` (reuses existing Tag nodes)
- `Document -[:RELATES_TO]-> Memory` (cross-linking via enrichment)

#### Neo4j Vector Index

```cypher
CREATE VECTOR INDEX chunk_embedding FOR (c:DocumentChunk) ON (c.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}
```

#### Convex `documents` Table

| Field           | Type              | Description                            |
| --------------- | ----------------- | -------------------------------------- |
| clerkId         | string            | Owner                                  |
| title           | string            | Display title                          |
| filename        | string            | Original filename                      |
| mimeType        | string            | File type                              |
| fileSize        | number            | Bytes                                  |
| storageId       | Id<"\_storage">   | Convex file blob                       |
| neo4jDocumentId | string            | Link to Neo4j Document node            |
| status          | string            | processing, ready, failed              |
| chunkCount      | number            | Total chunks                           |
| errorMessage    | string (optional) | Failure reason when status is "failed" |
| createdAt       | number            | Timestamp                              |
| updatedAt       | number            | Timestamp                              |

Fields defined as exported `const documentFields = { ... }` in `validators.ts` per codebase convention.

### Processing Pipeline

```
Upload (sync)
├── Receive multipart file
├── Validate: type (pdf/txt/md), size (≤10MB)
├── Store file blob in Convex storage
│   ├── Call Convex mutation to generate upload URL (storage.generateUploadUrl())
│   ├── POST file bytes to that URL → receive storageId
│   └── Call Convex mutation to create document record with storageId
├── Create Document node in Neo4j (status: processing)
└── Return documentId

Background Processing (async)
├── Download file from Convex storage
│   └── Get storage URL via Convex query, fetch file bytes via HTTP
├── Extract text
│   ├── PDF → pdf-parse
│   └── .txt/.md → UTF-8 read
├── Chunk text (~500 tokens, ~50 token overlap)
├── Validate chunk count (≤100)
├── Batch embed chunks via OpenRouter
│   └── Model: openai/text-embedding-3-small (1536 dims)
├── Create DocumentChunk nodes in Neo4j with embeddings
├── Update Document status → ready (Neo4j + Convex)
└── Trigger async enrichment

Enrichment (async)
├── Take document title + first few chunks as context
├── Fetch recent 30 memories (same as memory enrichment)
├── Call OpenRouter (google/gemini-2.0-flash)
│   └── Generate 3-5 tags + identify related memory IDs
├── Apply TAGGED_WITH and RELATES_TO relationships
└── Log event to Convex
```

### Search

**Endpoint:** `POST /v1/documents/search`

**Request:**

- `query` (string) — search text
- `limit` (number, default 10) — max results
- `scoreThreshold` (number, default 0.5) — minimum cosine similarity

**Flow:**

1. Embed query via OpenRouter (`openai/text-embedding-3-small`)
2. Vector search in Neo4j:
   ```cypher
   CALL db.index.vector.queryNodes('chunk_embedding', $limit, $queryVector)
   YIELD node, score
   ```
   Note: parameter order is (indexName, k, vector). Pass inflated limit (e.g., `limit * 3`) because userId filtering is post-hoc — Neo4j vector index does not support pre-filtering.
3. Post-filter by userId and scoreThreshold
4. Fetch parent Document metadata for each chunk
5. Return chunks with: content, score, documentTitle, filename, chunkIndex

**Not included (deferred):** Unified search merging memory retrieval + document vector search into one ranked list.

## API Endpoints

| Method | Path                 | Description                               |
| ------ | -------------------- | ----------------------------------------- |
| POST   | /v1/documents/upload | Multipart upload + trigger processing     |
| GET    | /v1/documents        | List documents (paginated, status filter) |
| GET    | /v1/documents/:id    | Document metadata + chunks                |
| DELETE | /v1/documents/:id    | Delete document + chunks + relationships  |
| POST   | /v1/documents/search | Semantic vector search                    |

## New Files

| Path                                         | Purpose                              |
| -------------------------------------------- | ------------------------------------ |
| apps/api/src/routes/documents.ts             | Route handlers                       |
| apps/api/src/db/document-service.ts          | Neo4j CRUD + vector search           |
| apps/api/src/services/document-processing.ts | Text extraction, chunking, embedding |
| apps/api/src/services/document-enrichment.ts | Async tag + memory linking           |

## New Dependencies

- `pdf-parse` — PDF text extraction (no native deps)

## Constraints

- Max file size: 10MB
- Max chunks per document: 100
- Supported formats: PDF, .txt, .md
- Embedding dimensions: 1536 (OpenAI text-embedding-3-small)

## Error Handling

- Extraction failure → Document status: failed, no chunks created
- Partial embedding failure → retry failed chunks only
- File type/size validation at upload time (reject before processing)
