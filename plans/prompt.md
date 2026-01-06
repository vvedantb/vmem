# Ralph Agent Instructions

## Your Task

1. Read `scripts/ralph/prd.json`
2. Read `scripts/ralph/progress.txt`
   (check Codebase Patterns first)
3. Check you're on the correct branch (`main`)
4. Pick highest priority story where `passes: false`
5. Implement that ONE story completely
6. Run typecheck and tests
7. Update AGENTS.md files with learnings
8. Commit: `feat: [ID] - [Title]`
9. Update prd.json: `passes: true`
10. Append learnings to progress.txt

## Project Context

**vMemory** is a personal memory vault with infinite recall, designed as an alternative to mem0/supermemory with voice support as the MVP differentiator.

### Key Features

- **Voice Support**: Unlike mem0/supermemory (text-only), vMemory supports voice input and transcription
- **MCP Server**: Model Context Protocol server for ChatGPT, Claude, and other LLM chat apps
- **Vector Database**: Semantic search and unlimited recall using embeddings
- **Memory Graph**: Obsidian-like graph visualization of memory relationships
- **Data Export**: Avoid vendor lock-in with full data export
- **Connectors**: Integrate with external apps (Google Drive, Notion, etc.) - connect once, use everywhere

### Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, HeroUI
- **Backend**: Java + Spring Boot (not implemented yet - use mock APIs)
- **Vector DB**: TBD (future)
- **MCP**: Model Context Protocol server (future)

### Current State

- Frontend UI is complete with mock data
- **Focus: Frontend-only features for now**
- Use mock API endpoints or local state for data
- Backend integration will come later

## Implementation Guidelines

### Frontend (Next.js/React)

- Server components by default, client components only when needed
- Use HeroUI components for UI consistency
- Follow existing design system (black/white minimal theme)
- Use TypeScript strictly
- Handle loading and error states properly
- Use proper Next.js patterns (App Router)
- **For API calls: Use mock endpoints or local state until backend is ready**

### Mock API Pattern

- Create API route handlers in `app/api/` directory (Next.js API routes)
- These will be replaced with real backend calls later
- Example: `app/api/memories/route.ts` for GET/POST /api/memories
- Return mock JSON data matching expected backend response format

### Codebase Patterns

- Check `ai-guidance/project-structure.md` for architecture
- Check `ai-guidance/changelog.md` for recent changes
- Follow existing component patterns
- Use Tabler icons for consistency
- Maintain responsive design (mobile + desktop)
- Use HeroUI ToastProvider for notifications

## Progress Format

APPEND to progress.txt:

## [Date] - [Story ID]

- What was implemented
- Files changed
- **Learnings:**
  - Patterns discovered
  - Gotchas encountered
  - Frontend implementation notes

---

## Codebase Patterns

Add reusable patterns to the TOP of progress.txt:

## Codebase Patterns

- Frontend: Server components by default, extract interactive parts to client components
- Frontend: Use HeroUI components, Tabler icons
- Frontend: Follow black/white minimal design system
- Frontend: Mock APIs in `app/api/` directory using Next.js route handlers
- Frontend: Use HeroUI ToastProvider for notifications
- Frontend: Handle loading/error/empty states in all data-fetching components

## Stop Condition

If ALL stories pass, reply:
<promise>COMPLETE</promise>

Otherwise end normally.

## Priority Focus

1. **Priority 1**: Core memory CRUD UI, list display, search (foundation)
2. **Priority 2**: Voice input, graph visualization, memory details (MVP features)
3. **Priority 3**: Data export, connectors UI, auth UI, API keys UI
4. **Priority 4**: Chat interface, file management, tags management
5. **Priority 5**: Notifications, dashboard improvements

Work through priorities sequentially, but you can skip to higher priorities if blocked on lower ones.

## Mock Data Strategy

- Use Next.js API routes (`app/api/`) for mock endpoints
- Store mock data in memory or JSON files
- Match expected backend response format
- Add realistic delays (setTimeout) to simulate network calls
- Return proper HTTP status codes
