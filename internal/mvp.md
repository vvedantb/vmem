Plan

V1 should be:

A memory API + dashboard for storing, retrieving, inspecting, and correcting long-term AI memory across

That means the MVP is not:

advanced graph traversal
dream mode
voice
deep connector ecosystem
heavy automation
polished forecasting

It is this.

MVP Scope

Write memory
Apps can save memories with:
content
type
source
tags
timestamp
confidence
Search and retrieve memory
Apps can retrieve relevant memories using:
semantic search
keyword search
hybrid ranking
basic filters
Explain retrieval
Every retrieval returns:
why this memory matched
score breakdown
source
freshness
confidence
Handle conflicts safely
If a new memory appears to contradict an existing one:
don’t overwrite
create a proposed update
let the user approve/reject
User control panel
Dashboard lets users:
view memories
edit memories
delete memories
pin memories
suppress memories
expire memories
review proposed updates
Auditability
Track:
where memory came from
when it was created
when it was retrieved
which app/agent used it
Core Memory Objects

Keep it simple:

Memory
The stored fact/note/context unit.
MemoryCandidate
A retrieval result with explanation metadata.
ProposedUpdate
A suggested change to an existing memory.
MemoryEvent
Audit log for create/update/retrieve/delete/use.
Source
Where the memory came from: chat, API, file, connector, manual.
Memory Types For V1

Only 3:

profile
Stable user facts/preferences
episodic
Past events/interactions
knowledge
Durable extracted knowledge/notes
Do not add more types yet.

Key User Flows

App writes a memory from a conversation
App retrieves memories before answering
Developer inspects retrieval in Context Trace
User sees a conflicting fact and approves/rejects update
User edits or forgets a bad memory
API Surface

Keep the first API tiny:

POST /memories
GET /memories
GET /memories/:id
PATCH /memories/:id
DELETE /memories/:id
POST /memories/search
POST /memories/retrieve
GET /memories/:id/events
GET /proposed-updates
POST /proposed-updates/:id/approve
POST /proposed-updates/:id/reject
For MCP, only expose the equivalent core tools:

memory_write
memory_retrieve
memory_search
memory_get
memory_update_proposal_review
Dashboard Pages

MVP dashboard only needs:

Memories
Table/list view with filters
Memory Detail
Content, metadata, origin, usage, status
Context Trace
Why a retrieval happened
Proposed Updates
Approve/reject conflicts
Settings/API Keys
Already aligned with your current Convex side
Skip graph view for MVP unless it’s extremely cheap.

What Makes This MVP Different

Not “we store memory.”
It’s:

memory with explanation
memory with approval workflows
memory with lifecycle controls
That is your wedge.

What To Defer

Push these out of MVP:

Neo4j
graph UI
dream mode
voice memory
browser history/bookmark ingestion
mobile
complex connector marketplace
forecasting/predictions
procedural memory
automatic multi-hop graph reasoning
Success Criteria

Your MVP is good if:

an app can save and retrieve useful memory across sessions
a developer can understand why a memory was retrieved
a user can correct or reject bad memory updates
memory feels safer and more transparent than competitors
My strongest recommendation: build the first version around Memory + Context Trace + Proposed Updates. That is the real MVP wedge.

MVP (now)
├── Memory engine (Hono + Neo4j + Neon/pgvector)
├── CRUD + search + hybrid ranking
├── Context Trace (explain retrievals)
├── Proposed Updates (conflict resolution)
├── Dashboard (view, edit, approve/reject)
├── MCP server (5 core tools)
└── REST API

V2 (after MVP)
├── Dream Mode
├── Code context (git integration)
├── Chrome extension
├── Graph UI
├── Voice
