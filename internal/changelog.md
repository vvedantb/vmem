# Changelog

## 2026-03-15

### Mintlify Documentation Scaffold

- Set up Mintlify docs at `apps/docs/` with `docs.json` config and 11 MDX pages
- Four sections: Getting Started (intro + quickstart), API Reference (all 14 endpoints across memories, proposed updates, dashboard), MCP Integration (overview + implicit memory pattern), Concepts (memory types, context trace, proposed updates)
- Content pulled from internal docs and actual API route definitions to keep docs accurate
- Added `pnpm docs` script to root for local preview on port 3001
- Mintlify web editor available via dashboard once GitHub repo is connected

## 2026-03-15

### Chrome Extension — Full Implementation

- Built Chrome extension (MV3) at `apps/chrome-extension/` with all core features: save page, export to vmem (ChatGPT/Claude), use vmem context injection, import bookmarks, import browsing history
- Architecture: background service worker handles all API calls (API key never leaves background scope), popup for settings/quick save/imports, content scripts injected into ChatGPT + Claude for export/use vmem buttons
- Export flow uses MCP — extension injects a prompt into the LLM's input telling it to save the conversation via vmem MCP tools (no direct API call for export)
- "Use vmem" retrieves memories from the API and prepends them as context above the user's message in the textarea
- Build: Vite multi-entry with separate builds (popup=React+Tailwind, background=ES module, content scripts=IIFE) — no CRXJS due to MV3 service worker flakiness
- Content scripts handle React-controlled textareas (ChatGPT) and contenteditable divs (Claude) with native setter dispatch for state updates
- All DOM selectors isolated in per-site `selectors.ts` files for easy maintenance when sites update their DOM

## 2026-03-11

### Rewrite Memory Graph with Graphology + Sigma.js (WebGL)

- Replaced hand-rolled Canvas 2D force simulation (603 lines, O(n²) per frame) with Graphology for graph data + Sigma.js for WebGL rendering
- Old implementation had manual force simulation running on every requestAnimationFrame, manual pan/zoom/hit-testing — wouldn't scale past ~100 nodes
- New implementation: Graphology builds typed graph model, ForceAtlas2 computes layout once (50 iterations synchronously), Sigma handles all rendering via WebGL
- Extracted into 4 files: `MemoryGraph.tsx` (orchestrator, ~150 lines), `GraphRenderer.tsx` (Sigma mount + camera controls), `GraphNodeTooltip.tsx` (hover overlay), `GraphNodeDetailDialog.tsx` (click detail dialog), `graph-types.ts` (shared types)
- Node sizing is now degree-based (5 + degree \* 2), node color is hashed from first tag
- Should handle 1000+ nodes smoothly vs old ~100 node ceiling
- Added deps: graphology, sigma, graphology-layout-forceatlas2, graphology-types

## 2026-03-10

### Replace Drizzle/Neon with Neo4j as Memory Store

- Removed Drizzle ORM, Neon serverless driver, and all Postgres schema/config from `apps/api`
- Added Neo4j driver (`neo4j-driver`) as the primary memory database — memories are nodes, relationships are edges, which matches the product model directly
- Neo4j chosen over Postgres because the core data model is a graph (memories, tags, sources, relationships, contradictions) — forcing this into relational tables would fight the data model
- Postgres + pgvector will be added later only if file embedding search outgrows Neo4j's built-in vector index

### Memory Engine Core (Hono + Neo4j)

- Created `apps/api` with Hono on Node.js (via `@hono/node-server`) — lightweight HTTP framework, will add MCP transport later on the same server
- Built `MemoryService` class (`src/db/memory-service.ts`) with full CRUD + smart retrieval:
  - Create/get/list/update/delete memories with tag and source relationships
  - Full-text search via Neo4j fulltext index
  - **Retrieve with Context Trace** — the core differentiator: every retrieval returns a score breakdown (fulltext relevance, recency, confidence) and a human-readable reason for why each memory matched
  - Audit trail: every create/update logs a `MemoryEvent` node linked to the memory
  - Proposed updates: conflict detection with pending/approved/rejected workflow
- Auto-creates Neo4j constraints (unique Memory.id, Tag.name, Source.name, ProposedUpdate.id) and indexes (userId, type, status, fulltext on content) on server startup
- REST API with Zod v4 validation across all 11 endpoints
- Documented MCP architecture decision: memory reads should be implicit (MCP Resources injected before inference), not explicit tool calls — differentiates vmem from Mem0/Supermemory's tool-only approach

## 2026-02-23

### Port Vibot Glass Design System to Vmem

- Ported vibot's full glassmorphism design system into vmem to achieve visual consistency across the V codebases
- Added glass CSS custom properties (`--glass-bg`, `--glass-bg-soft`, `--glass-border`, `--glass-shadow`, `--glass-highlight`) in OKLCh format with light/dark mode variants
- Added four glass component classes: `.glass-panel` (standard), `.glass-panel-strong` (dialogs/popovers), `.glass-panel-subtle` (tabs), `.glass-interactive` (buttons/nav items) with backdrop-filter blur, inset highlights, and layered shadows
- Added body background radial gradients that create ambient light for the glass effect
- Updated 10 UI components (card, dialog, dropdown-menu, popover, select, hover-card, tooltip, tabs, command, sonner) to use glass classes instead of ad-hoc opacity modifiers
- Updated layout files (MainShell content area, Sidebar active nav items) to use glass classes
- Form elements (input, textarea, select trigger) and buttons intentionally left unchanged — they use distinct styling appropriate for their role

## 2026-02-22

### Persist Theme Preference to Convex Users Table

- Added `theme` field (`"light" | "dark"`, optional) to the `users` table in `packages/backend/convex/schema.ts` so theme is stored per-user in the database
- Created `packages/backend/convex/users.ts` with a `getMe` query (returns full user doc or null for unauthenticated users) and a `setTheme` mutation
- Updated `ThemeContext` to sync the stored theme from Convex on first load (applied once via a `hasSynced` ref to avoid repeated overrides), and to persist any theme change back to Convex — theme preference now survives across sessions and devices

### Migrate Form State from useState to React Hook Form + Zod

- Installed `react-hook-form`, `zod`, `@hookform/resolvers` in `apps/web`
- Created `apps/web/lib/schemas.ts` with shared `memorySchema` and `apiKeySchema` — single source of truth for validation rules
- Migrated `AddMemoryForm.tsx`, `AddMemoryModal.tsx`, `ApiKeyModal.tsx`, `MemoryDetailModal.tsx` from manual `useState` per field to `useForm` with zod resolver
- Removed manual `e.preventDefault()`, manual error state, and manual `isSubmitting` flags — these are now handled by RHF internals (`formState.isSubmitting`, `handleSubmit`, `reset`)
- Tag chip inputs (dynamic `string[]` arrays) are managed via RHF `Controller`; the ephemeral tag text input and suggestion dropdown state remain as regular `useState` since they are transient UI state, not form values
- Audio recording state and modal flow state (`step`, `isEditing`, etc.) kept as `useState` — correct for non-form concerns

### Simplify API Key Encryption to Single File + One Env Var

- Deleted `packages/backend/convex/apiKeysNode.ts` — the `"use node"` split was only needed for Node.js `crypto`; the Convex edge runtime supports Web Crypto API natively
- Rewrote `packages/backend/convex/apiKeys.ts` to inline all crypto logic using `crypto.subtle` (AES-256-GCM encrypt/decrypt, SHA-256 hash) and `crypto.getRandomValues` — no `"use node"` required
- Reduced env vars from three (`API_KEY_ENCRYPTION_KEY_B64`, `API_KEY_HASH_PEPPER`, `API_KEY_INGEST_SECRET`) to one (`ENCRYPTION_KEY`)
- Replaced HMAC-SHA256 with HMAC pepper with plain SHA-256 for key lookup hashing — safe because API keys have 192 bits of entropy
- Removed `recordUsageFromService` public action and its internal counterpart in `apiKeysNode.ts` (no external callers)
- Removed redundant two-hop action chain (`createMy` → `createMyInternal`) — `createMy` now does crypto directly
- Fixed `revokeMy` arg from `v.string()` to `v.id("apiKeys")` to eliminate the unsafe `as` cast in `getOwnedApiKeyById`; updated frontend state type to `ApiKey["id"] | null`
- Added exported `decryptApiKey` utility for future use

### Add On-Demand API Key Reveal + Copy to Clipboard

- Added `revealMy` auth action and `getEncryptedKeyInternal` internal query — decrypt only on explicit user request (view/copy buttons), never in list view
- Updated `apps/web/app/(main)/api/keys/page.tsx`:
  - Display always shows generic `vmem_sk_••••••••••••••••` placeholder — no real characters exposed by default
  - Eye icon reveals the full key in-place (stored in component state `revealedKeys`, hidden with eye-off icon)
  - Copy button decrypts on backend and copies to clipboard without displaying — independent of reveal state
  - Both buttons have separate loading spinners (`revealingKeyId`, `copyingKeyId`)
- Removed unsafe `as` assertion from `apps/web/app/(main)/api/logs/page.tsx` — TypeScript narrows type after undefined check

## 2026-02-14

### Hybrid Memory Engine Foundation (Fastify + Postgres/pgvector)

- Added new `apps/api` service with:
  - Fastify server bootstrap (`apps/api/src/index.ts`)
  - DB connectivity and migrations runner (`apps/api/src/db.ts`, `apps/api/src/migrations.ts`, `apps/api/src/migrate.ts`)
  - SQL schema migration for memories, tags, embeddings, chat messages, API keys, and ingestion jobs (`apps/api/migrations/0001_init.sql`)
  - Core endpoints:
    - `GET /health`, `GET /ready`
    - `GET/POST /v1/memories`
    - `GET/PUT/DELETE /v1/memories/:id`
    - `GET/PUT/DELETE /v1/memories/tags`
    - `POST /v1/memories/search`
    - `POST /v1/chat` (SSE)
    - `GET/POST /v1/keys`, `DELETE /v1/keys/:id`
- Implemented API key hashing and auth support in memory engine (`apps/api/src/auth.ts`)
- Added OpenRouter-backed LLM and embedding integration with fallback behavior (`apps/api/src/lib/llm.ts`)
- Added deterministic lexical fallback search and vector-first retrieval (`apps/api/src/lib/memory.ts`, `apps/api/src/lib/relevance.ts`)

### Web API Proxy Migration (Feature-Flagged)

- Added route-level web API auth helper (`apps/web/lib/api-auth.ts`)
- Added memory-engine proxy utility with per-feature flags (`apps/web/lib/memory-engine-proxy.ts`)
- Updated core web API routes to support authenticated proxying while preserving existing mock fallback behavior:
  - `apps/web/app/api/memories/route.ts`
  - `apps/web/app/api/memories/[id]/route.ts`
  - `apps/web/app/api/memories/tags/route.ts`
  - `apps/web/app/api/memories/search/route.ts`
  - `apps/web/app/api/chat/route.ts`
  - `apps/web/app/api/key/route.ts`
  - `apps/web/app/api/key/[id]/route.ts`
- Hardened auth middleware so `/api/*` is no longer public (`apps/web/proxy.ts`)

### Shared Types + MCP Package

- Added shared contracts package `@vmem/types` (`packages/types`)
- Added MCP package scaffold `@vmem/mcp` with memory tool handlers (`packages/mcp/src/index.ts`)

### Docs, Contracts, and Infra

- Added framework decision ADR (`internal/adr/0001-framework-selection.md`)
- Added frozen web API contracts (`internal/contracts/api-contracts.md`)
- Updated planning/docs to reflect active hybrid architecture:
  - `README.md`
  - `CLAUDE.md`
  - `internal/plan.md`
- Added local Postgres/pgvector `docker-compose.yml`
- Added env examples for new API and web proxy flags:
  - `apps/api/.env.example`
  - `apps/web/.env.example`
- Added root scripts for API and MCP workflows (`package.json`)

### Baseline Cleanup

- Fixed lint blockers in key frontend files:
  - Render-purity fix in `apps/web/components/TagCloud.tsx`
  - React compiler rule suppression for Convex provider hook wiring in `apps/web/components/providers/ClientProvider.tsx`
  - Removed unused parameters/state in `apps/web/components/Chat.tsx` and `apps/web/components/MemoryGraph.tsx`
  - Restored `description` usage in `apps/web/components/PageContainer.tsx`
- Connected `apps/web/components/AddMemoryModal.tsx` to real `/api/memories` POST flow (mock/proxy compatible)

## 2026-02-13

### Add AI Elements to @vmem/ui + Rewrite Chat Page

- Created `packages/ui/src/ai-elements/` with 6 components: Conversation (auto-scroll via use-stick-to-bottom), Message (Streamdown markdown rendering), PromptInput (textarea + submit with InputGroup), Reasoning (collapsible thinking with shimmer), Shimmer (motion/react text animation), CodeBlock (code display with copy button)
- Added 5 new base UI components: Collapsible, Popover, HoverCard, Command (cmdk), InputGroup (compound component with addon/button/textarea)
- Added `./ai` export path to `@vmem/ui` package for ai-elements
- Rewrote `Chat.tsx` to use ai-elements: Conversation for auto-scroll, Message/MessageContent/MessageResponse for display, PromptInput for input with status-aware submit/stop button, copy-to-clipboard on assistant messages
- Installed new dependencies: ai, streamdown + plugins (code, cjk, math, mermaid), use-stick-to-bottom, motion, cmdk, nanoid, @radix-ui/react-collapsible, @radix-ui/react-hover-card, @radix-ui/react-use-controllable-state
- Zero TypeScript errors

### Replace HeroUI with @vmem/ui (shadcn/Radix) — Full Migration

- Created `packages/ui/` shared component library with 18 shadcn-style components (Button, Input, Textarea, Dialog, Table, Tabs, Badge, Select, DropdownMenu, Progress, Switch, Separator, Spinner, Skeleton, Card, Label, Tooltip, Checkbox) + Sonner toast wrapper
- All components follow the Conductor pattern: Radix UI primitives + CVA variants + `cn()` utility + `forwardRef`
- Replaced HeroUI theme system with OKLCH CSS variables (Nova neutral palette) in `globals.css`
- Created `lib/tailwind-theme.ts` with semantic color tokens (primary, secondary, muted, accent, destructive, success, warning)
- Rewrote `tailwind.config.ts` — removed HeroUI plugin, added CSS variable theme extension
- Rewrote `ClientProvider.tsx` — removed HeroUIProvider/ToastProvider, added Sonner Toaster
- Migrated all 23 component/page files from HeroUI to @vmem/ui imports
- Key API changes across all files: `onPress` → `onClick`, `isDisabled` → `disabled`, `Modal` → `Dialog`, `Chip` → `Badge`, `addToast` → `toast()`, `useDisclosure` → `useState`, `Divider` → `Separator`, `Switch.isSelected` → `checked`, `Table.TableColumn` → `TableHead`
- Removed `@heroui/react`, `@react-types/shared` dependencies
- Added Radix UI, CVA, clsx, sonner dependencies
- Zero TypeScript errors after migration

### Notifications, Files & Connectors Pages Migration from HeroUI to @vmem/ui (shadcn)

- Migrated `notifications/page.tsx`: Replaced HeroUI Dropdown/DropdownTrigger/DropdownMenu/DropdownItem with Radix DropdownMenu/DropdownMenuTrigger/DropdownMenuContent/DropdownMenuItem, replaced onAction key-based dispatch with individual onClick handlers, migrated Button props (onPress to onClick, isIconOnly+variant="light" to variant="ghost"+size="icon-sm", variant="flat" to variant="secondary")
- Migrated `files/page.tsx`: Replaced HeroUI Table/TableColumn with shadcn Table/TableHead, replaced HeroUI Dropdown with Radix DropdownMenu pattern, replaced addToast with toast from sonner, replaced HeroUI Progress classNames with shadcn Progress className, migrated Button props (onPress to onClick, isDisabled to disabled, startContent to inline children)
- Migrated `connectors/page.tsx`: Replaced Card/CardBody with Card/CardContent, replaced HeroUI classNames prop with className, migrated Button props (onPress to onClick, variant="bordered" to variant="outline", variant="light" to variant="ghost", startContent to inline children)

### AddMemoryForm Migration from HeroUI to @vmem/ui (shadcn)

- Replaced all HeroUI imports (Input, Textarea, Button, Chip, addToast, Progress) with @vmem/ui equivalents (Input, Textarea, Button, Badge) and sonner toast
- Migrated Button props: onPress to onClick, isDisabled to disabled, variant="flat" to variant="secondary"
- Converted Input/Textarea from onValueChange to standard onChange with e.target.value, isDisabled to disabled, removed classNames in favor of className
- Replaced Chip with Badge + inline IconX close button for tag removal
- Replaced HeroUI indeterminate Progress with a plain CSS-animated div for recording indicator
- Replaced addToast({title, description, color}) with toast/toast.success/toast.error from sonner

### MemoryDetailModal Migration from HeroUI to @vmem/ui (shadcn)

- Replaced all HeroUI imports (Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Chip, addToast) with @vmem/ui equivalents (Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Textarea, Badge) and sonner toast
- Converted both Modal instances (detail + delete confirmation) to Radix Dialog pattern (open/onOpenChange)
- Migrated Button props: onPress to onClick, isDisabled to disabled, isIconOnly+variant="light" to variant="ghost"+size="icon-sm", color="danger" to variant="destructive", startContent to inline children
- Replaced Chip with Badge using variant="outline" for tags (both view and edit modes)
- Replaced addToast({title, description, color}) with toast.success/toast.error from sonner
- Converted Input/Textarea from onValueChange to standard onChange with e.target.value
- Added DialogTitle inside DialogHeader for accessibility compliance on both dialogs

### MemoryGraph Migration from HeroUI to @vmem/ui (shadcn)

- Migrated `MemoryGraph.tsx`: Replaced HeroUI imports (Modal, ModalContent, ModalHeader, ModalBody, Chip, Button) with @vmem/ui equivalents (Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Button)
- Converted Modal pattern (isOpen/onClose) to Radix Dialog pattern (open/onOpenChange)
- Migrated Button props: onPress to onClick, isIconOnly+variant="flat"+size="sm" to size="icon-sm"+variant="secondary", removed separate close button in modal header (DialogContent has built-in close)
- Replaced Chip with Badge using variant="outline" and className for custom styling
- Removed unused IconX import

### Memories Layout & Tags Page Migration from HeroUI to @vmem/ui (shadcn)

- Migrated `memories/layout.tsx`: Replaced HeroUI Tabs/Tab with Radix-based Tabs/TabsList/TabsTrigger from @vmem/ui, mapped selectedKey/onSelectionChange to value/onValueChange
- Migrated `memories/tags/page.tsx`: Replaced HeroUI Table (TableColumn to TableHead), Button (onPress to onClick, isDisabled to disabled, isIconOnly to variant="ghost" size="icon-sm"), Input (onValueChange to onChange, isDisabled to disabled), Modal to Dialog pattern (open/onOpenChange), and addToast to sonner toast

### FileUploadModal Migration from HeroUI to @vmem/ui (shadcn)

- Replaced all HeroUI imports (Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Progress, addToast) with @vmem/ui equivalents (Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Progress) and sonner toast
- Converted Modal open/close pattern (isOpen/onClose) to Radix Dialog pattern (open/onOpenChange) with onInteractOutside/onEscapeKeyDown for upload-in-progress protection
- Migrated Button props: onPress to onClick, isDisabled to disabled, isIconOnly to size="icon-sm", variant="light" to variant="ghost", removed startContent in favor of inline children
- Replaced HeroUI Progress classNames API with shadcn Progress className string
- Added DialogTitle inside DialogHeader for accessibility compliance

## 2025-12-04

### API Route Restructure

- Consolidated `/api-keys` and `/api-logs` into `/api` route with nested structure
- Created `/api/layout.tsx` with HeroUI Tabs component for switching between Keys and Logs
- Moved API Keys page to `/api/keys/page.tsx`
- Moved API Logs page to `/api/logs/page.tsx`
- Updated Sidebar to show single "API" link instead of separate entries
- Sidebar now properly highlights "API" when on any `/api/*` route

### Memories Route Restructure

- Created `/memories/layout.tsx` with HeroUI Tabs for List and Graph views
- Updated `/memories/list/page.tsx` to remove PageContainer wrapper
- Added placeholder for `/memories/graph/page.tsx`
- Sidebar now links to `/memories/list`

## 2025-12-03

### Files & Connectors Pages

- Added `/files` route for file management
  - Storage usage progress bar showing used/total space
  - Upload file button (UI only)
  - File list table with icons for different file types (PDF, images, docs, excel)
  - Uses `IconFiles` in sidebar
- Added `/connectors` route for external app integrations
  - Grid of connector cards (Google Drive, OneDrive, Dropbox, Notion, Slack, GitHub)
  - Connected/Disconnect state for each connector
  - Request section for new connector suggestions
  - Uses `IconPlugConnected` in sidebar
- Updated sidebar with new navigation group for Files and Connectors

### Icon Consistency - Tabler Icons

- Replaced all inline SVGs with Tabler Icons for consistency
- Files updated:
  - `chat/page.tsx` - Chat bubble → `IconMessage`
  - `notifications/page.tsx` - Status icons → `IconCheck`, `IconAlertTriangle`, `IconAlertCircle`, `IconInfoCircle`
  - `api-keys/page.tsx` - Lightning bolt → `IconBolt`
  - `AddMemoryForm.tsx` - Close/X button → `IconX`
  - `MemorySearch.tsx` - Search icon → `IconSearch`
- All icons now use consistent stroke width via `stroke={1.5}` prop

### Mobile Header Navigation

- Replaced floating hamburger button with a fixed top header on mobile
- Header contains "vmem" title and sidebar toggle button
- Sidebar now slides in from below the header on mobile
- Main content area adjusted to account for header height

### Floating Panel Layout

- Implemented "floating panel" / "app shell" design pattern
- Shell background: `neutral-200` (light) / `black` (dark)
- Main content: Rounded white/neutral-900 card that floats with margin
- Sidebar now blends seamlessly into the shell (no border)
- Creates a cohesive, modern app-like feel

## 2025-12-02

### Theme System

- Added light/dark mode support with toggle in sidebar
- Light mode is now default (white bg, black text)
- Dark mode uses `dark:` prefix classes (black bg, white text)
- Theme persisted to localStorage
- Script in layout.tsx prevents flash on page load

### Responsive Simplification

- Removed all `lg:` breakpoint classes
- Now using only base (mobile) + `md:` (desktop) breakpoints
- Sidebar: 280px on mobile, 20% width on desktop

### Routing Refactor

- Migrated from single-page tab navigation to file-based App Router routes
- Created `(main)` route group with shared layout containing Sidebar
- Each tab is now a separate page.tsx under its own route folder
- Root `/` now redirects to `/dashboard`

### Server Component Optimization

- Page components are now server components by default
- Extracted interactive parts into dedicated client components:
  - `MemorySearch.tsx` - handles search state and filtering
  - `AddMemoryForm.tsx` - handles form state and tag input
  - `SettingsToggles.tsx` - handles toggle state
- `Sidebar.tsx` uses `usePathname` for active route detection

### Initial UI Implementation

- Built complete vMemory frontend UI with black & white minimal theme
- Created fixed left sidebar navigation (20% width on desktop)
- Implemented 5 pages:
  - **Dashboard**: Stats cards, recent memories, quick actions
  - **Memories**: Searchable table with title, tags, created date
  - **Add Memory**: Form with title, content textarea, chip-style tags
  - **API Keys**: Table of keys with MCP integration card
  - **Settings**: Toggle preferences, profile card, danger zone
- Added responsive design (mobile hamburger menu, adaptive layouts)
- Configured Inter font via Google Fonts

### Infrastructure

- Enabled Turbopack for dev and build commands in frontend
- Added root package.json scripts to proxy commands to frontend directory
- Created ai-guidance folder with project documentation
