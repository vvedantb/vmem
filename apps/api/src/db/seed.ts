import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { getDriver, ensureIndexes, closeDriver } from "./neo4j.js";
import { setupDatabase } from "./setup.js";
import crypto from "node:crypto";

const USER_IDS = [
  "user_39IXNJeQM9vlRyQ9IdCvKbsqsti",
  "user_3BmJ4t48rN2ZkglhnxOTUJSMpLC",
  "user_35juxUiA6A9h2JbW7TEDk39j3yo",
];

const SOURCES = [
  "chrome-extension",
  "chat",
  "manual",
  "api-import",
  "email-digest",
  "cli",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(maxDaysAgo: number): string {
  const offset = Math.random() * maxDaysAgo * 86400000;
  return new Date(Date.now() - offset).toISOString();
}

function recentDate(maxDaysAgo: number): string {
  const offset = Math.random() * maxDaysAgo * 86400000;
  return new Date(Date.now() - offset).toISOString();
}

let memoryIndex = 0;

function mem(
  title: string,
  content: string,
  type: "profile" | "episodic" | "knowledge",
  tags: string[],
  status: "active" | "pinned" = "active",
) {
  const idx = memoryIndex++;

  let createdAt: string;
  if (idx < 20) {
    createdAt = recentDate(7);
  } else if (idx < 60) {
    createdAt = recentDate(30);
  } else if (idx < 150) {
    createdAt = randomDate(90);
  } else {
    createdAt = randomDate(180);
  }

  const updatedAt = new Date(
    new Date(createdAt).getTime() + Math.random() * 7 * 86400000,
  ).toISOString();
  return {
    id: crypto.randomUUID(),
    userId: "",
    title,
    content,
    type,
    source: pick(SOURCES),
    confidence: +(0.4 + Math.random() * 0.6).toFixed(2),
    status,
    tags,
    createdAt,
    updatedAt,
    expiresAt: null,
  };
}

const memories = [
  // === TECH / ENGINEERING (20) === [indices 0-19]
  mem(
    "TypeScript strict mode benefits",
    "Catches null/undefined bugs at compile time. Always enable strictNullChecks and noUncheckedIndexedAccess.",
    "knowledge",
    ["typescript", "infrastructure"],
  ),
  mem(
    "React useEffect cleanup patterns",
    "Return a cleanup function to unsubscribe from event listeners and cancel pending requests when component unmounts.",
    "knowledge",
    ["react", "typescript"],
  ),
  mem(
    "PostgreSQL vs Neo4j for graph queries",
    "Neo4j excels at multi-hop traversals. Postgres with recursive CTEs works for simple graphs but gets slow past 3 hops.",
    "knowledge",
    ["databases", "infrastructure"],
  ),
  mem(
    "Docker multi-stage builds",
    "Use a builder stage for compilation and a slim runtime stage. Reduces image size by 60-80% for Node.js apps.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "Zod v4 migration notes",
    "Zod v4 drops .parse() in favor of z.parse(schema, data). Transform chains work differently now.",
    "knowledge",
    ["typescript"],
  ),
  mem(
    "React Server Components mental model",
    "RSCs run only on the server. They can import server-only modules but cannot use hooks or browser APIs.",
    "knowledge",
    ["react", "typescript"],
  ),
  mem(
    "Neo4j Cypher UNWIND for batch inserts",
    "UNWIND $items AS item CREATE (n:Node) SET n = item is the fastest way to batch insert in Neo4j.",
    "knowledge",
    ["databases"],
  ),
  mem(
    "Hono middleware ordering matters",
    "Middleware runs in order of registration. Auth middleware must come before route handlers.",
    "knowledge",
    ["typescript", "infrastructure"],
  ),
  mem(
    "pnpm workspace protocol",
    "Use catalog: or workspace:* in package.json to reference local packages in a monorepo.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "Tailwind v4 CSS-first config",
    "Tailwind v4 uses @theme in CSS instead of tailwind.config.js. Migrating requires moving all custom values.",
    "knowledge",
    ["react"],
  ),
  mem(
    "Sigma.js WebGL rendering",
    "Sigma.js uses WebGL for graph rendering, handles 10k+ nodes smoothly. ForceAtlas2 for layout.",
    "knowledge",
    ["react", "infrastructure"],
  ),
  mem(
    "Convex real-time subscriptions",
    "Convex queries automatically subscribe to changes. No need for manual WebSocket setup.",
    "knowledge",
    ["databases", "typescript"],
  ),
  mem(
    "Git rebase vs merge strategy",
    "Rebase for clean linear history on feature branches. Merge commits for main branch integrations.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "TypeScript discriminated unions",
    "Use a literal type field as discriminant. Switch on it for exhaustive type narrowing.",
    "knowledge",
    ["typescript"],
  ),
  mem(
    "React suspense boundaries",
    "Wrap lazy-loaded components and data fetching in Suspense. Fallback UI shows during loading.",
    "knowledge",
    ["react"],
  ),
  // -- index 15+ → within 30 days --
  mem(
    "Node.js ESM gotchas",
    "Need .js extensions in imports even for .ts files when using ESM. __dirname not available, use import.meta.url.",
    "knowledge",
    ["typescript", "infrastructure"],
  ),
  mem(
    "Neo4j APOC procedures",
    "APOC provides utility procedures for batch operations, graph algorithms, and data import/export.",
    "knowledge",
    ["databases"],
  ),
  mem(
    "Clerk webhook verification",
    "Always verify webhook signatures with svix. Don't trust unverified webhook payloads.",
    "knowledge",
    ["infrastructure", "typescript"],
  ),
  mem(
    "CSS container queries",
    "Use @container instead of @media for component-level responsive design. Works in all modern browsers.",
    "knowledge",
    ["react"],
  ),
  mem(
    "Bun vs Node runtime differences",
    "Bun is faster for startup but some Node APIs behave differently. Stick with Node for production stability.",
    "knowledge",
    ["infrastructure"],
  ),

  // === WORK / MEETINGS (18) === [indices 20-37]
  mem(
    "Q1 sprint retrospective takeaways",
    "Team velocity dropped 20% due to context switching. Need to limit WIP to 3 items per person.",
    "episodic",
    ["meetings", "project-management"],
  ),
  mem(
    "1:1 with Sarah about team velocity",
    "Sarah suggested pair programming sessions to reduce PR review bottleneck. Worth trying for 2 weeks.",
    "episodic",
    ["meetings", "people", "career"],
  ),
  mem(
    "Decided to migrate auth to Clerk",
    "Evaluated Auth0, Clerk, and Supabase Auth. Clerk won on DX and pricing for our scale.",
    "episodic",
    ["project-management", "infrastructure"],
  ),
  mem(
    "Architecture review: memory engine",
    "Team agreed on Hono + Neo4j stack. Rejected SurrealDB due to maturity concerns.",
    "episodic",
    ["meetings", "infrastructure"],
  ),
  mem(
    "Sprint planning: graph visualization",
    "Allocated 2 weeks for sigma.js migration. Canvas approach was hitting perf limits at 50 nodes.",
    "episodic",
    ["meetings", "project-management"],
  ),
  mem(
    "Standup: blocked on Neo4j Aura provisioning",
    "Aura free tier has 200k node limit. Should be fine for MVP but need to monitor.",
    "episodic",
    ["meetings"],
  ),
  mem(
    "Demo prep for thesis committee",
    "Need to show context trace feature and proposed updates flow. Graph viz is the wow factor.",
    "episodic",
    ["project-management", "career"],
  ),
  mem(
    "Code review feedback from Alex",
    "Alex flagged excessive use of type assertions. Need to refactor memory-service to use proper generics.",
    "episodic",
    ["meetings", "typescript"],
  ),
  mem(
    "Decision: MCP over REST for LLM integration",
    "MCP protocol gives implicit memory via Resources. Better than tool-call-only approach of competitors.",
    "episodic",
    ["project-management", "infrastructure"],
  ),
  mem(
    "Backlog grooming session",
    "Prioritized: seed script, graph perf, proposed updates UI, MCP auth flow. Cut: dream mode for post-MVP.",
    "episodic",
    ["meetings", "project-management"],
  ),
  mem(
    "Thesis advisor feedback",
    "Advisor wants stronger comparison with Mem0 and Supermemory. Need benchmarks on retrieval accuracy.",
    "episodic",
    ["meetings", "career"],
  ),
  mem(
    "Team sync: frontend architecture",
    "Agreed on Server Components by default. Client Components only for Convex live queries and interactivity.",
    "episodic",
    ["meetings", "react"],
  ),
  mem(
    "Decision: nuqs for URL state management",
    "Filters and sort state stored in URL params via nuqs. Shareable and bookmarkable.",
    "episodic",
    ["project-management", "react"],
  ),
  mem(
    "Sprint review: MCP server progress",
    "OAuth flow working. Tool handlers for add/search/retrieve implemented. Resources endpoint next.",
    "episodic",
    ["meetings", "project-management"],
  ),
  mem(
    "Deployment strategy discussion",
    "Vercel for Next.js, fly.io for Hono API, Neo4j Aura for graph DB. All free tier for MVP.",
    "episodic",
    ["meetings", "infrastructure"],
  ),
  // -- index 35+ → spread across 90 days --
  mem(
    "Bug triage: graph rendering stutter",
    "Canvas approach drops to 10fps at 50+ nodes. Root cause: redrawing all edges every frame.",
    "episodic",
    ["meetings", "react"],
  ),
  mem(
    "Decision: Convex for user data only",
    "Convex handles users, preferences, API keys, auth. Neo4j handles all memory graph data.",
    "episodic",
    ["project-management", "databases"],
  ),
  mem(
    "Weekly planning: documentation sprint",
    "Need to write MCP architecture doc, API reference, and deployment guide before thesis submission.",
    "episodic",
    ["meetings", "project-management"],
  ),

  // === PEOPLE / CONVERSATIONS (16) === [indices 38-53]
  mem(
    "Alex recommends Obsidian for notes",
    "Alex uses Obsidian with graph view. Similar concept to vmem but for personal notes, not AI memory.",
    "episodic",
    ["people", "conversations"],
  ),
  mem(
    "Mom's birthday is March 15",
    "She mentioned wanting a kindle this year. Check Amazon deals in early March.",
    "profile",
    ["people", "relationships"],
  ),
  mem(
    "Met Jake at React Summit 2025",
    "Jake works at Vercel on the Next.js team. Interested in our MCP approach for memory.",
    "episodic",
    ["people", "react"],
  ),
  mem(
    "Coffee chat with Professor Chen",
    "Discussed graph neural networks for memory retrieval. Could be a V2 enhancement.",
    "episodic",
    ["people", "conversations", "career"],
  ),
  mem(
    "Sarah's debugging approach",
    "Sarah always starts with the data layer and works up. Opposite of my top-down approach.",
    "episodic",
    ["people", "conversations"],
  ),
  mem(
    "Dad prefers phone calls over text",
    "Best time to call is Sunday mornings. He's usually gardening and has his phone nearby.",
    "profile",
    ["people", "relationships"],
  ),
  mem(
    "Emma's book recommendation: Designing Data-Intensive Applications",
    "DDIA covers distributed systems patterns. Relevant for understanding our Neo4j cluster setup.",
    "episodic",
    ["people", "conversations", "databases"],
  ),
  mem(
    "Roommate's food allergies",
    "Tom is allergic to tree nuts and shellfish. Always check restaurant menus before suggesting places.",
    "profile",
    ["people", "relationships"],
  ),
  mem(
    "Mentor advice: ship early, iterate fast",
    "Dr. Park said most thesis projects fail by over-scoping. Better to have a polished MVP than a broken V2.",
    "episodic",
    ["people", "career"],
  ),
  mem(
    "Study group meets Wednesdays",
    "Weekly study group at the library. Usually covers distributed systems and ML papers.",
    "episodic",
    ["people", "conversations"],
  ),
  mem(
    "Conversation with recruiter at Google",
    "They're looking for full-stack engineers with TypeScript experience. Keep vmem project polished for portfolio.",
    "episodic",
    ["people", "career"],
  ),
  mem(
    "Alex's hot take on ORMs",
    "Alex thinks ORMs are an anti-pattern for anything beyond CRUD. Use raw queries or query builders.",
    "episodic",
    ["people", "conversations", "databases"],
  ),
  mem(
    "Sister learning to code",
    "She started with Python on Codecademy. Offered to help her with a project when she's ready.",
    "episodic",
    ["people", "relationships"],
  ),
  mem(
    "Networking event at TechHub",
    "Met 3 founders building AI tools. One is working on a memory layer similar to vmem but for enterprises.",
    "episodic",
    ["people", "conversations"],
  ),
  mem(
    "Advisor office hours",
    "Prof. Williams available Tuesdays 2-4pm. Book a slot at least 2 days in advance.",
    "profile",
    ["people", "career"],
  ),
  mem(
    "Team dinner tradition",
    "Friday evening team dinners when a major milestone ships. Last one was after MCP auth integration.",
    "episodic",
    ["people", "relationships"],
  ),

  // === PERSONAL PREFERENCES (14) === [indices 54-67]
  mem(
    "Prefers dark mode in all editors",
    "Strong preference for dark themes. Uses One Dark Pro in VS Code, dark mode in all terminals.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "Morning deep work blocks",
    "Most productive between 7-11am. No meetings before noon if possible.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "Favorite coffee: oat milk cortado",
    "Double shot cortado with oat milk. The cafe on 5th street makes the best one.",
    "profile",
    ["preferences"],
  ),
  mem(
    "Keyboard: mechanical with brown switches",
    "Cherry MX Browns for the tactile bump without the click. Current board is a Keychron Q1.",
    "profile",
    ["preferences"],
  ),
  mem(
    "Reading preference: technical books in print",
    "Retains information better from physical books. Fiction on Kindle is fine.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "Standing desk schedule",
    "Alternate sitting and standing every 45 minutes. Use the Pomodoro timer as a reminder.",
    "profile",
    ["preferences", "health"],
  ),
  mem(
    "Preferred PR review style",
    "Likes detailed inline comments. Prefers small, focused PRs over large feature branches.",
    "profile",
    ["preferences", "project-management"],
  ),
  mem(
    "Music for focus: lo-fi hip hop",
    "The ChilledCow YouTube stream works best. No lyrics, consistent tempo, no sudden changes.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "Note-taking: bullet points over prose",
    "Quick bullet points during meetings, expand later if needed. Never writes full paragraphs in real-time.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "IDE setup: VS Code with Vim keybindings",
    "Uses Vim extension in VS Code. Muscle memory from years of terminal Vim.",
    "profile",
    ["preferences"],
  ),
  mem(
    "Notification policy: batch processing",
    "Checks Slack 3 times a day. Emergency channel exceptions. DMs get faster response.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "Sleep schedule: 11pm-7am target",
    "Aims for 8 hours. Quality drops noticeably below 6.5 hours.",
    "profile",
    ["preferences", "health"],
  ),
  mem(
    "Prefers TypeScript over JavaScript",
    "The type safety catches bugs before runtime. Worth the initial setup cost every time.",
    "profile",
    ["preferences", "typescript"],
  ),
  mem(
    "Weekend coding: personal projects only",
    "Weekends reserved for vmem and side projects. No work-work allowed.",
    "profile",
    ["preferences", "habits"],
  ),

  // === HEALTH / FITNESS (10) === [indices 68-77]
  mem(
    "Started 5x5 deadlift program",
    "StrongLifts 5x5 for deadlifts and squats. Current working weight: 100kg deadlift.",
    "episodic",
    ["health", "habits"],
  ),
  mem(
    "Allergic to shellfish",
    "Discovered at age 12. Carries EpiPen. Mild reactions to cross-contamination.",
    "profile",
    ["health"],
  ),
  mem(
    "Daily water intake goal: 3 liters",
    "Use the 1L bottle and refill 3 times. Usually fall short on busy meeting days.",
    "profile",
    ["health", "habits"],
  ),
  mem(
    "Stretching routine before coding",
    "5-minute neck and shoulder stretches before long coding sessions. Prevents tension headaches.",
    "profile",
    ["health", "habits"],
  ),
  mem(
    "Annual eye exam in January",
    "Last prescription update was slight. Blue light glasses help with screen fatigue.",
    "profile",
    ["health"],
  ),
  mem(
    "Running: 5K three times a week",
    "Tuesday, Thursday, Saturday mornings. Current pace: 5:30/km. Goal: sub-25 minute 5K.",
    "episodic",
    ["health", "habits"],
  ),
  mem(
    "Meal prep on Sundays",
    "Cook chicken, rice, and roasted vegetables for the week. Saves time and money.",
    "profile",
    ["health", "habits"],
  ),
  mem(
    "Wrist pain from mouse usage",
    "Switched to vertical mouse. Doing wrist exercises from the physio.",
    "episodic",
    ["health"],
  ),
  mem(
    "Caffeine cutoff: 2pm",
    "No coffee after 2pm. Switched to green tea for afternoon focus.",
    "profile",
    ["health", "habits"],
  ),
  mem(
    "Gym membership at FitZone",
    "Open 24/7. Usually go at 6am to avoid crowds. Locker number: 247.",
    "profile",
    ["health"],
  ),

  // === TRAVEL / PLACES (12) === [indices 78-89]
  mem(
    "Loved the ramen in Shibuya",
    "Fuunji near Shinjuku station has the best tsukemen. Go before 11am to avoid the queue.",
    "episodic",
    ["travel", "preferences"],
  ),
  mem(
    "Berlin office has hot desks on floor 3",
    "Need the access card from reception. WiFi: BerlinOffice-Guest, password on the whiteboard.",
    "knowledge",
    ["travel", "geography"],
  ),
  mem(
    "Tokyo metro tip: get a Suica card",
    "Rechargeable IC card works on all trains and most convenience stores. Get it at any station.",
    "knowledge",
    ["travel"],
  ),
  mem(
    "Favorite coworking space in Lisbon",
    "Outsite Lisbon in Santos. Great WiFi, rooftop terrace, reasonable day pass.",
    "episodic",
    ["travel", "preferences"],
  ),
  mem(
    "Amsterdam cycling rules",
    "Stay in bike lanes. Never walk in the red paths. Rent from Swapfiets for monthly stays.",
    "knowledge",
    ["travel", "geography"],
  ),
  mem(
    "Best airport lounge hack",
    "Priority Pass from the Amex card. Covers 2 guests. Save it for long layovers.",
    "knowledge",
    ["travel"],
  ),
  mem(
    "Jet lag strategy: no sleep on plane",
    "Stay awake on eastbound flights, sleep on westbound. Adjust to destination time immediately.",
    "knowledge",
    ["travel", "health"],
  ),
  mem(
    "Singapore food courts are incredible",
    "Maxwell Food Centre for chicken rice. Lau Pa Sat for satay. Both under $5 per meal.",
    "episodic",
    ["travel", "geography"],
  ),
  mem(
    "Conference travel checklist",
    "Laptop + charger, business cards, portable monitor, noise-cancelling headphones, presentation clicker.",
    "knowledge",
    ["travel"],
  ),
  mem(
    "Visa requirements: check 3 months ahead",
    "Some countries need visa applications 8 weeks before. Set calendar reminders.",
    "knowledge",
    ["travel"],
  ),
  mem(
    "Accommodation preference: Airbnb over hotels",
    "Prefer apartments with a kitchen and desk. Hotels feel too transient for work trips.",
    "profile",
    ["travel", "preferences"],
  ),
  mem(
    "London Underground: Oyster card zones",
    "Zone 1-2 covers most tourist and business areas. Contactless works too but Oyster has daily caps.",
    "knowledge",
    ["travel", "geography"],
  ),

  // === LEARNING NOTES — BRIDGES (15) === [indices 90-104]
  mem(
    "Learning Rust for systems programming",
    "Started The Rust Book. Ownership model is different from TypeScript's GC approach.",
    "knowledge",
    ["learning", "typescript"],
  ),
  mem(
    "Read Thinking Fast and Slow",
    "System 1 vs System 2 thinking. Relevant for designing AI memory retrieval heuristics.",
    "episodic",
    ["learning", "habits"],
  ),
  mem(
    "Japanese phrase: sumimasen",
    "Means both sorry and excuse me. Context determines meaning. Very useful in Tokyo.",
    "knowledge",
    ["learning", "travel"],
  ),
  mem(
    "Graph theory: small world networks",
    "Most real-world graphs have small-world properties. Average path length grows logarithmically.",
    "knowledge",
    ["learning", "databases"],
  ),
  mem(
    "Studying distributed consensus algorithms",
    "Raft is simpler than Paxos. Used in etcd and CockroachDB. Relevant for understanding Convex.",
    "knowledge",
    ["learning", "infrastructure"],
  ),
  mem(
    "Completed React Advanced Patterns course",
    "Compound components, render props, and custom hooks. Applied compound pattern to graph settings.",
    "knowledge",
    ["learning", "react"],
  ),
  mem(
    "Reading about attention mechanisms in LLMs",
    "Self-attention computes relevance scores between all token pairs. O(n²) complexity.",
    "knowledge",
    ["learning", "infrastructure"],
  ),
  mem(
    "Learning Neo4j graph data science library",
    "GDS provides PageRank, community detection, path finding. Could enhance memory retrieval scoring.",
    "knowledge",
    ["learning", "databases"],
  ),
  mem(
    "Studying UX research methods",
    "Card sorting and tree testing for information architecture. Could apply to memory categorization.",
    "knowledge",
    ["learning", "preferences"],
  ),
  mem(
    "Read The Phoenix Project",
    "DevOps novel about bottlenecks and flow. The three ways: flow, feedback, continual learning.",
    "episodic",
    ["learning", "project-management"],
  ),
  mem(
    "Learning about vector embeddings",
    "Dense vector representations capture semantic meaning. Cosine similarity for nearest neighbor search.",
    "knowledge",
    ["learning", "databases"],
  ),
  mem(
    "Practicing public speaking",
    "Toastmasters club on Mondays. Working on reducing filler words and improving pacing.",
    "episodic",
    ["learning", "people"],
  ),
  mem(
    "Studying memory palace technique",
    "Method of loci links information to spatial locations. Ancient technique still used by memory champions.",
    "knowledge",
    ["learning", "health"],
  ),
  mem(
    "Learning about WebGL shaders",
    "Vertex and fragment shaders control rendering pipeline. Sigma.js uses them for graph node rendering.",
    "knowledge",
    ["learning", "react"],
  ),
  mem(
    "Read Building a Second Brain",
    "Tiago Forte's PARA method: Projects, Areas, Resources, Archives. Influenced vmem's memory categorization.",
    "episodic",
    ["learning", "project-management"],
  ),

  // === CAREER GOALS (8) === [indices 105-112]
  mem(
    "Goal: publish thesis by December",
    "Need to finalize vmem, run user study, write up results. Timeline is tight but doable.",
    "profile",
    ["career", "learning"],
  ),
  mem(
    "Target companies: Vercel, Anthropic, Linear",
    "All building developer tools. vmem demonstrates relevant full-stack and AI experience.",
    "profile",
    ["career"],
  ),
  mem(
    "Portfolio projects to highlight",
    "vmem (main), a CLI tool for git workflows, and the React component library from last semester.",
    "profile",
    ["career", "learning"],
  ),
  mem(
    "Interviewing tip: STAR method",
    "Situation, Task, Action, Result. Practice with at least 5 stories from vmem development.",
    "knowledge",
    ["career"],
  ),
  mem(
    "Salary research for new grad SWE",
    "London: £45-65k, Remote US: $120-160k. Factor in cost of living and visa sponsorship.",
    "knowledge",
    ["career", "geography"],
  ),
  mem(
    "Build in public strategy",
    "Tweet weekly progress on vmem. Share technical decisions and architecture diagrams.",
    "profile",
    ["career", "habits"],
  ),
  mem(
    "Open source contribution goals",
    "Contribute to at least 2 repos per month. Focus on TypeScript tooling and graph libraries.",
    "profile",
    ["career", "typescript"],
  ),
  mem(
    "Thesis defense preparation",
    "Practice the 20-minute presentation. Anticipate questions about scalability and privacy.",
    "episodic",
    ["career", "learning"],
  ),

  // === MORE TECH / ENGINEERING (30) === [indices 113-142]
  mem(
    "Turborepo remote caching setup",
    "Enable remote caching with Vercel to share build artifacts across CI and local dev. Cuts build times by 70%.",
    "knowledge",
    ["infrastructure", "typescript"],
  ),
  mem(
    "Vitest over Jest for monorepos",
    "Vitest uses the same Vite config, no separate transform setup. Native ESM support without hacks.",
    "knowledge",
    ["typescript", "infrastructure"],
  ),
  mem(
    "Edge runtime limitations",
    "No Node.js APIs like fs or crypto.randomUUID. Must use Web Crypto API. Limited to 128KB code size on Cloudflare.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "React compiler auto-memoization",
    "React 19 compiler memoizes components and hooks automatically. Manual useMemo/useCallback mostly unnecessary now.",
    "knowledge",
    ["react", "typescript"],
  ),
  mem(
    "OpenTelemetry tracing for Hono",
    "Use @hono/otel middleware for distributed tracing. Sends spans to Jaeger or Grafana Tempo.",
    "knowledge",
    ["infrastructure", "databases"],
  ),
  mem(
    "Drizzle ORM type inference",
    "Drizzle infers types directly from schema. No codegen step needed unlike Prisma.",
    "knowledge",
    ["typescript", "databases"],
  ),
  mem(
    "WebSocket vs SSE for real-time",
    "SSE is simpler and works over HTTP/2. WebSocket for bidirectional. Convex uses WebSocket internally.",
    "knowledge",
    ["infrastructure", "react"],
  ),
  mem(
    "Playwright for E2E testing",
    "Playwright auto-waits for elements. Use page.getByRole over CSS selectors for resilient tests.",
    "knowledge",
    ["typescript", "infrastructure"],
  ),
  mem(
    "CQRS pattern for memory engine",
    "Separate read and write models. Writes go to Neo4j directly, reads can use a materialized view or cache.",
    "knowledge",
    ["databases", "infrastructure"],
  ),
  mem(
    "Biome replacing ESLint and Prettier",
    "Biome is a single tool for linting and formatting. 10x faster than ESLint. Written in Rust.",
    "knowledge",
    ["typescript", "infrastructure"],
  ),
  mem(
    "Astro for documentation sites",
    "Astro ships zero JS by default. Perfect for docs where interactivity is minimal.",
    "knowledge",
    ["react", "infrastructure"],
  ),
  mem(
    "tRPC end-to-end type safety",
    "tRPC infers types from backend to frontend without codegen. Works great in monorepos.",
    "knowledge",
    ["typescript"],
  ),
  mem(
    "Rate limiting with sliding window",
    "Redis-based sliding window counter. Better than fixed window for bursty traffic patterns.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "React Native Expo SDK 52",
    "New Architecture enabled by default. Fabric renderer and TurboModules for native performance.",
    "knowledge",
    ["react", "typescript"],
  ),
  mem(
    "Neon Postgres branching workflow",
    "Create a database branch per PR. Merge schema changes like code. Great for preview deployments.",
    "knowledge",
    ["databases", "infrastructure"],
  ),
  mem(
    "OAuth 2.1 simplified",
    "PKCE required for all clients. No implicit grant. Refresh token rotation mandatory.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "Tanstack Query stale-while-revalidate",
    "Set staleTime to control when data is considered stale. gcTime controls cache eviction.",
    "knowledge",
    ["react", "typescript"],
  ),
  mem(
    "Monorepo dependency hoisting gotchas",
    "Phantom dependencies when hoisted packages are used without declaring them. pnpm strict mode prevents this.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "shadcn/ui component patterns",
    "Copy components into your codebase. Customize freely. No version lock-in unlike traditional UI libraries.",
    "knowledge",
    ["react"],
  ),
  mem(
    "Effect-TS for typed error handling",
    "Effect provides typed errors, dependency injection, and concurrency. Steep learning curve but worth it.",
    "knowledge",
    ["typescript"],
  ),
  mem(
    "Neo4j full-text search indexes",
    "Create fulltext index for memory content. Supports Lucene query syntax for advanced text search.",
    "knowledge",
    ["databases"],
  ),
  mem(
    "Vercel AI SDK streaming",
    "useChat hook handles streaming responses. Works with OpenAI, Anthropic, and local models.",
    "knowledge",
    ["react", "infrastructure"],
  ),
  mem(
    "GitHub Actions matrix strategy",
    "Matrix builds run tests across Node versions and OS. Fail-fast: false to see all failures.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "Zustand vs Jotai for state",
    "Zustand for global store patterns. Jotai for atomic bottom-up state. Both lightweight alternatives to Redux.",
    "knowledge",
    ["react", "typescript"],
  ),
  mem(
    "Content Security Policy headers",
    "CSP prevents XSS by whitelisting script sources. Start with report-only mode to find violations.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "Incremental Static Regeneration",
    "ISR revalidates cached pages on a timer. Use on-demand revalidation for CMS webhook triggers.",
    "knowledge",
    ["react", "infrastructure"],
  ),
  mem(
    "SQLite for embedded databases",
    "Turso and Cloudflare D1 use SQLite at the edge. Great for per-user or per-tenant data.",
    "knowledge",
    ["databases"],
  ),
  mem(
    "Dependabot grouping rules",
    "Group minor and patch updates into a single PR. Major versions get individual PRs for review.",
    "knowledge",
    ["infrastructure"],
  ),
  mem(
    "Motion (Framer Motion) layout animations",
    "layout prop enables automatic FLIP animations. Use layoutId for shared element transitions.",
    "knowledge",
    ["react"],
  ),
  mem(
    "Zod discriminated unions",
    "z.discriminatedUnion checks a literal field first for fast validation. Better errors than z.union.",
    "knowledge",
    ["typescript"],
  ),

  // === MORE WORK / MEETINGS (20) === [indices 143-162]
  mem(
    "Platform team wants API versioning",
    "They need v1/v2 support for memory endpoints. Suggested URL-based versioning over header-based.",
    "episodic",
    ["meetings", "infrastructure"],
  ),
  mem(
    "Stakeholder demo went well",
    "CTO liked the context trace feature. Asked about enterprise multi-tenant support for V2.",
    "episodic",
    ["meetings", "project-management"],
  ),
  mem(
    "Incident post-mortem: memory duplication bug",
    "Race condition in concurrent memory creates. Fixed with Neo4j MERGE instead of CREATE.",
    "episodic",
    ["meetings", "databases"],
  ),
  mem(
    "Design review: proposed updates UI",
    "Mocked up approve/reject flow for conflicting memories. Team preferred inline diff view.",
    "episodic",
    ["meetings", "react"],
  ),
  mem(
    "API rate limit discussion",
    "Agreed on 100 req/min for free tier, 1000 for pro. Redis sliding window implementation.",
    "episodic",
    ["meetings", "infrastructure"],
  ),
  mem(
    "Decision: OpenRouter over direct API keys",
    "OpenRouter provides fallback models and unified billing. Simpler than managing multiple API keys.",
    "episodic",
    ["project-management", "infrastructure"],
  ),
  mem(
    "Sprint retro: testing gaps",
    "Only 30% coverage on memory-service. Agreed to write integration tests before new features.",
    "episodic",
    ["meetings", "typescript"],
  ),
  mem(
    "User study recruitment plan",
    "Need 15 participants for thesis study. Recruiting from CS department and local dev meetups.",
    "episodic",
    ["project-management", "career"],
  ),
  mem(
    "Discussion: memory expiration policy",
    "Auto-expire memories after 1 year unless pinned. Grace period sends notification before deletion.",
    "episodic",
    ["meetings", "project-management"],
  ),
  mem(
    "Mobile app feasibility check",
    "React Native with Expo for mobile. Clerk supports Expo auth. Graph viz needs react-native-svg.",
    "episodic",
    ["meetings", "react"],
  ),
  mem(
    "Security audit findings",
    "JWT tokens not checked for expiry on API side. Added exp validation to auth middleware.",
    "episodic",
    ["meetings", "infrastructure"],
  ),
  mem(
    "Decision: changelog in internal folder",
    "Keep changelog in internal/changelog.md. Each entry: title, date, summary, reason for change.",
    "episodic",
    ["project-management"],
  ),
  mem(
    "Accessibility review results",
    "Missing aria-labels on graph nodes. Color contrast fails on muted text. Need keyboard navigation.",
    "episodic",
    ["meetings", "react"],
  ),
  mem(
    "Database migration strategy agreed",
    "Use union types in schema during migration. Deploy, run migration script, then clean up old types.",
    "episodic",
    ["meetings", "databases"],
  ),
  mem(
    "Performance budget set",
    "Max 200ms for memory retrieval. Max 1s for graph load with 500 nodes. Lighthouse score > 90.",
    "episodic",
    ["meetings", "infrastructure"],
  ),
  mem(
    "Decided against GraphQL",
    "REST is simpler for our use case. GraphQL adds complexity without benefit for single-client API.",
    "episodic",
    ["project-management", "infrastructure"],
  ),
  mem(
    "Feature flag rollout plan",
    "Use Convex document flags for now. PostHog feature flags for production experiments later.",
    "episodic",
    ["meetings", "project-management"],
  ),
  mem(
    "Onboarding flow discussion",
    "New users get 5 sample memories to demonstrate features. Import from Notion/Obsidian planned for V2.",
    "episodic",
    ["meetings", "project-management"],
  ),
  mem(
    "CI pipeline optimization",
    "Moved to GitHub Actions with Turborepo cache. Build time dropped from 8min to 2min.",
    "episodic",
    ["meetings", "infrastructure"],
  ),
  mem(
    "Tag taxonomy discussion",
    "Flat tags over hierarchical categories. Users can create any tag. No predefined taxonomy.",
    "episodic",
    ["meetings", "project-management"],
  ),

  // === MORE PEOPLE / CONVERSATIONS (15) === [indices 163-177]
  mem(
    "Ryan's take on microservices",
    "Ryan argues monoliths are fine until you have 50+ engineers. We're at 3, so monolith is correct.",
    "episodic",
    ["people", "conversations", "infrastructure"],
  ),
  mem(
    "Maya's design system philosophy",
    "Maya says constraints breed creativity. Start with 4px grid, 3 font sizes, and 5 colors max.",
    "episodic",
    ["people", "conversations", "react"],
  ),
  mem(
    "Cousin's wedding in August",
    "Wedding is August 16 in Manchester. Need to book train tickets early for good prices.",
    "profile",
    ["people", "relationships"],
  ),
  mem(
    "Ben's startup advice",
    "Ben says solve one problem really well before expanding. Applied this thinking to vmem MVP scope.",
    "episodic",
    ["people", "conversations", "career"],
  ),
  mem(
    "Dentist: Dr. Patel on High Street",
    "Appointments book up 3 weeks out. Next checkup due in June. Prefers morning slots.",
    "profile",
    ["people", "health"],
  ),
  mem(
    "Met Lisa at the TypeScript meetup",
    "Lisa works on Deno. Gave great talk on JSR registry. Connected on LinkedIn.",
    "episodic",
    ["people", "conversations", "typescript"],
  ),
  mem(
    "Neighbor's dog name: Biscuit",
    "Golden retriever. Friendly but jumps. Owner's name is Martin, retired teacher.",
    "profile",
    ["people", "relationships"],
  ),
  mem(
    "Debate with Alex on testing strategy",
    "Alex prefers unit tests for everything. I think integration tests catch more real bugs with less mocking.",
    "episodic",
    ["people", "conversations", "typescript"],
  ),
  mem(
    "Grandma's recipe for shepherd's pie",
    "Mash needs butter and cream cheese. Lamb mince with Worcestershire sauce. 200C for 25 min.",
    "profile",
    ["people", "relationships"],
  ),
  mem(
    "Chat with Omar about graph databases",
    "Omar used Neo4j at his last company for fraud detection. Says Cypher is intuitive once you get it.",
    "episodic",
    ["people", "conversations", "databases"],
  ),
  mem(
    "Flatmate's work schedule",
    "Tom works from home Mon/Wed/Fri. In office Tue/Thu. Quiet hours important on WFH days.",
    "profile",
    ["people", "relationships"],
  ),
  mem(
    "Hackathon team with Jamie and Priya",
    "Won 2nd place at HackLondon with a recipe recommendation app. Good team dynamic.",
    "episodic",
    ["people", "conversations"],
  ),
  mem(
    "Conversation with careers advisor",
    "Suggested targeting companies that sponsor Tier 2 visas. Keep a list and apply early.",
    "episodic",
    ["people", "career"],
  ),
  mem(
    "Sarah's birthday is November 2",
    "She likes specialty coffee beans and art prints. Last year got her a V60 pour-over set.",
    "profile",
    ["people", "relationships"],
  ),
  mem(
    "Book club with uni friends",
    "Monthly on first Sundays. Currently reading Project Hail Mary. My turn to pick next month.",
    "episodic",
    ["people", "conversations", "learning"],
  ),

  // === MORE PERSONAL PREFERENCES (12) === [indices 178-189]
  mem(
    "Font preference: Inter for UI, JetBrains Mono for code",
    "Inter at 14px for body text. JetBrains Mono with ligatures enabled for all editors.",
    "profile",
    ["preferences"],
  ),
  mem(
    "Hates auto-playing videos",
    "Immediately closes any site that auto-plays video with sound. Turn off autoplay in all browsers.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "Task management: linear over kanban",
    "Linear's list view beats Kanban boards for solo work. Kanban only useful with 3+ people.",
    "profile",
    ["preferences", "project-management"],
  ),
  mem(
    "Podcast routine during commute",
    "Syntax.fm for web dev, Lex Fridman for long-form, Huberman for health. Download before leaving.",
    "profile",
    ["preferences", "habits", "learning"],
  ),
  mem(
    "Browser preference: Arc",
    "Arc for daily use. Chrome only for testing cross-browser issues. Safari for battery life on travel.",
    "profile",
    ["preferences"],
  ),
  mem(
    "Git commit style: conventional commits",
    "feat:, fix:, refactor:, chore:, docs:. Lowercase, imperative mood. No period at end.",
    "profile",
    ["preferences", "infrastructure"],
  ),
  mem(
    "Timezone: GMT/BST (London)",
    "UTC+0 in winter, UTC+1 in summer. Prefer afternoon meetings when collaborating with US teams.",
    "profile",
    ["preferences"],
  ),
  mem(
    "Desktop wallpaper: minimal dark gradients",
    "Uses dark gradient wallpapers. No icons on desktop. Everything launched from spotlight/raycast.",
    "profile",
    ["preferences"],
  ),
  mem(
    "Prefers async communication",
    "Written messages over calls. Video calls only when discussion is complex or contentious.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "Code review ritual: morning first thing",
    "Reviews PRs before writing new code. Fresh eyes catch more issues.",
    "profile",
    ["preferences", "habits"],
  ),
  mem(
    "Terminal: Warp with Starship prompt",
    "Warp for AI features and blocks. Starship for minimal prompt showing git branch and Node version.",
    "profile",
    ["preferences"],
  ),
  mem(
    "Note-taking app: Obsidian with daily notes",
    "Daily note template with sections: Today's Plan, Notes, End of Day Reflection.",
    "profile",
    ["preferences", "habits"],
  ),

  // === MORE HEALTH / FITNESS (10) === [indices 190-199]
  mem(
    "Protein target: 140g per day",
    "Chicken breast, Greek yogurt, protein shake post-workout. Track with MyFitnessPal.",
    "profile",
    ["health", "habits"],
  ),
  mem(
    "Ankle sprain recovery exercises",
    "Physio gave resistance band exercises. 3 sets of 15 each direction. Should be healed in 4 weeks.",
    "episodic",
    ["health"],
  ),
  mem(
    "Sleep tracker: Oura Ring",
    "Tracks sleep stages, HRV, and readiness score. Aim for 85+ readiness before heavy workout days.",
    "profile",
    ["health", "preferences"],
  ),
  mem(
    "Vitamin D supplement in winter",
    "GP recommended 4000 IU daily October through March. Blood test showed deficiency last winter.",
    "profile",
    ["health"],
  ),
  mem(
    "Cold shower challenge: 30 days",
    "Started with 30 seconds cold at end of shower. Now doing 2 minutes. Energy levels noticeably better.",
    "episodic",
    ["health", "habits"],
  ),
  mem(
    "Dentist recommended electric toothbrush",
    "Oral-B iO Series 9. Pressure sensor prevents gum damage. Replace heads every 3 months.",
    "profile",
    ["health"],
  ),
  mem(
    "Yoga class Saturdays at 9am",
    "Beginner vinyasa at the community center. Good for mobility after heavy lifting days.",
    "episodic",
    ["health", "habits"],
  ),
  mem(
    "Headache triggers: dehydration and screen glare",
    "Usually caused by forgetting to drink water or working without ambient lighting.",
    "profile",
    ["health"],
  ),
  mem(
    "Blood type: O positive",
    "Universal donor for red blood cells. Important to know for emergencies.",
    "profile",
    ["health"],
  ),
  mem(
    "Foam rolling routine after runs",
    "IT band, quads, calves. 60 seconds per muscle group. Prevents DOMS and knee pain.",
    "profile",
    ["health", "habits"],
  ),

  // === MORE TRAVEL / PLACES (12) === [indices 200-211]
  mem(
    "Barcelona: skip La Rambla, go to El Born",
    "El Born has better tapas, fewer tourists. Picasso Museum is there. Go on a weekday morning.",
    "episodic",
    ["travel", "geography"],
  ),
  mem(
    "Passport expires February 2027",
    "Some countries require 6 months validity. Renew by August 2026 to be safe.",
    "profile",
    ["travel"],
  ),
  mem(
    "Prague is cheap for digital nomads",
    "Coworking spaces from €10/day. Great beer for €2. Public transit covers everywhere.",
    "episodic",
    ["travel", "geography"],
  ),
  mem(
    "Best noise-cancelling for flights: AirPods Max",
    "AirPods Max blocks more engine noise than Sony XM5. Worth the extra weight.",
    "knowledge",
    ["travel", "preferences"],
  ),
  mem(
    "Airline preference: British Airways",
    "Collect Avios points. Terminal 5 at Heathrow has best lounges. Use BA app for mobile boarding.",
    "profile",
    ["travel", "preferences"],
  ),
  mem(
    "Kyoto temple etiquette",
    "Remove shoes before entering. Bow slightly at torii gates. No photography in some inner halls.",
    "knowledge",
    ["travel", "geography"],
  ),
  mem(
    "Global Entry for US trips",
    "Apply 3 months before travel. Includes TSA PreCheck. Interview at US embassy in London.",
    "knowledge",
    ["travel"],
  ),
  mem(
    "Istanbul's Grand Bazaar haggling tips",
    "Start at 40% of asking price. Walk away once. Tea is offered as hospitality, accept it.",
    "episodic",
    ["travel", "geography"],
  ),
  mem(
    "eSIM for international travel",
    "Airalo eSIM works in 190+ countries. Buy before departure. Much cheaper than roaming.",
    "knowledge",
    ["travel"],
  ),
  mem(
    "Edinburgh Fringe Festival in August",
    "Book accommodation months ahead. Free shows are often the best. Royal Mile gets overcrowded.",
    "episodic",
    ["travel", "geography"],
  ),
  mem(
    "Packing list: one bag travel",
    "40L backpack max. Merino wool shirts, packable jacket, laptop sleeve. No checked luggage.",
    "knowledge",
    ["travel", "preferences"],
  ),
  mem(
    "Favorite airport: Changi Singapore",
    "Free movie theater, butterfly garden, swimming pool. Best layover airport in the world.",
    "episodic",
    ["travel", "geography"],
  ),

  // === MORE LEARNING NOTES (15) === [indices 212-226]
  mem(
    "Category theory basics for programmers",
    "Functors map between categories. Monads are monoids in the category of endofunctors (actually useful for error handling).",
    "knowledge",
    ["learning", "typescript"],
  ),
  mem(
    "Spaced repetition for retention",
    "Anki with 20 new cards/day. Review takes 15 min. Retention rate: 90% after 6 months.",
    "knowledge",
    ["learning", "habits"],
  ),
  mem(
    "Learned about CRDTs",
    "Conflict-free Replicated Data Types for distributed state. LWW-Register and G-Counter are simplest.",
    "knowledge",
    ["learning", "databases"],
  ),
  mem(
    "Feynman technique for understanding",
    "Explain concept in simple terms. Identify gaps. Go back to source material. Simplify again.",
    "knowledge",
    ["learning"],
  ),
  mem(
    "Watched 3Blue1Brown on neural networks",
    "Visual explanation of backpropagation. Gradient descent as walking downhill in parameter space.",
    "episodic",
    ["learning"],
  ),
  mem(
    "Completed Advent of Code 2025",
    "Solved all 25 days in TypeScript. Day 18 (graph pathfinding) was hardest. Learned A* algorithm.",
    "episodic",
    ["learning", "typescript"],
  ),
  mem(
    "Property-based testing with fast-check",
    "Generate random inputs to find edge cases. Found 3 bugs in memory search scoring function.",
    "knowledge",
    ["learning", "typescript"],
  ),
  mem(
    "Read The Pragmatic Programmer",
    "DRY principle, rubber duck debugging, tracer bullets. Classic wisdom that still applies.",
    "episodic",
    ["learning"],
  ),
  mem(
    "Studying information retrieval",
    "TF-IDF for keyword relevance. BM25 improves on TF-IDF. Both useful for memory search scoring.",
    "knowledge",
    ["learning", "databases"],
  ),
  mem(
    "Notes on Zettelkasten method",
    "Atomic notes with unique IDs. Links between notes create emergent structure. Inspired vmem's approach.",
    "knowledge",
    ["learning", "project-management"],
  ),
  mem(
    "Read Clean Architecture by Uncle Bob",
    "Dependencies point inward. Business rules don't depend on frameworks. Applied to vmem's service layer.",
    "episodic",
    ["learning", "infrastructure"],
  ),
  mem(
    "Studied PageRank algorithm",
    "Iterative scoring based on incoming link quality. Could rank memories by relationship importance.",
    "knowledge",
    ["learning", "databases"],
  ),
  mem(
    "Learned about event sourcing",
    "Store events, not state. Rebuild state from event log. Our timeline feature is basically this.",
    "knowledge",
    ["learning", "databases"],
  ),
  mem(
    "Exploring htmx for simple UIs",
    "HTML-driven interactivity without JS framework. Great for admin panels and internal tools.",
    "knowledge",
    ["learning", "react"],
  ),
  mem(
    "Read Staff Engineer by Will Larson",
    "Technical leadership is about creating leverage. Write documents, build consensus, unblock teams.",
    "episodic",
    ["learning", "career"],
  ),

  // === FINANCE / ADMIN (10) === [indices 227-236]
  mem(
    "Student loan repayment starts April",
    "Plan 2: repay when earning over £27,295. 9% of income above threshold.",
    "profile",
    ["finance"],
  ),
  mem(
    "ISA contribution deadline: April 5",
    "Max £20,000 per tax year. Using Vanguard S&P 500 index fund. Set up standing order.",
    "profile",
    ["finance", "habits"],
  ),
  mem(
    "Council tax: Band C, 25% single discount",
    "Pay by direct debit over 10 months. Annual bill around £1,400 after discount.",
    "profile",
    ["finance"],
  ),
  mem(
    "Broadband contract renews in September",
    "Currently on Virgin Media 350Mbps. Negotiate or switch to Hyperoptic if available.",
    "profile",
    ["finance"],
  ),
  mem(
    "Emergency fund target: 3 months expenses",
    "Currently at 2 months. Adding £300/month until target reached.",
    "profile",
    ["finance", "habits"],
  ),
  mem(
    "HMRC self-assessment deadline: January 31",
    "Need to declare freelance income from summer contract work. Keep all invoices.",
    "profile",
    ["finance"],
  ),
  mem(
    "Phone plan: £15/month PAYG",
    "Unlimited data, texts, calls on Three. Good international roaming in EU.",
    "profile",
    ["finance"],
  ),
  mem(
    "Gym membership: £35/month",
    "FitZone contract is rolling monthly. Cancel anytime with 30 days notice.",
    "profile",
    ["finance", "health"],
  ),
  mem(
    "Renters insurance through Lemonade",
    "Covers laptop, bike, and personal items. £12/month. Claim process is app-based.",
    "profile",
    ["finance"],
  ),
  mem(
    "Subscriptions to audit quarterly",
    "Spotify, iCloud, GitHub Pro, Notion, Linear, ChatGPT. Total: ~£65/month. Cut unused ones.",
    "profile",
    ["finance", "habits"],
  ),

  // === COOKING / RECIPES (10) === [indices 237-246]
  mem(
    "Quick weeknight pasta: aglio e olio",
    "Garlic, chili flakes, olive oil, spaghetti, parsley. 15 minutes total. Cheap and satisfying.",
    "knowledge",
    ["cooking", "habits"],
  ),
  mem(
    "Sourdough starter: feed every 12 hours",
    "Equal parts flour and water by weight. Peak rise at 4-6 hours after feeding. Keep at room temp.",
    "knowledge",
    ["cooking"],
  ),
  mem(
    "Best scrambled eggs technique",
    "Low heat, constant stirring, remove from heat early. Add cream cheese at the end. Gordon Ramsay method.",
    "knowledge",
    ["cooking"],
  ),
  mem(
    "Batch cooking: chicken tikka masala",
    "Makes 6 portions. Freeze in individual containers. Reheat with extra splash of cream.",
    "knowledge",
    ["cooking", "habits"],
  ),
  mem(
    "Knife skills: rock chop for herbs",
    "Keep tip on board, rock blade through herbs. Sharp knife is safer than dull one.",
    "knowledge",
    ["cooking"],
  ),
  mem(
    "Coffee brewing: V60 pour-over method",
    "15g coffee, 250ml water at 93°C. Bloom 30 seconds. Total brew time: 3 minutes.",
    "knowledge",
    ["cooking", "preferences"],
  ),
  mem(
    "Thai green curry from scratch",
    "Make paste: green chilies, lemongrass, galangal, shrimp paste. Coconut milk, bamboo shoots, Thai basil.",
    "knowledge",
    ["cooking"],
  ),
  mem(
    "Grocery shopping on Tuesday evenings",
    "Tesco restocks Tuesday afternoon. Reduced section has best finds after 7pm.",
    "profile",
    ["cooking", "habits"],
  ),
  mem(
    "Cast iron skillet maintenance",
    "Season with flaxseed oil at 250°C for 1 hour. Never use soap. Dry immediately after washing.",
    "knowledge",
    ["cooking"],
  ),
  mem(
    "Overnight oats recipe",
    "Oats, milk, chia seeds, Greek yogurt, honey. Mix in jar, refrigerate overnight. Add berries in morning.",
    "knowledge",
    ["cooking", "health"],
  ),

  // === ENTERTAINMENT / MEDIA (10) === [indices 247-256]
  mem(
    "Currently watching: Severance S2",
    "Apple TV+. Mind-bending workplace thriller. Best show since Mr. Robot. Weekly release schedule.",
    "episodic",
    ["entertainment"],
  ),
  mem(
    "Game recommendation: Hades 2",
    "Roguelike with incredible narrative design. Each death reveals more story. 30-min runs fit busy schedule.",
    "episodic",
    ["entertainment"],
  ),
  mem(
    "Album on repeat: Igor by Tyler, the Creator",
    "Genre-bending mix of soul, funk, and hip hop. Great for late-night coding sessions.",
    "profile",
    ["entertainment", "preferences"],
  ),
  mem(
    "Documentary: The Social Dilemma",
    "About addictive design in social media. Made me rethink notification patterns in vmem.",
    "episodic",
    ["entertainment", "learning"],
  ),
  mem(
    "Favorite board game: Wingspan",
    "Engine-building game about birds. Beautiful art. 45-min games. Great for game nights.",
    "profile",
    ["entertainment", "preferences"],
  ),
  mem(
    "Reading list: fiction backlog",
    "Klara and the Sun, Tomorrow and Tomorrow and Tomorrow, Piranesi. All recommended by friends.",
    "profile",
    ["entertainment", "learning"],
  ),
  mem(
    "YouTube channels for tech",
    "Fireship for quick overviews, Theo for React takes, ThePrimeagen for entertainment, Traversy for tutorials.",
    "profile",
    ["entertainment", "learning"],
  ),
  mem(
    "Signed up for local film club",
    "Monthly screening at the indie cinema. Next film: Everything Everywhere All at Once director's cut.",
    "episodic",
    ["entertainment", "people"],
  ),
  mem(
    "Favorite comfort show: The Office UK",
    "Re-watch when stressed. Only 2 seasons + Christmas specials. Perfect cringe comedy.",
    "profile",
    ["entertainment", "preferences"],
  ),
  mem(
    "Concert: Bonobo at Printworks",
    "March 22nd. Standing tickets. Amazing live electronic music with a full band.",
    "episodic",
    ["entertainment", "people"],
  ),
];

function rel(sourceIdx: number, targetIdx: number, reason: string) {
  return {
    sourceId: memories[sourceIdx].id,
    targetId: memories[targetIdx].id,
    reason,
  };
}

const relationships = [
  // --- Tech cluster ---
  rel(0, 1, "strict null checks catch the bugs useEffect cleanup prevents"),
  rel(0, 5, "RSCs can't use hooks — strict mode flags those violations"),
  rel(1, 5, "RSCs remove need for useEffect data fetching patterns"),
  rel(1, 14, "Suspense replaces manual loading states in useEffect"),
  rel(2, 6, "UNWIND batch inserts power the Neo4j graph queries"),
  rel(2, 16, "APOC extends the multi-hop traversals Neo4j excels at"),
  rel(3, 8, "pnpm workspaces feed into Docker multi-stage build steps"),
  rel(3, 19, "Bun startup speed matters most in Docker cold starts"),
  rel(4, 13, "discriminated unions replace Zod v4 transform chains"),
  rel(5, 9, "Tailwind v4 CSS-first approach pairs with RSC server rendering"),
  rel(6, 16, "APOC batch ops complement UNWIND for bulk Neo4j writes"),
  rel(7, 15, "Hono requires .js extensions in ESM import paths"),
  rel(10, 14, "Suspense fallback shows while sigma.js WebGL initializes"),
  rel(10, 18, "container queries resize sigma.js graph viewport"),
  rel(11, 6, "Convex subscriptions trigger Neo4j UNWIND re-syncs"),
  rel(12, 3, "rebase keeps Docker layer cache valid across merges"),
  rel(13, 0, "discriminated unions are strict mode's type narrowing tool"),
  rel(15, 7, "Hono middleware imports need ESM .js extension workaround"),
  rel(17, 7, "Clerk webhook handler registers as Hono middleware"),

  // --- Work cluster ---
  rel(20, 21, "Sarah's pairing idea directly addresses WIP overload"),
  rel(20, 29, "retro's WIP limit became a backlog grooming priority"),
  rel(21, 27, "Alex's type assertion feedback echoes Sarah's review ideas"),
  rel(22, 28, "Clerk auth feeds into MCP OAuth integration decision"),
  rel(23, 24, "Hono+Neo4j arch review scoped the sigma.js sprint"),
  rel(24, 35, "sigma.js sprint replaced the canvas causing 10fps stutter"),
  rel(25, 34, "Aura free tier limits shaped the fly.io deploy strategy"),
  rel(26, 30, "thesis demo needs the retrieval benchmarks advisor wants"),
  rel(28, 36, "MCP Resources endpoint needs Convex for user auth layer"),
  rel(29, 33, "groomed backlog items feed directly into sprint review"),
  rel(31, 32, "RSC-first frontend rule led to nuqs for URL state"),
  rel(33, 37, "MCP sprint review triggered the documentation sprint"),
  rel(34, 22, "Clerk pricing evaluation drove the deploy cost strategy"),

  // --- People cluster ---
  rel(
    38,
    42,
    "Alex's Obsidian graph view inspired Sarah's data-first debugging",
  ),
  rel(
    38,
    49,
    "Alex prefers raw queries — same philosophy as Obsidian's local-first",
  ),
  rel(
    39,
    43,
    "Mom's kindle and Dad's Sunday calls — both need calendar reminders",
  ),
  rel(40, 31, "Jake from Vercel validated our RSC-first frontend decision"),
  rel(41, 44, "Prof. Chen's GNN ideas connect to Emma's DDIA recommendation"),
  rel(
    43,
    45,
    "Dad's Sunday calls and Tom's allergy checks — roommate/family care",
  ),
  rel(46, 48, "Dr. Park's ship-fast advice shaped mentor-guided MVP scope"),
  rel(48, 50, "Google recruiter wants the polished MVP Dr. Park recommended"),
  rel(47, 49, "study group discusses the distributed systems Alex debates"),
  rel(50, 52, "recruiter's TS focus motivates helping sister learn to code"),
  rel(51, 53, "TechHub founders and team dinner — same networking circle"),

  // --- Preferences cluster ---
  rel(54, 63, "dark mode in VS Code and Vim keybindings — same editor config"),
  rel(55, 67, "morning deep work blocks are reserved for weekend vmem coding"),
  rel(56, 61, "oat milk cortado fuels the lo-fi hip hop focus sessions"),
  rel(57, 63, "Keychron Q1 pairs with Vim keybindings for typing speed"),
  rel(58, 62, "print books and bullet notes — both physical info retention"),
  rel(59, 60, "Pomodoro sit/stand timer syncs with PR review focus blocks"),
  rel(64, 65, "batch Slack checks protect the 11pm-7am sleep window"),

  // --- Health cluster ---
  rel(68, 73, "5x5 deadlifts and 5K runs share the same morning gym slot"),
  rel(69, 45, "shellfish allergy and Tom's — same EpiPen protocol at dinners"),
  rel(
    70,
    76,
    "3L water goal suffers on the same busy meeting days as caffeine",
  ),
  rel(71, 75, "neck stretches prevent the same RSI that caused wrist pain"),
  rel(73, 77, "5K runs start at FitZone's 6am opening before crowds"),

  // --- Travel cluster ---
  rel(78, 80, "Fuunji ramen queue starts at Shinjuku — Suica card needed"),
  rel(
    79,
    81,
    "Berlin hot desk and Amsterdam bike lanes — EU remote work setup",
  ),
  rel(
    82,
    85,
    "Amsterdam cycling and Singapore hawker — both cheap local transit",
  ),
  rel(83, 86, "Priority Pass lounge covers the long layover to conferences"),
  rel(84, 87, "jet lag strategy applies to eastbound Singapore flights"),
  rel(86, 88, "conference checklist includes the presentation clicker"),
  rel(88, 89, "visa deadlines should be on the conference travel checklist"),

  // --- Cross-cluster bridges ---
  rel(107, 106, "portfolio projects showcase skills for target companies"),
  rel(108, 50, "STAR stories from vmem for the Google recruiter interview"),
  rel(109, 89, "visa sponsorship affects salary negotiation by country"),
  rel(110, 67, "weekend vmem coding feeds the build-in-public tweets"),
  rel(111, 90, "open source TS contributions build Rust comparison skills"),
  rel(112, 26, "defense presentation rehearses the thesis demo content"),
  rel(0, 66, "TypeScript strict mode is why he prefers TS over JS"),
  rel(2, 44, "Emma's DDIA recommendation covers Neo4j cluster patterns"),
  rel(5, 40, "Jake from Vercel confirmed RSC mental model at the summit"),
  rel(10, 24, "sigma.js sprint directly replaced the stuttering canvas"),
  rel(17, 22, "Clerk webhook verification secures the Clerk auth migration"),
  rel(22, 34, "Clerk pricing drove the all-free-tier deploy strategy"),
  rel(26, 46, "Dr. Park's MVP advice shapes the thesis demo scope"),
  rel(30, 105, "advisor benchmarks are a thesis publication prerequisite"),
  rel(41, 105, "Prof. Chen's GNN ideas could strengthen the thesis"),
  rel(42, 27, "Sarah debugs data-first, catching what Alex flagged in review"),
  rel(55, 71, "morning deep work starts after the 5-min stretch routine"),
  rel(56, 78, "cortado ritual mirrors the pre-11am ramen queue in Tokyo"),
  rel(65, 76, "2pm caffeine cutoff protects the 11pm sleep target"),
  rel(68, 84, "jet lag disrupts the 5x5 deadlift schedule abroad"),
  rel(73, 84, "running pace drops after eastbound jet lag recovery"),
  rel(75, 71, "wrist exercises and neck stretches — same physio protocol"),
  rel(80, 92, "sumimasen was the first phrase needed for Tokyo metro"),
  rel(85, 88, "visa timeline feeds into the conference travel checklist"),
  rel(91, 93, "small-world network theory explains Neo4j's traversal speed"),
  rel(93, 103, "WebGL shaders render the graph layouts GDS computes"),
  rel(94, 34, "Raft consensus explains Convex internals in deploy strategy"),
  rel(95, 31, "compound component pattern from course used in RSC frontend"),
  rel(97, 11, "vector embeddings could augment Convex subscription search"),
  rel(99, 26, "Phoenix Project's flow principles guide demo prep priorities"),
  rel(100, 97, "vector similarity is the retrieval scoring mechanism"),
  rel(101, 46, "Toastmasters pacing helps present Dr. Park's MVP pitch"),
  rel(104, 98, "PARA method from Second Brain influenced UX card sorting"),
  rel(106, 48, "Vercel/Anthropic targets align with Dr. Park's polish advice"),
  rel(96, 100, "attention scoring parallels vector embedding similarity"),
  rel(91, 102, "System 1 heuristics mirror memory palace spatial recall"),
  rel(110, 101, "build-in-public tweets practice public speaking skills"),
  rel(59, 71, "standing desk Pomodoro timer doubles as stretch reminder"),

  // --- New tech cluster ---
  rel(113, 8, "Turborepo remote caching requires pnpm workspace setup"),
  rel(114, 0, "Vitest with TypeScript strict mode catches test type errors"),
  rel(116, 5, "React compiler auto-memoization works best with RSCs"),
  rel(117, 7, "OpenTelemetry middleware plugs into Hono middleware chain"),
  rel(119, 11, "Drizzle type inference complements Convex subscription model"),
  rel(121, 10, "Playwright E2E tests cover sigma.js graph interactions"),
  rel(122, 2, "CQRS read model could cache Neo4j traversal results"),
  rel(123, 8, "Biome replaces ESLint in pnpm workspace lint pipeline"),
  rel(125, 4, "tRPC end-to-end types complement Zod v4 schema validation"),
  rel(129, 130, "shadcn/ui components use Motion for layout animations"),
  rel(130, 14, "layout animations enhance Suspense boundary transitions"),
  rel(131, 13, "Zod discriminated unions complement TS discriminated unions"),
  rel(126, 125, "rate limiting protects the tRPC endpoints from abuse"),
  rel(127, 153, "React Native Expo needed for mobile app feasibility"),
  rel(128, 2, "Neon Postgres branching vs Neo4j for graph data decisions"),
  rel(133, 11, "Tanstack Query stale-while-revalidate for Convex fallback"),

  // --- New work cluster ---
  rel(143, 7, "API versioning applies to Hono route organization"),
  rel(144, 26, "stakeholder demo built on thesis demo prep work"),
  rel(145, 6, "duplication bug fixed using Neo4j MERGE vs UNWIND CREATE"),
  rel(147, 126, "API rate limits use Redis sliding window implementation"),
  rel(149, 114, "testing gaps addressed by Vitest integration tests"),
  rel(150, 30, "user study recruitment builds on thesis advisor feedback"),
  rel(152, 153, "mobile app accessibility needs keyboard graph navigation"),
  rel(155, 34, "performance budget shapes the deployment strategy"),
  rel(156, 125, "REST over GraphQL aligns with tRPC monorepo approach"),
  rel(158, 29, "onboarding flow groomed alongside backlog items"),
  rel(159, 113, "CI optimization leverages Turborepo remote caching"),

  // --- New people cluster ---
  rel(163, 23, "Ryan's monolith take validates Hono+Neo4j arch decision"),
  rel(164, 130, "Maya's design constraints applied to Motion animations"),
  rel(166, 46, "Ben's startup advice echoes Dr. Park's ship-fast mentality"),
  rel(169, 40, "Lisa's Deno work connects to Jake's Next.js work at Vercel"),
  rel(170, 49, "Alex testing debate continues from his hot take on ORMs"),
  rel(173, 2, "Omar's fraud detection experience validates Neo4j choice"),
  rel(177, 104, "book club reads connect to Second Brain PARA method"),

  // --- New preferences cluster ---
  rel(178, 54, "font and dark mode choices are part of same editor setup"),
  rel(181, 61, "podcast routine plays during lo-fi hip hop focus breaks"),
  rel(183, 12, "conventional commits style enforced by git hooks"),
  rel(186, 64, "async communication preference maps to batch Slack checks"),
  rel(187, 60, "morning PR review fits before the Pomodoro deep work block"),
  rel(189, 38, "Obsidian daily notes complement Alex's recommendation"),

  // --- New health cluster ---
  rel(190, 74, "protein target supports the meal prep routine"),
  rel(192, 65, "Oura Ring sleep tracking validates 11pm-7am target"),
  rel(194, 68, "cold showers done after morning 5x5 lifting sessions"),
  rel(196, 73, "yoga on Saturdays complements the 5K running schedule"),
  rel(199, 73, "foam rolling after 5K runs prevents knee issues"),

  // --- New travel cluster ---
  rel(201, 89, "passport renewal deadline tied to visa timing advice"),
  rel(203, 82, "noise-cancelling headphones for the Amsterdam flights"),
  rel(205, 78, "Kyoto etiquette from the same Japan trip as Shibuya ramen"),
  rel(208, 80, "eSIM replaces Suica for data needs in Japan"),
  rel(210, 86, "one-bag packing works with Priority Pass carry-on focus"),
  rel(211, 85, "Changi airport layover using Priority Pass lounge"),

  // --- New learning cluster ---
  rel(212, 131, "category theory functors map to Zod discriminated unions"),
  rel(213, 102, "spaced repetition is algorithmic memory palace technique"),
  rel(214, 11, "CRDTs could enable offline-first Convex sync"),
  rel(217, 218, "fast-check property testing found bugs Advent of Code missed"),
  rel(220, 100, "BM25 retrieval scoring parallels vector embedding search"),
  rel(221, 104, "Zettelkasten method directly influenced Second Brain PARA"),
  rel(223, 93, "PageRank could rank memory nodes in Neo4j graph"),
  rel(
    224,
    37,
    "event sourcing pattern powers our timeline documentation sprint",
  ),
  rel(226, 46, "Staff Engineer leverage aligns with Dr. Park's MVP advice"),

  // --- Finance cross-links ---
  rel(227, 109, "student loan repayment affects salary negotiation calculus"),
  rel(232, 233, "HMRC self-assessment covers the gym and phone expenses"),
  rel(236, 64, "subscription audit aligns with batch notification policy"),

  // --- Cooking cross-links ---
  rel(237, 74, "aglio e olio is a quick protein-light meal prep option"),
  rel(242, 56, "V60 pour-over method for the oat milk cortado ritual"),
  rel(246, 190, "overnight oats hit the protein target with Greek yogurt"),

  // --- Entertainment cross-links ---
  rel(250, 251, "Tyler's Igor album and Hades 2 both for late-night sessions"),
  rel(253, 177, "board game nights overlap with book club friend group"),
  rel(256, 165, "Bonobo concert same month as cousin's wedding planning"),
];

function buildEvents(mems: typeof memories) {
  const events: Array<{
    eventId: string;
    memoryId: string;
    action: string;
    createdAt: string;
  }> = [];

  for (const m of mems) {
    events.push({
      eventId: crypto.randomUUID(),
      memoryId: m.id,
      action: "created",
      createdAt: m.createdAt,
    });
  }

  const updatedIndices = [
    3, 10, 22, 27, 35, 48, 55, 68, 78, 95, 116, 130, 145, 155, 178, 190, 201,
    213, 237, 248,
  ];
  for (const idx of updatedIndices) {
    const m = mems[idx];
    if (!m) continue;
    const createdMs = new Date(m.createdAt).getTime();
    const laterMs = createdMs + (1 + Math.random() * 5) * 86400000;
    events.push({
      eventId: crypto.randomUUID(),
      memoryId: m.id,
      action: "updated",
      createdAt: new Date(laterMs).toISOString(),
    });
  }

  return events;
}

function remapId(idMap: Map<string, string>, oldId: string): string {
  const newId = idMap.get(oldId);
  if (newId === undefined) throw new Error(`unmapped id: ${oldId}`);
  return newId;
}

async function seed() {
  console.log("connecting to Neo4j...");
  const driver = getDriver();
  const session = driver.session();

  try {
    console.log("wiping all data...");
    await session.run("MATCH (n) DETACH DELETE n");

    console.log("recreating indexes and constraints...");
    await setupDatabase(driver);
    await ensureIndexes();

    let totalMemories = 0;
    let totalRelationships = 0;
    let totalEvents = 0;

    for (const userId of USER_IDS) {
      console.log(`\nseeding user: ${userId}`);

      const idMap = new Map<string, string>();
      const userMemories = memories.map((m) => {
        const newId = crypto.randomUUID();
        idMap.set(m.id, newId);
        return { ...m, id: newId, userId };
      });

      const userRelationships = relationships.map((r) => ({
        sourceId: remapId(idMap, r.sourceId),
        targetId: remapId(idMap, r.targetId),
        reason: r.reason,
      }));

      const userEvents = buildEvents(userMemories);

      console.log(`  inserting ${userMemories.length} memories...`);
      await session.run(
        `UNWIND $memories AS mem
         CREATE (m:Memory {
           id: mem.id, userId: mem.userId, title: mem.title,
           content: mem.content, type: mem.type, source: mem.source,
           confidence: mem.confidence, status: mem.status,
           createdAt: mem.createdAt, updatedAt: mem.updatedAt,
           expiresAt: mem.expiresAt
         })
         WITH m, mem
         MERGE (s:Source {name: mem.source})
         CREATE (m)-[:FROM_SOURCE]->(s)
         WITH m, mem
         FOREACH (tagName IN mem.tags |
           MERGE (t:Tag {name: tagName})
           MERGE (m)-[:TAGGED_WITH]->(t)
         )`,
        { memories: userMemories },
      );

      console.log(`  creating ${userRelationships.length} relationships...`);
      await session.run(
        `UNWIND $rels AS rel
         MATCH (a:Memory {id: rel.sourceId})
         MATCH (b:Memory {id: rel.targetId})
         CREATE (a)-[:RELATES_TO {reason: rel.reason}]->(b)`,
        { rels: userRelationships },
      );

      console.log(`  creating ${userEvents.length} events...`);
      await session.run(
        `UNWIND $events AS evt
         MATCH (m:Memory {id: evt.memoryId})
         CREATE (e:MemoryEvent {
           id: evt.eventId,
           action: evt.action,
           actor: 'system',
           details: '{}',
           snapshot: null,
           createdAt: evt.createdAt
         })
         CREATE (e)-[:EVENT_FOR]->(m)`,
        { events: userEvents },
      );

      totalMemories += userMemories.length;
      totalRelationships += userRelationships.length;
      totalEvents += userEvents.length;
    }

    console.log("\ndone!");
    console.log(`  users: ${USER_IDS.length}`);
    console.log(`  memories: ${totalMemories}`);
    console.log(`  relationships: ${totalRelationships}`);
    console.log(`  events: ${totalEvents}`);
  } finally {
    await session.close();
    await closeDriver();
  }
}

seed().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
