import crypto from "node:crypto";

export const HANDCRAFTED_MEMORY_COUNT = 257;

export const SEED_USER_IDS = [
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
  if (idx < 50) {
    createdAt = recentDate(7);
  } else if (idx < 300) {
    createdAt = recentDate(30);
  } else if (idx < 1500) {
    createdAt = randomDate(90);
  } else if (idx < 4000) {
    createdAt = randomDate(180);
  } else if (idx < 7500) {
    createdAt = randomDate(365);
  } else {
    createdAt = randomDate(730);
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
    "Return a cleanup function from React hooks (especially useEffect) to unsubscribe listeners and cancel pending requests when a component unmounts. Pair with strict null checks when mixing hooks and server components.",
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
  // -- index 15+ â†’ within 30 days --
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
    "Evaluated Auth0, Clerk OAuth, and Supabase Auth for MCP resource integration. Clerk won on DX and pricing for our scale.",
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
  // -- index 35+ â†’ spread across 90 days --
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
    "Personal coding preference: choose TypeScript over JavaScript on every project. Pairs well with dark mode editors and Vim-style keybindings.",
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
    "Health routine: run a 5K on Tuesday, Thursday, and Saturday mornings. Current pace: 5:30/km. Goal: sub-25 minute 5K.",
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

  // === LEARNING NOTES â€” BRIDGES (15) === [indices 90-104]
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
    "Self-attention computes relevance scores between all token pairs. O(nÂ²) complexity.",
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
    "London: Â£45-65k, Remote US: $120-160k. Factor in cost of living and visa sponsorship.",
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
    "Coworking spaces from â‚¬10/day. Great beer for â‚¬2. Public transit covers everywhere.",
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
    "Plan 2: repay when earning over Â£27,295. 9% of income above threshold.",
    "profile",
    ["finance"],
  ),
  mem(
    "ISA contribution deadline: April 5",
    "Max Â£20,000 per tax year. Using Vanguard S&P 500 index fund. Set up standing order.",
    "profile",
    ["finance", "habits"],
  ),
  mem(
    "Council tax: Band C, 25% single discount",
    "Pay by direct debit over 10 months. Annual bill around Â£1,400 after discount.",
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
    "Currently at 2 months. Adding Â£300/month until target reached.",
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
    "Phone plan: Â£15/month PAYG",
    "Unlimited data, texts, calls on Three. Good international roaming in EU.",
    "profile",
    ["finance"],
  ),
  mem(
    "Gym membership: Â£35/month",
    "FitZone contract is rolling monthly. Cancel anytime with 30 days notice.",
    "profile",
    ["finance", "health"],
  ),
  mem(
    "Renters insurance through Lemonade",
    "Covers laptop, bike, and personal items. Â£12/month. Claim process is app-based.",
    "profile",
    ["finance"],
  ),
  mem(
    "Subscriptions to audit quarterly",
    "Spotify, iCloud, GitHub Pro, Notion, Linear, ChatGPT. Total: ~Â£65/month. Cut unused ones.",
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
    "15g coffee, 250ml water at 93Â°C. Bloom 30 seconds. Total brew time: 3 minutes.",
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
    "Season with flaxseed oil at 250Â°C for 1 hour. Never use soap. Dry immediately after washing.",
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

  // === GENERATED BULK MEMORIES (10000) ===
  ...generateBulkMemories(10000),
];

function generateBulkMemories(count: number) {
  let seed = 42;
  function rng() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  // â”€â”€ TECH â”€â”€
  const techSubjects = [
    "AWS Lambda",
    "Redis cluster",
    "gRPC",
    "Kubernetes",
    "Terraform",
    "GraphQL subscriptions",
    "Prometheus",
    "Nginx",
    "PostgreSQL",
    "MongoDB",
    "RabbitMQ",
    "Elasticsearch",
    "Kafka",
    "Cloudflare Workers",
    "S3 presigned URLs",
    "DynamoDB",
    "Vercel serverless",
    "GitHub Copilot",
    "Webpack",
    "SWC compiler",
    "pnpm workspaces",
    "Deno Deploy",
    "Bun runtime",
    "Node.js workers",
    "Express.js",
    "Prisma ORM",
    "Drizzle ORM",
    "TypeScript project refs",
    "ESBuild",
    "Rollup plugins",
    "PostCSS plugins",
    "CSS Houdini",
    "Web Components",
    "Service Workers",
    "IndexedDB",
    "WebAssembly SIMD",
    "Chrome DevTools",
    "Lighthouse CI",
    "Sentry",
    "DataDog APM",
    "PagerDuty",
    "Argo CD",
    "Helm charts",
    "Docker Compose",
    "Podman",
    "Nix flakes",
    "Mise tooling",
    "Caddy server",
    "Traefik routing",
    "Consul mesh",
    "Vault secrets",
    "MinIO",
    "ClickHouse",
    "TimescaleDB",
    "CockroachDB",
    "PlanetScale",
    "Supabase RLS",
    "Firebase offline",
    "Upstash Redis",
    "Turso libSQL",
    "Fly.io machines",
    "Railway deploys",
    "Render blueprints",
    "Coolify",
    "SST Ion",
    "Pulumi IaC",
    "AWS CDK",
    "Azure Functions",
    "GCP Cloud Run",
    "Netlify Edge",
    "Astro islands",
    "SvelteKit actions",
    "Nuxt server routes",
    "Remix loaders",
    "Fresh framework",
    "Solid.js signals",
    "Qwik resumability",
    "Angular signals",
    "Vue composables",
    "Alpine.js",
    "HTMX boost",
    "Stimulus controllers",
    "Turbo streams",
    "Phoenix LiveView",
    "Elixir channels",
    "Go Chi router",
    "Rust Axum",
    "Python FastAPI",
    "Django Ninja",
    "Spring WebFlux",
    "Kotlin Ktor",
    "Next.js parallel routes",
    "Next.js intercepting routes",
    "React use() hook",
    "React cache()",
    "Tailwind @apply",
    "CSS anchor positioning",
    "View Transitions API",
    "Popover API",
    "Dialog element",
    "Navigation API",
    "React Server Components",
    "Zustand store",
    "Jotai atoms",
    "TanStack Query",
    "Effect-TS",
    "Zod v4 schemas",
    "tRPC endpoints",
    "Hono middleware",
    "Convex subscriptions",
    "Neo4j APOC",
    "Neo4j GDS",
    "SQLite WAL mode",
    "Neon Postgres branches",
    "Redis Streams",
    "NATS messaging",
    "gRPC-web proxy",
    "WebSocket scaling",
    "SSE streaming",
    "HTTP/3 QUIC",
    "mTLS setup",
    "OAuth 2.1 PKCE",
    "JWT rotation",
    "CORS policy",
    "CSP headers",
    "HSTS config",
    "rate limiting",
    "circuit breakers",
    "bulkhead pattern",
    "saga pattern",
    "outbox pattern",
    "event sourcing",
    "CQRS reads",
    "domain events",
    "aggregate roots",
    "value objects",
    "bounded contexts",
    "OpenTelemetry traces",
    "structured logging",
    "feature flags",
    "canary deploys",
    "blue-green deploy",
    "rolling updates",
  ];

  const techActions = [
    "cold start fix",
    "connection pool tuning",
    "memory leak diagnosis",
    "latency reduction",
    "throughput optimization",
    "cache strategy",
    "index rebuild",
    "query plan analysis",
    "schema migration",
    "error boundary setup",
    "retry with backoff",
    "timeout tuning",
    "load balancer config",
    "health check endpoint",
    "graceful shutdown",
    "hot reload fix",
    "build cache optimization",
    "tree shaking audit",
    "code split strategy",
    "lazy load implementation",
    "prefetch setup",
    "compression config",
    "source map setup",
    "debugging workflow",
    "profiling results",
    "benchmark comparison",
    "monitoring dashboard",
    "alert threshold tuning",
    "deploy pipeline fix",
    "rollback procedure",
    "secret rotation",
    "cert renewal",
    "access control audit",
    "encryption at rest",
    "audit log setup",
    "compliance verification",
    "backup validation",
    "failover drill",
    "capacity forecast",
    "cost reduction",
    "resource right-sizing",
    "autoscale policy",
    "multi-region failover",
    "edge cache rules",
    "CDN purge strategy",
    "DNS failover",
    "SSL termination",
    "proxy chain debug",
    "container resource limits",
    "sidecar injection",
    "init container setup",
    "readiness probe fix",
    "liveness probe tuning",
    "startup probe addition",
    "PVC resize",
    "node affinity rules",
    "pod disruption budget",
    "network policy",
    "ingress TLS",
    "service account scoping",
  ];

  const techDetails = [
    "Reduced response time from 800ms to 120ms by restructuring the query path and adding connection pooling.",
    "Found the root cause after profiling â€” garbage collection pauses during peak traffic caused cascading timeouts.",
    "Benchmarked three approaches: the simplest one won. Over-engineering added latency without improving throughput.",
    "The config change was one line but took 4 hours to find. Documentation was outdated and misleading.",
    "Migration completed with zero downtime using blue-green. Rolled back once during testing, smooth in production.",
    "Caching reduced database load by 85%. Set TTL to 5 minutes with stale-while-revalidate for consistency.",
    "Index scan replaced sequential scan. Query time dropped from 3.2s to 12ms on the 10M row table.",
    "Retry logic with exponential backoff and jitter fixed the thundering herd during recovery.",
    "Moved from polling to push-based updates. WebSocket reduced server load and improved UX.",
    "Switched from JSON to protobuf for internal comms. Payload size dropped 60%, parsing 10x faster.",
    "Circuit breaker with 5s timeout and 30s recovery window prevents cascade failures across services.",
    "Structured logging with correlation IDs lets us trace a request across all 8 microservices.",
    "The memory leak was a closure holding DOM node references. GC couldn't reach them through the event listener.",
    "Sharding by tenant ID distributed writes evenly. Hot partition was causing p90 latency spikes.",
    "Edge compression reduced bandwidth 40%. Brotli for text assets, WebP for images, AVIF where supported.",
    "Lazy loading cut initial bundle from 2.4MB to 380KB. Time to interactive dropped by half.",
    "Pre-warming the connection pool on startup eliminated cold-start latency for first request batch.",
    "Deadlock from two services acquiring locks in opposite order. Added a lock ordering convention.",
    "Rate limiting at API gateway with sliding window. Free tier: 100/min, paid: 1000/min.",
    "Canary caught a regression unit tests missed. 5% traffic slice showed elevated 5xx rates.",
    "Connection pool exhaustion during spike. Increased max connections and added queue with timeout.",
    "N+1 query was firing 200 extra queries per page load. DataLoader batch loading fixed it instantly.",
    "Cron to event-driven processing cut latency from minutes to sub-second for notifications.",
    "Health endpoint now verifies DB, cache, and disk. Kubernetes uses it for automatic pod replacement.",
    "Graceful shutdown drains in-flight requests over 30s. No more dropped connections during deploys.",
    "Source maps uploaded to error tracker. Production stack traces now show original TypeScript lines.",
    "Build dropped from 45s to 8s with persistent cache and parallel compilation enabled.",
    "Alerts set for error rate > 1%, p99 > 500ms, disk > 80%. On-call gets PagerDuty notification.",
    "Active-active in US-East and EU-West cut European user latency by 60%.",
    "Database vacuum tuning reduced bloat by 70%. Autovacuum was too conservative for our write volume.",
  ];

  const techTags = [
    ["aws", "serverless"],
    ["redis", "caching"],
    ["grpc", "api-design"],
    ["kubernetes", "containers"],
    ["terraform", "iac"],
    ["graphql", "api-design"],
    ["prometheus", "observability"],
    ["nginx", "networking"],
    ["postgresql", "sql"],
    ["mongodb", "nosql"],
    ["rabbitmq", "messaging"],
    ["elasticsearch", "search"],
    ["kafka", "streaming"],
    ["cloudflare", "edge"],
    ["aws", "storage"],
    ["dynamodb", "nosql"],
    ["vercel", "deployment"],
    ["ai-tools", "dx"],
    ["webpack", "bundling"],
    ["compilers", "performance"],
    ["pnpm", "monorepo"],
    ["deno", "runtime"],
    ["bun", "runtime"],
    ["nodejs", "concurrency"],
    ["express", "http"],
    ["prisma", "orm"],
    ["drizzle", "orm"],
    ["typescript", "build-tools"],
    ["esbuild", "bundling"],
    ["rollup", "bundling"],
    ["css", "tooling"],
    ["css", "rendering"],
    ["web-components", "frontend"],
    ["pwa", "offline"],
    ["indexeddb", "storage"],
    ["wasm", "performance"],
    ["devtools", "debugging"],
    ["lighthouse", "performance"],
    ["sentry", "error-tracking"],
    ["datadog", "observability"],
    ["pagerduty", "alerting"],
    ["argocd", "gitops"],
    ["helm", "kubernetes"],
    ["docker", "containers"],
    ["podman", "containers"],
    ["nix", "dev-env"],
    ["mise", "dev-env"],
    ["caddy", "tls"],
    ["traefik", "routing"],
    ["consul", "service-mesh"],
    ["vault", "secrets"],
    ["minio", "storage"],
    ["clickhouse", "analytics"],
    ["timescaledb", "time-series"],
    ["cockroachdb", "distributed-sql"],
    ["planetscale", "mysql"],
    ["supabase", "baas"],
    ["firebase", "baas"],
    ["upstash", "serverless-redis"],
    ["turso", "edge-db"],
    ["fly-io", "deployment"],
    ["railway", "deployment"],
    ["render", "deployment"],
    ["coolify", "self-hosted"],
    ["sst", "serverless"],
    ["pulumi", "iac"],
    ["aws-cdk", "iac"],
    ["azure", "cloud"],
    ["gcp", "cloud"],
    ["netlify", "jamstack"],
    ["astro", "ssg"],
    ["svelte", "frontend"],
    ["nuxt", "vue"],
    ["remix", "react"],
    ["deno-fresh", "frontend"],
    ["solidjs", "frontend"],
    ["qwik", "frontend"],
    ["angular", "frontend"],
    ["vue", "frontend"],
    ["alpinejs", "progressive-enhancement"],
    ["htmx", "hypermedia"],
    ["stimulus", "rails"],
    ["turbo", "rails"],
    ["phoenix", "elixir"],
    ["golang", "backend"],
    ["rust", "backend"],
    ["fastapi", "python"],
    ["django", "python"],
    ["spring", "java"],
    ["kotlin", "jvm"],
    ["nextjs", "react"],
    ["react-hooks", "frontend"],
    ["tailwind", "css"],
    ["css-features", "frontend"],
    ["view-transitions", "ux"],
    ["popover", "a11y"],
    ["dialog", "a11y"],
    ["navigation-api", "spa"],
    ["rsc", "react"],
    ["zustand", "state"],
    ["jotai", "state"],
    ["tanstack", "data-fetching"],
    ["effect-ts", "fp"],
    ["zod", "validation"],
    ["trpc", "type-safety"],
    ["hono", "http"],
    ["convex", "baas"],
    ["neo4j", "graph-db"],
    ["neo4j-gds", "graph-algorithms"],
    ["sqlite", "embedded-db"],
    ["neon", "postgres"],
    ["redis-streams", "messaging"],
    ["nats", "messaging"],
    ["grpc-web", "frontend"],
    ["websocket", "real-time"],
    ["sse", "real-time"],
    ["http3", "networking"],
    ["mtls", "security"],
    ["oauth", "auth"],
    ["jwt", "auth"],
    ["cors", "security"],
    ["csp", "security"],
    ["hsts", "security"],
    ["rate-limiting", "resilience"],
    ["circuit-breaker", "resilience"],
    ["bulkhead", "resilience"],
    ["saga", "distributed"],
    ["outbox", "messaging"],
    ["event-sourcing", "architecture"],
    ["cqrs", "architecture"],
    ["ddd", "architecture"],
    ["otel", "observability"],
    ["logging", "observability"],
    ["feature-flags", "release"],
    ["canary", "deployment"],
    ["blue-green", "deployment"],
    ["rolling-update", "deployment"],
  ];

  // â”€â”€ WORK â”€â”€
  const workContexts = [
    "sprint planning",
    "retrospective",
    "standup",
    "1:1 with manager",
    "design review",
    "architecture review",
    "incident post-mortem",
    "stakeholder demo",
    "backlog grooming",
    "code review sync",
    "pair programming session",
    "knowledge transfer",
    "onboarding session",
    "quarterly OKR review",
    "team sync",
    "cross-team alignment",
    "customer feedback review",
    "security audit",
    "performance calibration",
    "release planning",
    "feature kickoff",
    "bug triage session",
    "capacity planning",
    "tech debt review",
    "documentation sprint",
    "user research debrief",
    "A/B test analysis",
    "competitive deep-dive",
    "vendor evaluation",
    "compliance check",
    "accessibility audit",
    "load test review",
    "migration planning",
    "team building event",
    "all-hands meeting",
    "product council",
    "engineering council",
    "incident war room",
    "reliability review",
    "on-call handoff",
    "runbook review",
    "demo day presentation",
    "intern project review",
    "mentor check-in",
    "skip-level 1:1",
    "offsite brainstorm",
    "hiring debrief",
    "interview panel sync",
    "budget review",
  ];

  const workTopics = [
    "API versioning strategy",
    "search relevance tuning",
    "notification redesign",
    "mobile performance audit",
    "graph viz optimization",
    "memory lifecycle policies",
    "export feature scope",
    "Notion/Obsidian import",
    "tag management overhaul",
    "onboarding funnel",
    "billing integration",
    "rate limiting tiers",
    "error handling standards",
    "logging consistency",
    "monitoring gap analysis",
    "CI/CD flakiness",
    "staging instability",
    "preview deploy workflow",
    "feature flag cleanup",
    "dependency upgrade plan",
    "test coverage targets",
    "code ownership model",
    "on-call rotation balance",
    "incident response playbook",
    "data retention policy",
    "GDPR deletion workflow",
    "SOC 2 controls",
    "API docs automation",
    "SDK prioritization",
    "plugin architecture RFC",
    "webhook retry logic",
    "batch pipeline reliability",
    "real-time sync issues",
    "cache warming strategy",
    "connection pool sizing",
    "slow query backlog",
    "frontend perf budget",
    "bundle size audit",
    "WCAG compliance",
    "i18n infrastructure",
    "dark mode polish",
    "keyboard nav coverage",
    "screen reader support",
    "color contrast fixes",
    "responsive breakpoints",
    "error boundary placement",
    "skeleton loader patterns",
    "empty state copy",
    "form validation UX",
    "pagination approach",
    "search autocomplete",
    "file upload limits",
    "image pipeline",
    "PDF export service",
    "graph rendering perf",
    "memory deduplication",
    "context trace accuracy",
    "proposed updates UX",
    "memory pinning flow",
    "suppress/expire policies",
    "MCP resource endpoints",
    "OAuth token lifecycle",
    "webhook signature verification",
    "Neo4j query optimization",
    "Convex schema migration",
    "seed data expansion",
    "Clerk integration polish",
    "mobile auth flow",
    "deep link handling",
    "push notification setup",
    "offline sync strategy",
    "background job monitoring",
  ];

  const workOutcomes = [
    "Team agreed to proceed with simpler approach. Revisit in Q3 if we hit scaling limits.",
    "Blocked by third-party API changes. Coordinating timeline with their engineering team.",
    "Shipped to 10% of users. Monitoring error rates for one week before wider rollout.",
    "Deferred to post-MVP. Too much scope creep risk for current sprint.",
    "Found 3 critical bugs during review. All fixed and deployed to staging for verification.",
    "Customer feedback overwhelmingly positive. Top request: bulk operations support.",
    "Reduced tech debt score by 15 points. Main improvements in tests and error handling.",
    "New hire ramping faster than expected. Already contributing to the memory engine.",
    "Cost analysis: 40% savings by switching providers. Migration plan drafted and reviewed.",
    "Performance improved 3x after optimizations. Comfortably within SLA targets now.",
    "Identified 8 documentation gaps. Assigned owners and deadlines for each.",
    "Migration dry run: 23 minutes for 2M records. Production run scheduled for Sunday 2am.",
    "User study revealed confusion in proposed updates flow. Redesigning approval UX.",
    "Compliance audit passed with 2 minor findings. Remediation plans filed.",
    "Sprint velocity highest in 3 months. WIP limits are clearly working.",
    "Incident resolved in 18 minutes â€” below our 30-minute SLA target. Post-mortem Thursday.",
    "A/B test: 22% improvement in activation rate. Shipping winning variant to all users.",
    "Technical feasibility confirmed. Estimate: 3 sprints for full implementation.",
    "Vendor shortlist: 2 finalists. Setting up proof-of-concept trials next week.",
    "Accessibility audit: 15 issues (4 critical, 8 moderate, 3 minor). Fix sprint planned.",
    "Feature flag removed after 30 days at 100%. Code paths simplified significantly.",
    "Interview candidate strong on system design but weak on TypeScript. Proceeding to final round.",
    "Budget approved for infrastructure upgrade. Starting with database vertical scaling.",
    "On-call load reduced 40% after fixing the top 3 noisy alerts. Team morale improved.",
    "Runbook gaps found during drill. 3 procedures were outdated. Updated and tested.",
  ];

  const workTags = [
    ["sprint-planning", "agile"],
    ["retrospective", "process"],
    ["standup", "daily"],
    ["one-on-one", "management"],
    ["design-review", "ux"],
    ["architecture", "rfc"],
    ["incident", "post-mortem"],
    ["demo", "stakeholders"],
    ["backlog", "prioritization"],
    ["code-review", "quality"],
    ["pairing", "collaboration"],
    ["knowledge-sharing", "docs"],
    ["onboarding", "team"],
    ["okrs", "goals"],
    ["team-sync", "communication"],
    ["cross-team", "alignment"],
    ["customer-feedback", "product"],
    ["security", "audit"],
    ["performance-review", "career"],
    ["release", "planning"],
    ["feature-kickoff", "product"],
    ["bug-triage", "quality"],
    ["capacity", "resourcing"],
    ["tech-debt", "maintenance"],
    ["documentation", "dx"],
    ["user-research", "product"],
    ["ab-testing", "data"],
    ["competitive-analysis", "strategy"],
    ["vendor", "procurement"],
    ["compliance", "legal"],
    ["accessibility", "a11y"],
    ["load-testing", "reliability"],
    ["migration", "database"],
    ["team-building", "culture"],
    ["all-hands", "company"],
    ["product-council", "strategy"],
    ["engineering-council", "standards"],
    ["war-room", "incident"],
    ["sre", "reliability"],
    ["on-call", "operations"],
    ["runbook", "procedures"],
    ["demo-day", "showcase"],
    ["intern", "mentoring"],
    ["mentorship", "growth"],
    ["skip-level", "management"],
    ["offsite", "planning"],
    ["hiring", "recruiting"],
    ["interview", "hiring"],
    ["budget", "finance"],
  ];

  // â”€â”€ PEOPLE â”€â”€
  const personNames = [
    "Marcus",
    "Wei",
    "Sophia",
    "Dave",
    "Yuki",
    "Sam",
    "Karen",
    "Raj",
    "Julia",
    "Chen",
    "Nadia",
    "Leo",
    "Yui",
    "Kim",
    "Pat",
    "Priya",
    "Geoff",
    "Omar",
    "Jamie",
    "Maya",
    "Ryan",
    "Ben",
    "Lisa",
    "Amir",
    "Elena",
    "Tomas",
    "Rin",
    "Kofi",
    "Freya",
    "Dante",
    "Zara",
    "Hiro",
    "Ingrid",
    "Lucas",
    "Nina",
    "Oscar",
    "Petra",
    "Quinn",
    "Rosa",
    "Sven",
    "Uma",
    "Viktor",
    "Wren",
    "Xander",
    "Yelena",
    "Zoe",
    "Ash",
    "Blake",
    "Cleo",
    "Drew",
    "Ellis",
    "Finn",
    "Gia",
    "Hugo",
    "Ivy",
    "Jude",
    "Kai",
    "Luna",
    "Milo",
    "Noor",
    "Olive",
    "Pax",
    "Remy",
    "Sol",
    "Tara",
    "Uri",
    "Vera",
    "Wade",
    "Xiomara",
    "Yosef",
    "Zuri",
    "Arlo",
    "Bea",
    "Cruz",
    "Dara",
    "Emi",
    "Felix",
    "Gwen",
    "Hasan",
    "Isla",
    "Jem",
    "Kira",
    "Luca",
    "Mina",
    "Nico",
    "Opal",
    "Rio",
    "Sage",
    "Thea",
    "Van",
    "Willa",
    "Xan",
    "Yara",
    "Zeke",
    "Ada",
    "Bo",
  ];

  const personContexts = [
    "at the React London meetup",
    "at the TypeScript conference",
    "at a coffee shop in Soho",
    "at FitZone gym",
    "at a dinner party in Hackney",
    "at HackLondon hackathon",
    "at Outsite coworking Lisbon",
    "at the British Library",
    "on a Zoom call",
    "at the pub after work",
    "at a Neo4j workshop",
    "at the monthly book club",
    "at the climbing gym",
    "at Victoria Park",
    "at a YC networking event",
    "at the WeWork office",
    "at Tom's birthday party",
    "at Broadway Market",
    "at a Bonobo concert",
    "at Friday game night",
    "at a Thai cooking class",
    "at Tony's barber shop",
    "at a Code First Girls event",
    "at the study group",
    "at the Hono contributor meetup",
    "at a GraphQL summit",
    "at a Svelte meetup",
    "at the Rust London group",
    "at a DevOps meetup",
    "at the Python user group",
    "at a Kubernetes workshop",
    "at a Redis day event",
    "at the local film club",
  ];

  const personTopics = [
    "recommended a great book on distributed systems",
    "shared their experience migrating from monolith to microservices",
    "gave advice on negotiating a tech salary in London",
    "explained their personal knowledge management system",
    "talked about their side project using graph databases",
    "mentioned they're hiring senior TypeScript engineers",
    "shared debugging tips for production Node.js memory leaks",
    "recommended a specific mechanical keyboard for coding",
    "discussed trade-offs of remote vs hybrid work",
    "shared their 5am productivity routine",
    "talked about recovering from burnout",
    "recommended a climbing gym with great bouldering problems",
    "gave tips on meal prepping for the whole week",
    "explained their index fund investment strategy",
    "shared their approach to learning Rust coming from TypeScript",
    "talked about their solo travel through Southeast Asia",
    "mentioned a great physiotherapist for wrist RSI",
    "recommended Wanikani for learning Japanese kanji",
    "discussed the best areas for renting in South London",
    "shared their Couch-to-5K to half-marathon journey",
    "recommended the Changelog podcast for engineering news",
    "talked about building a home lab with Proxmox",
    "explained how they organize their Obsidian vault with PARA",
    "mentioned a new board game cafe in Shoreditch",
    "shared their 72-hour sourdough recipe",
    "gave advice on CFP submissions for tech conferences",
    "talked about their NLP research using transformers",
    "recommended a coworking space in Porto",
    "shared their approach to giving kind but honest code reviews",
    "discussed managing open source maintainer burnout",
    "talked about switching from frontend to platform engineering",
    "explained their progressive overload spreadsheet for lifting",
    "recommended a specific travel credit card for points",
    "shared their experience doing a mass migration to Bun",
    "discussed the future of WebAssembly for server-side",
    "mentioned a great dim sum place in Chinatown",
    "gave tips on acing system design interviews",
    "talked about their year-long sabbatical backpacking",
    "recommended daily cold exposure for focus",
    "shared their Vim keybinding workflow in VS Code",
  ];

  const personDetails = [
    "Really insightful perspective. Connected on LinkedIn to continue the conversation.",
    "They've been doing this for 8 years â€” experience showed. Took detailed notes.",
    "Different approach than mine. Worth trying their method for a few weeks.",
    "We disagree on this but their reasoning is solid. Good to have the counterpoint.",
    "Exchanged numbers. Planning to meet again next month for a deeper dive.",
    "They recommended three specific resources. Already started on the first one.",
    "Their experience mirrors our project. Useful validation of our approach.",
    "Conversation went on for 2 hours. Covered way more ground than expected.",
    "They offered to intro me to someone who could help with the job search.",
    "Completely changed my mind on this. Their arguments were well-reasoned.",
    "Planning to collaborate on a small side project. Scoping meeting next week.",
    "They know the London tech scene really well. Great contact for opportunities.",
    "Took a photo of their whiteboard diagram. Need to redraw it properly.",
    "They're speaking at the next meetup. Will attend to continue the discussion.",
    "Added their blog to my RSS reader. They write about similar problems.",
  ];

  const peopleTags = [
    ["friends", "social"],
    ["colleague", "work"],
    ["mentor", "career"],
    ["family", "personal"],
    ["neighbor", "local"],
    ["gym-buddy", "fitness"],
    ["study-group", "learning"],
    ["meetup", "networking"],
    ["conference", "professional"],
    ["online-friend", "community"],
    ["flatmate", "housing"],
    ["professor", "academic"],
    ["recruiter", "job-search"],
    ["barber", "local-service"],
    ["doctor", "health"],
    ["language-partner", "learning"],
    ["climbing-partner", "sports"],
    ["book-club", "reading"],
    ["hackathon-team", "events"],
    ["coworker", "daily"],
    ["ex-colleague", "network"],
    ["startup-founder", "entrepreneurship"],
    ["open-source", "community"],
    ["podcast-guest", "media"],
  ];

  // â”€â”€ PREFERENCES â”€â”€
  const prefDomains = [
    "editor setup",
    "terminal config",
    "browser choice",
    "OS preference",
    "keyboard layout",
    "mouse ergonomics",
    "monitor arrangement",
    "desk organization",
    "chair settings",
    "lighting setup",
    "audio gear",
    "notebook brand",
    "pen choice",
    "bag selection",
    "coffee ritual",
    "tea preference",
    "water bottle",
    "headphone choice",
    "phone setup",
    "watch preference",
    "wallet style",
    "shoe rotation",
    "jacket system",
    "backpack loadout",
    "reading format",
    "writing tool",
    "calendar system",
    "communication style",
    "meeting format",
    "email workflow",
    "notification rules",
    "file naming",
    "password manager",
    "backup strategy",
    "photo workflow",
    "music setup",
    "podcast app",
    "RSS reader",
    "bookmark system",
    "screenshot tool",
    "clipboard manager",
    "window manager",
    "launcher app",
    "font choice",
    "color scheme",
    "icon set",
    "dock layout",
    "menu bar items",
    "git aliases",
    "shell prompt",
    "dotfiles approach",
    "extension curation",
  ];

  const prefDescriptions = [
    "daily ritual",
    "strong opinion",
    "recent switch",
    "long-standing habit",
    "workflow optimization",
    "comfort choice",
    "minimalism decision",
    "aesthetic preference",
    "ergonomic fix",
    "seasonal variation",
    "travel adaptation",
    "budget pick",
    "upgrade planned",
    "controversial take",
    "hard-won lesson",
    "default kept",
    "custom configuration",
    "streamlined setup",
    "intentional constraint",
  ];

  const prefDetails = [
    "Tried alternatives but always come back to this. It fits how my brain works.",
    "Changed this recently and noticed immediate improvement in daily workflow.",
    "Controversial opinion but tested extensively. This works better for my use case.",
    "Spent way too long researching this. The simple option was the best all along.",
    "This habit took 3 weeks to build but now it's completely automatic.",
    "Seasonal adjustment that makes a huge difference between summer and winter.",
    "The ergonomic version costs 3x more but prevents the RSI issues I was developing.",
    "Minimalist choice â€” fewer options means fewer decisions means more energy for real work.",
    "Function over form, always. The ugly option that works beats the pretty one that doesn't.",
    "One of those things where the default is fine. No need to optimize everything.",
    "Night and day difference after making this change. Wish I'd done it years ago.",
    "Budget option that performs 90% as well as the premium alternative.",
    "Intentionally limiting this to reduce decision fatigue and screen time.",
    "Picked this up from a colleague and it stuck. Simple but effective.",
    "The 80/20 rule applies here. Good enough is genuinely good enough.",
    "Defaults are someone else's opinion. Changed this to match how I actually work.",
    "Took a week to adjust but now the old way feels impossibly slow.",
    "This is the kind of thing that sounds trivial but compounds over months.",
  ];

  const prefTags = [
    ["editor", "dx"],
    ["terminal", "cli"],
    ["browser", "web"],
    ["macos", "os"],
    ["keyboard", "ergonomics"],
    ["mouse", "ergonomics"],
    ["monitor", "hardware"],
    ["desk", "workspace"],
    ["chair", "ergonomics"],
    ["lighting", "workspace"],
    ["audio", "hardware"],
    ["stationery", "analog"],
    ["coffee", "ritual"],
    ["tea", "ritual"],
    ["hydration", "health"],
    ["headphones", "audio"],
    ["phone", "digital-wellness"],
    ["watch", "minimalism"],
    ["fashion", "minimalism"],
    ["bags", "edc"],
    ["reading", "habits"],
    ["writing", "productivity"],
    ["calendar", "time-management"],
    ["communication", "async"],
    ["email", "productivity"],
    ["notifications", "focus"],
    ["file-org", "system"],
    ["security", "passwords"],
    ["backup", "data"],
    ["photography", "creative"],
    ["music", "enjoyment"],
    ["podcasts", "learning"],
    ["rss", "information"],
    ["shortcuts", "efficiency"],
    ["fonts", "aesthetics"],
    ["themes", "aesthetics"],
    ["dotfiles", "config"],
    ["shell", "cli"],
    ["git-config", "workflow"],
    ["window-mgmt", "productivity"],
  ];

  // â”€â”€ HEALTH â”€â”€
  const healthActivities = [
    "deadlift",
    "squat",
    "bench press",
    "overhead press",
    "barbell row",
    "pull-up",
    "dip",
    "push-up",
    "plank",
    "farmer's walk",
    "5K run",
    "10K run",
    "cycling",
    "swimming",
    "rowing machine",
    "hiking",
    "yoga flow",
    "stretching",
    "foam rolling",
    "mobility drill",
    "walking",
    "bouldering",
    "jump rope",
    "kettlebell swing",
    "box jump",
    "leg press",
    "lunges",
    "calf raises",
    "face pulls",
    "lateral raises",
    "tricep extensions",
    "bicep curls",
    "hip thrusts",
    "Romanian deadlift",
    "front squat",
    "goblet squat",
    "Turkish get-up",
    "sled push",
    "battle ropes",
    "medicine ball slams",
    "burpees",
    "mountain climbers",
  ];

  const healthTopics = [
    "new PR achieved",
    "form correction needed",
    "recovery protocol update",
    "program adjustment",
    "plateau breakthrough",
    "injury prevention tip",
    "warm-up modification",
    "cool-down addition",
    "nutrition timing experiment",
    "supplement research",
    "sleep quality impact",
    "HRV data correlation",
    "heart rate zone analysis",
    "volume progression",
    "deload week reflection",
    "progressive overload milestone",
    "tempo change results",
    "grip variation test",
    "stance width experiment",
    "breathing cue discovery",
    "mental focus technique",
    "mobility prerequisite identified",
    "flexibility milestone",
    "body composition check",
    "resting heart rate trend",
    "VO2 max estimate",
    "body weight tracking",
    "hydration experiment",
    "caffeine timing test",
    "pre-workout comparison",
  ];

  const healthNotes = [
    "Tracked over 4 weeks. Clear correlation between sleep quality and next-day performance.",
    "Physio confirmed form is good. Discomfort was muscle weakness, not structural injury.",
    "Deload every 4th week prevents burnout. Ego says no, body says yes.",
    "This accessory movement fixed the sticking point in the main compound lift.",
    "Morning sessions produce better results. Hormones and energy levels peak earlier.",
    "Even mild dehydration causes measurable performance drop. Pre-loading water helps.",
    "Progressive overload of 2.5kg/week is sustainable. Bigger jumps cause form breakdown.",
    "Filming from the side revealed a form issue I couldn't feel during the movement.",
    "Switching from 5x5 to 3x8 for hypertrophy. Strength phase resumes in 6 weeks.",
    "Active recovery (light walking, stretching) beats complete rest for next-session performance.",
    "80/20 rule: zone 2 cardio for 80% of sessions, high intensity for the remaining 20%.",
    "Post-workout protein within 2 hours. Whey shake immediately, real food within the window.",
    "New shoes changed everything. Flat soles for lifting, cushioned for running. Don't mix.",
    "Grip strength was the limiting factor. Dead hangs and farmer's walks as daily practice.",
    "5 minutes of meditation before training improves mind-muscle connection noticeably.",
  ];

  const healthTags = [
    ["strength", "lifting"],
    ["cardio", "running"],
    ["flexibility", "mobility"],
    ["nutrition", "diet"],
    ["sleep", "recovery"],
    ["mental-health", "meditation"],
    ["injury", "rehab"],
    ["supplements", "nutrition"],
    ["gym", "routine"],
    ["bodyweight", "calisthenics"],
    ["swimming", "low-impact"],
    ["cycling", "endurance"],
    ["climbing", "grip-strength"],
    ["yoga", "flexibility"],
    ["walking", "daily"],
    ["hiit", "conditioning"],
    ["tracking", "metrics"],
    ["physio", "rehab"],
    ["hydration", "basics"],
    ["posture", "ergonomics"],
  ];

  // â”€â”€ TRAVEL â”€â”€
  const cities = [
    "Tokyo",
    "Seoul",
    "Taipei",
    "Bangkok",
    "Singapore",
    "Kuala Lumpur",
    "Ho Chi Minh City",
    "Bali",
    "Melbourne",
    "Auckland",
    "London",
    "Paris",
    "Berlin",
    "Amsterdam",
    "Copenhagen",
    "Stockholm",
    "Oslo",
    "Helsinki",
    "Lisbon",
    "Porto",
    "Barcelona",
    "Madrid",
    "Rome",
    "Florence",
    "Milan",
    "Vienna",
    "Prague",
    "Budapest",
    "Krakow",
    "Warsaw",
    "Tallinn",
    "Riga",
    "Dublin",
    "Edinburgh",
    "Brussels",
    "Zurich",
    "Geneva",
    "Munich",
    "Hamburg",
    "New York",
    "San Francisco",
    "Los Angeles",
    "Chicago",
    "Austin",
    "Seattle",
    "Portland",
    "Denver",
    "Boston",
    "Miami",
    "Montreal",
    "Toronto",
    "Vancouver",
    "Mexico City",
    "Buenos Aires",
    "Sao Paulo",
    "Medellin",
    "Lima",
    "Marrakech",
    "Cape Town",
    "Nairobi",
    "Cairo",
    "Accra",
    "Dubai",
    "Istanbul",
    "Tel Aviv",
    "Tbilisi",
    "Yerevan",
    "Reykjavik",
    "Dubrovnik",
    "Split",
    "Athens",
    "Thessaloniki",
    "Hanoi",
    "Chiang Mai",
    "Osaka",
    "Kyoto",
    "Fukuoka",
    "Busan",
    "Penang",
    "Yogyakarta",
    "Phnom Penh",
    "Luang Prabang",
  ];

  const travelAspects = [
    "best neighborhood",
    "transport tips",
    "food scene",
    "coworking spaces",
    "hidden gem restaurant",
    "must-visit spot",
    "tourist trap warning",
    "budget tips",
    "safety notes",
    "best season",
    "local customs",
    "language tips",
    "SIM card options",
    "airport transfer",
    "day trip idea",
    "nightlife guide",
    "coffee shop picks",
    "street food ranking",
    "museum recommendation",
    "park or nature",
    "shopping district",
    "rooftop bar",
    "cultural etiquette",
    "tipping norms",
    "WiFi situation",
    "power adapter",
    "weather prep",
    "visa info",
    "flight route from London",
    "accommodation advice",
    "walking route",
    "cycling infrastructure",
  ];

  const travelNotes = [
    "Visited last spring â€” exceeded expectations. Would go back for a longer stay.",
    "Locals were incredibly friendly. A few words in the local language goes a long way.",
    "Way cheaper than expected. Daily budget was half of what I planned.",
    "More expensive than I thought. Worth it short-term but not for a long stay.",
    "Public transport is excellent. No need for taxis or car rental.",
    "Walkable city center. Got 20k steps daily just exploring neighborhoods.",
    "Food was the highlight. Incredible meals for under Â£10 each.",
    "Digital nomad community is thriving. Easy to meet people at coworking spaces.",
    "Off-season was the right call. Fewer tourists, lower prices, decent weather.",
    "The Airbnb was way better than the hotel next door. Always compare both.",
    "Jet lag hit harder going eastbound. Need to pre-adjust sleep 3 days before.",
    "At least 5 days needed to get a real feel for this city.",
    "Guided walking tour on day one was the best investment. Context changes everything.",
    "Night markets are the real attraction. Skip the tourist restaurants.",
    "Golden hour photography here is incredible. Bring a proper camera.",
  ];

  const travelTags = [
    ["japan", "east-asia"],
    ["south-korea", "east-asia"],
    ["taiwan", "east-asia"],
    ["thailand", "southeast-asia"],
    ["singapore", "southeast-asia"],
    ["malaysia", "southeast-asia"],
    ["vietnam", "southeast-asia"],
    ["indonesia", "southeast-asia"],
    ["australia", "oceania"],
    ["new-zealand", "oceania"],
    ["uk", "europe"],
    ["france", "europe"],
    ["germany", "europe"],
    ["netherlands", "europe"],
    ["denmark", "scandinavia"],
    ["sweden", "scandinavia"],
    ["norway", "scandinavia"],
    ["finland", "scandinavia"],
    ["portugal", "europe"],
    ["spain", "europe"],
    ["italy", "europe"],
    ["austria", "europe"],
    ["czech-republic", "europe"],
    ["hungary", "europe"],
    ["poland", "europe"],
    ["baltics", "europe"],
    ["ireland", "europe"],
    ["scotland", "europe"],
    ["belgium", "europe"],
    ["switzerland", "europe"],
    ["usa-east", "north-america"],
    ["usa-west", "north-america"],
    ["canada", "north-america"],
    ["mexico", "latin-america"],
    ["argentina", "south-america"],
    ["brazil", "south-america"],
    ["colombia", "south-america"],
    ["peru", "south-america"],
    ["morocco", "africa"],
    ["south-africa", "africa"],
    ["kenya", "africa"],
    ["egypt", "africa"],
    ["ghana", "west-africa"],
    ["uae", "middle-east"],
    ["turkey", "eurasia"],
    ["israel", "middle-east"],
    ["georgia", "caucasus"],
    ["iceland", "europe"],
    ["croatia", "europe"],
    ["greece", "europe"],
    ["digital-nomad", "remote-work"],
    ["backpacking", "budget-travel"],
    ["food-travel", "culinary"],
    ["coworking-abroad", "remote-work"],
  ];

  // â”€â”€ LEARNING â”€â”€
  const learningSubjects = [
    "distributed consensus",
    "compiler optimization",
    "OS scheduling",
    "TCP congestion control",
    "B-tree internals",
    "graph coloring",
    "category theory functors",
    "dependent types",
    "Shannon entropy",
    "P vs NP",
    "finite automata",
    "model checking",
    "elliptic curve crypto",
    "gradient descent",
    "transformer architecture",
    "Q-learning",
    "attention mechanisms",
    "convolutional networks",
    "inverse kinematics",
    "quantum gates",
    "lambda calculus",
    "Prolog unification",
    "actor model concurrency",
    "memory allocators",
    "RTOS scheduling",
    "Fourier transforms",
    "eigenvalue decomposition",
    "Bayesian inference",
    "hypothesis testing",
    "convex optimization",
    "Nash equilibrium",
    "expected utility theory",
    "inverted indexes",
    "association rules",
    "RDF triples",
    "OWL ontologies",
    "SPARQL queries",
    "JSON-LD contexts",
    "REST constraints",
    "protocol buffers",
    "language grammars",
    "plugin architectures",
    "property-based testing",
    "binary search pitfalls",
    "cache-oblivious algorithms",
    "threat modeling",
    "differential privacy",
    "chaos engineering",
    "SLO/SLI/SLA definitions",
    "platform team topology",
  ];

  const learningFormats = [
    "read a paper on",
    "watched a lecture about",
    "completed course module on",
    "worked through exercises on",
    "attended workshop on",
    "read book chapter about",
    "implemented toy version of",
    "study group discussed",
    "took notes on",
    "wrote blog draft about",
    "practiced problems in",
    "reviewed fundamentals of",
    "explored new perspective on",
    "compared approaches to",
    "debugged issue related to",
    "studied history of",
    "analyzed trade-offs in",
    "sketched diagrams for",
    "built mental model for",
    "created flashcards on",
    "taught concept of",
    "pair-studied",
    "whiteboarded solutions for",
    "re-derived proofs in",
  ];

  const learningInsights = [
    "Mental model finally clicked. It's about managing trade-offs, not finding the perfect answer.",
    "Connects directly to vmem's architecture. The theoretical foundation validates our approach.",
    "More nuanced than I thought. Edge cases are where the real complexity lives.",
    "Textbook oversimplifies. Real implementation has constraints the theory ignores.",
    "Drawing diagrams was the breakthrough. Visual representation made it concrete.",
    "Historical context explains why the current approach exists. It's not arbitrary.",
    "One of those topics where learning more reveals how much more there is to know.",
    "Found a connection to something from 3 months ago. The pieces are coming together.",
    "Practical applications more immediate than expected. Can apply this to current sprint.",
    "Need to revisit in a few weeks. First-pass understanding but not deep comprehension.",
    "Exercises were harder than the reading suggested. Doing is different from knowing.",
    "Study group revealed gaps in my understanding. Good to be challenged on assumptions.",
    "Paper was dense but core idea is elegant. Summarized in 3 sentences for future reference.",
    "This contradicts what I previously believed. Updated mental model based on evidence.",
    "Implemented simplified version to test understanding. Found 2 misconceptions in the process.",
  ];

  const learningTags = [
    ["distributed-systems", "theory"],
    ["compilers", "cs-fundamentals"],
    ["operating-systems", "low-level"],
    ["networking", "protocols"],
    ["database-theory", "storage"],
    ["graph-theory", "math"],
    ["category-theory", "math"],
    ["type-theory", "plt"],
    ["information-theory", "math"],
    ["complexity-theory", "cs-fundamentals"],
    ["automata", "cs-fundamentals"],
    ["formal-methods", "verification"],
    ["cryptography", "security"],
    ["ml-fundamentals", "ai"],
    ["deep-learning", "ai"],
    ["reinforcement-learning", "ai"],
    ["nlp", "ai"],
    ["computer-vision", "ai"],
    ["functional-programming", "paradigms"],
    ["concurrency", "systems"],
    ["systems-programming", "low-level"],
    ["signal-processing", "math"],
    ["linear-algebra", "math"],
    ["probability", "statistics"],
    ["optimization", "math"],
    ["game-theory", "decision-making"],
    ["information-retrieval", "search"],
    ["knowledge-graphs", "semantic-web"],
    ["api-design", "engineering"],
    ["testing", "quality"],
    ["performance-engineering", "optimization"],
    ["security-engineering", "infosec"],
    ["reliability", "sre"],
    ["platform-engineering", "devops"],
    ["paper-reading", "research"],
    ["course-notes", "structured-learning"],
    ["self-study", "independent"],
    ["spaced-repetition", "memory-techniques"],
  ];

  // â”€â”€ FINANCE â”€â”€
  const financeTopics = [
    "ISA contribution plan",
    "pension review call",
    "tax return prep",
    "monthly budget review",
    "subscription audit",
    "insurance renewal quote",
    "credit score check",
    "emergency fund progress",
    "portfolio rebalance",
    "expense categorization",
    "rent review discussion",
    "utility comparison",
    "phone plan negotiation",
    "travel insurance research",
    "student loan check",
    "side income declaration",
    "Gift Aid registration",
    "freelance invoice tracking",
    "savings milestone",
    "council tax bill",
    "broadband switch",
    "car insurance quote",
    "energy tariff comparison",
    "cashback redemption",
    "Wise transfer setup",
    "NI contribution check",
    "CGT allowance usage",
    "dividend reinvestment",
    "premium bonds draw",
    "SIPP contribution review",
    "mortgage calculator research",
    "shared expense splitting",
    "charitable donation plan",
    "tax-loss harvesting",
  ];

  const financeNotes = [
    "Saved Â£240/year switching providers. Same coverage, different name. Always shop around at renewal.",
    "Automated transfer on payday. Can't spend what doesn't land in the current account.",
    "Spreadsheet of 5 options. Winner was obvious once all hidden fees were included.",
    "Tax-efficient approach saves ~Â£600/year. Worth the 30 minutes of annual paperwork.",
    "Emergency fund at 3 months of expenses. Excess now goes to ISA for better returns.",
    "Compound interest visualizer was eye-opening. Starting early matters more than the amount.",
    "Negotiated 15% reduction by threatening to leave. They always have a retention offer.",
    "Quarterly audit found 3 unused subscriptions. Â£45/month saved by cancelling.",
    "Fixed rate locked in before the increase. Research was intentional, timing was lucky.",
    "Direct debit + paperless billing saves 8% on utility bills. Set and forget.",
  ];

  const financeTags = [
    ["investing", "isa"],
    ["pension", "retirement"],
    ["tax", "hmrc"],
    ["budgeting", "monthly"],
    ["subscriptions", "recurring"],
    ["insurance", "protection"],
    ["credit", "banking"],
    ["emergency-fund", "savings"],
    ["portfolio", "investing"],
    ["expenses", "tracking"],
    ["rent", "housing"],
    ["utilities", "bills"],
    ["mobile", "contract"],
    ["travel-insurance", "protection"],
    ["student-loan", "debt"],
    ["freelance", "self-employed"],
    ["giving", "charity"],
    ["invoicing", "business"],
    ["savings-goal", "planning"],
    ["council-tax", "local"],
    ["broadband", "internet"],
    ["energy", "bills"],
    ["cashback", "rewards"],
    ["forex", "transfers"],
  ];

  // â”€â”€ COOKING â”€â”€
  const cookingItems = [
    "pasta carbonara",
    "chicken tikka masala",
    "pad thai",
    "beef stew",
    "mushroom risotto",
    "fish tacos",
    "homemade ramen",
    "shepherd's pie",
    "shakshuka",
    "butter chicken",
    "bibimbap",
    "falafel wraps",
    "pho bo",
    "gnocchi",
    "seafood paella",
    "pork dumplings",
    "lasagna layers",
    "burrito bowl",
    "tom kha gai",
    "moussaka",
    "katsu curry",
    "cacio e pepe",
    "aloo gobi",
    "jollof rice",
    "french onion soup",
    "eggs benedict",
    "banh mi",
    "homemade naan",
    "focaccia",
    "croissants",
    "cinnamon rolls",
    "banana bread",
    "tiramisu",
    "panna cotta",
    "chocolate mousse",
    "lemon tart",
    "granola batch",
    "energy balls",
    "overnight oats",
    "smoothie bowl",
    "kimchi fermentation",
    "pickled vegetables",
    "hot sauce blend",
    "curry paste",
    "bone broth",
    "pizza dough",
    "flatbread",
    "cornbread",
  ];

  const cookingNotes = [
    "The key is patience. Low and slow produces fundamentally different results.",
    "Restaurant quality at home â€” just season properly. Salt at every stage.",
    "Mise en place changed everything. Prep all ingredients before heat touches pan.",
    "Cheap version is 90% as good. Save premium ingredients for special occasions.",
    "Scales well for meal prep. Makes 6 portions, freezes and reheats perfectly.",
    "Technique matters more than recipe. Understand why, then you can improvise.",
    "Found this at the Asian grocery for half the supermarket price.",
    "Homemade takes 30 min and tastes 10x better than store-bought.",
    "Secret ingredient is acid. Lemon squeeze or vinegar splash at the end lifts everything.",
    "Tested 4 recipes. This one has the best effort-to-deliciousness ratio.",
    "Sunday batch cooking saves 5 hours during the work week.",
    "Fresh herbs at the end make it taste like a completely different dish.",
    "Temperature control is everything. Get an instant-read thermometer.",
    "Leftover version is actually better. Flavors meld overnight in the fridge.",
    "Toasting spices in dry pan first releases oils and transforms the flavor.",
  ];

  const cookingTags = [
    ["italian", "pasta"],
    ["indian", "curry"],
    ["thai", "stir-fry"],
    ["british", "comfort-food"],
    ["japanese", "umami"],
    ["mexican", "spicy"],
    ["korean", "fermented"],
    ["middle-eastern", "mezze"],
    ["vietnamese", "broth"],
    ["french", "technique"],
    ["baking", "bread"],
    ["baking", "pastry"],
    ["baking", "dessert"],
    ["meal-prep", "batch-cooking"],
    ["breakfast", "quick"],
    ["snacks", "healthy"],
    ["fermentation", "preservation"],
    ["sauces", "condiments"],
    ["soups", "comfort"],
    ["salads", "fresh"],
    ["grilling", "outdoor"],
    ["vegetarian", "plant-based"],
    ["seafood", "fish"],
  ];

  // â”€â”€ ENTERTAINMENT â”€â”€
  const mediaTypes = [
    "film",
    "TV series",
    "album",
    "podcast",
    "book",
    "video game",
    "documentary",
    "anime",
    "YouTube channel",
    "board game",
    "graphic novel",
    "audiobook",
    "live show",
    "exhibition",
    "standup special",
    "short film",
    "web series",
    "music video",
  ];

  const mediaItems = [
    "Eternal Sunshine of the Spotless Mind",
    "Breaking Bad",
    "OK Computer",
    "99% Invisible",
    "Dune",
    "The Last of Us",
    "Planet Earth III",
    "Cowboy Bebop",
    "Veritasium",
    "Catan",
    "Saga",
    "Sapiens",
    "Hamilton live",
    "Immersive Van Gogh",
    "Bo Burnham Inside",
    "Blade Runner 2049",
    "The Wire",
    "Kid A",
    "Radiolab",
    "Neuromancer",
    "Elden Ring",
    "Blue Planet II",
    "Attack on Titan",
    "3Blue1Brown",
    "Pandemic Legacy",
    "Watchmen",
    "Hitchhiker's Guide",
    "Cirque du Soleil",
    "teamLab Borderless",
    "Hannah Gadsby Nanette",
    "Interstellar",
    "Better Call Saul",
    "In Rainbows",
    "Hardcore History",
    "Blood Meridian",
    "Celeste",
    "Neon Genesis Evangelion",
    "Technology Connections",
    "Gloomhaven",
    "Maus",
    "Meditations",
    "Sleep No More",
    "Parasite",
    "Succession",
    "Blonde",
    "Darknet Diaries",
    "Piranesi",
    "Hades",
    "My Octopus Teacher",
    "Mob Psycho 100",
    "Tom Scott",
    "Wingspan game",
    "Persepolis",
    "Atomic Habits",
    "Past Lives",
    "Shogun",
    "The Bear",
    "Severance",
    "Andor",
    "Slow Horses",
    "Project Hail Mary",
    "Slay the Spire",
    "Balatro",
    "Hollow Knight",
    "Stardew Valley",
    "Arrival",
    "Dark",
    "Klara and the Sun",
    "Everything Everywhere",
    "The Grand Budapest Hotel",
    "CoRecursive podcast",
    "Good Kid MAAD City",
    "Currents by Tame Impala",
    "Igor by Tyler",
    "Discovery by Daft Punk",
  ];

  const mediaNotes = [
    "Absolute masterpiece. Changes how you see the medium entirely.",
    "Slow start but stick with it. The payoff in the second half is incredible.",
    "Perfect for late-night sessions. The atmosphere is unmatched.",
    "Three different people recommended this. They were all right.",
    "Didn't expect to like this genre but it completely won me over.",
    "The writing is exceptional. Every word feels intentional and earned.",
    "Revisited after 5 years and got completely different things from it.",
    "Short enough to finish in one sitting. Dense enough to think about for weeks.",
    "Production quality is insane for what's essentially an indie project.",
    "This ruined the genre for me because nothing else reaches this level.",
    "Makes complex topics accessible without dumbing them down. Rare talent.",
    "Emotional impact snuck up on me. Wasn't expecting to be moved this deeply.",
    "Great background material that enhances focus without being distracting.",
    "Controversial take: this is overrated. Good, not the masterpiece people claim.",
    "Life-changing recommendation. Directly influenced how I approach work.",
  ];

  const entertainmentTags = [
    ["film", "drama"],
    ["film", "sci-fi"],
    ["film", "animation"],
    ["tv", "thriller"],
    ["tv", "comedy"],
    ["tv", "drama"],
    ["music", "rock"],
    ["music", "hip-hop"],
    ["music", "electronic"],
    ["music", "indie"],
    ["podcast", "tech"],
    ["podcast", "storytelling"],
    ["podcast", "science"],
    ["book", "fiction"],
    ["book", "non-fiction"],
    ["book", "sci-fi"],
    ["game", "roguelike"],
    ["game", "rpg"],
    ["game", "puzzle"],
    ["game", "strategy"],
    ["game", "indie"],
    ["documentary", "nature"],
    ["documentary", "social"],
    ["anime", "action"],
    ["anime", "slice-of-life"],
    ["youtube", "education"],
    ["youtube", "tech"],
    ["board-game", "strategy"],
    ["board-game", "cooperative"],
    ["live-show", "theater"],
    ["live-show", "music"],
    ["exhibition", "art"],
    ["standup", "comedy"],
    ["graphic-novel", "literary"],
  ];

  // â”€â”€ GENERATOR â”€â”€
  type MemType = "profile" | "episodic" | "knowledge";

  interface CategoryGen {
    weight: number;
    generate: (i: number) => {
      title: string;
      content: string;
      type: MemType;
      tags: string[];
    };
  }

  const cats: CategoryGen[] = [
    // TECH â€” 25%
    {
      weight: 25,
      generate: (i) => {
        const subj = techSubjects[i % techSubjects.length];
        const act =
          techActions[
            (i * 7 + ((i / techSubjects.length) | 0) * 3 + 3) %
              techActions.length
          ];
        const det =
          techDetails[
            (i * 13 + ((i / techSubjects.length) | 0) * 5 + 7) %
              techDetails.length
          ];
        const tags =
          techTags[
            (i * 11 + ((i / techSubjects.length) | 0) * 7) % techTags.length
          ];
        return {
          title: `${subj}: ${act}`,
          content: det,
          type: "knowledge",
          tags: ["engineering", ...tags],
        };
      },
    },
    // WORK â€” 16%
    {
      weight: 16,
      generate: (i) => {
        const ctx = workContexts[i % workContexts.length];
        const topic =
          workTopics[
            (i * 11 + ((i / workContexts.length) | 0) * 7 + 2) %
              workTopics.length
          ];
        const out =
          workOutcomes[
            (i * 7 + ((i / workContexts.length) | 0) * 3 + 4) %
              workOutcomes.length
          ];
        const tags =
          workTags[
            (i * 5 + ((i / workContexts.length) | 0) * 11 + 2) % workTags.length
          ];
        return {
          title: `${ctx}: ${topic}`,
          content: out,
          type: "episodic",
          tags: ["work", ...tags],
        };
      },
    },
    // PEOPLE â€” 12%
    {
      weight: 12,
      generate: (i) => {
        const name = personNames[i % personNames.length];
        const ctx =
          personContexts[
            (i * 5 + ((i / personNames.length) | 0) * 3 + 1) %
              personContexts.length
          ];
        const topic =
          personTopics[
            (i * 7 + ((i / personNames.length) | 0) * 11 + 3) %
              personTopics.length
          ];
        const det =
          personDetails[
            (i * 11 + ((i / personNames.length) | 0) * 7 + 2) %
              personDetails.length
          ];
        const tags =
          peopleTags[
            (i * 3 + ((i / personNames.length) | 0) * 5 + 1) % peopleTags.length
          ];
        return {
          title: `${name} ${ctx}`,
          content: `${topic}. ${det}`,
          type: "episodic",
          tags: ["social", ...tags],
        };
      },
    },
    // PREFERENCES â€” 10%
    {
      weight: 10,
      generate: (i) => {
        const dom = prefDomains[i % prefDomains.length];
        const desc =
          prefDescriptions[
            (i * 3 + ((i / prefDomains.length) | 0) * 7 + 1) %
              prefDescriptions.length
          ];
        const det =
          prefDetails[
            (i * 7 + ((i / prefDomains.length) | 0) * 11 + 2) %
              prefDetails.length
          ];
        const tags =
          prefTags[
            (i * 5 + ((i / prefDomains.length) | 0) * 3 + 1) % prefTags.length
          ];
        return {
          title: `${dom}: ${desc}`,
          content: det,
          type: "profile",
          tags: ["personal", ...tags],
        };
      },
    },
    // HEALTH â€” 8%
    {
      weight: 8,
      generate: (i) => {
        const act = healthActivities[i % healthActivities.length];
        const topic =
          healthTopics[
            (i * 5 + ((i / healthActivities.length) | 0) * 7 + 2) %
              healthTopics.length
          ];
        const note =
          healthNotes[
            (i * 7 + ((i / healthActivities.length) | 0) * 11 + 3) %
              healthNotes.length
          ];
        const tags =
          healthTags[
            (i * 3 + ((i / healthActivities.length) | 0) * 5 + 1) %
              healthTags.length
          ];
        const type: MemType = i % 3 === 0 ? "profile" : "episodic";
        return {
          title: `${act}: ${topic}`,
          content: note,
          type,
          tags: ["wellness", ...tags],
        };
      },
    },
    // TRAVEL â€” 10%
    {
      weight: 10,
      generate: (i) => {
        const city = cities[i % cities.length];
        const aspect =
          travelAspects[
            (i * 7 + ((i / cities.length) | 0) * 3 + 2) % travelAspects.length
          ];
        const note =
          travelNotes[
            (i * 11 + ((i / cities.length) | 0) * 7 + 3) % travelNotes.length
          ];
        const tags =
          travelTags[
            (i * 5 + ((i / cities.length) | 0) * 3) % travelTags.length
          ];
        const type: MemType = i % 2 === 0 ? "episodic" : "knowledge";
        return {
          title: `${city}: ${aspect}`,
          content: note,
          type,
          tags: ["travel", ...tags],
        };
      },
    },
    // LEARNING â€” 7%
    {
      weight: 7,
      generate: (i) => {
        const fmt = learningFormats[i % learningFormats.length];
        const subj =
          learningSubjects[
            (i * 7 + ((i / learningFormats.length) | 0) * 5 + 3) %
              learningSubjects.length
          ];
        const ins =
          learningInsights[
            (i * 11 + ((i / learningFormats.length) | 0) * 7 + 2) %
              learningInsights.length
          ];
        const tags =
          learningTags[
            (i * 3 + ((i / learningFormats.length) | 0) * 11 + 1) %
              learningTags.length
          ];
        return {
          title: `${fmt} ${subj}`,
          content: ins,
          type: "knowledge",
          tags: ["learning", ...tags],
        };
      },
    },
    // FINANCE â€” 4%
    {
      weight: 4,
      generate: (i) => {
        const topic = financeTopics[i % financeTopics.length];
        const note =
          financeNotes[
            (i * 7 + ((i / financeTopics.length) | 0) * 3 + 3) %
              financeNotes.length
          ];
        const tags =
          financeTags[
            (i * 5 + ((i / financeTopics.length) | 0) * 7 + 1) %
              financeTags.length
          ];
        return {
          title: topic,
          content: note,
          type: "profile",
          tags: ["finance", ...tags],
        };
      },
    },
    // COOKING â€” 4%
    {
      weight: 4,
      generate: (i) => {
        const dish = cookingItems[i % cookingItems.length];
        const note =
          cookingNotes[
            (i * 7 + ((i / cookingItems.length) | 0) * 3 + 3) %
              cookingNotes.length
          ];
        const tags =
          cookingTags[
            (i * 5 + ((i / cookingItems.length) | 0) * 7 + 1) %
              cookingTags.length
          ];
        return {
          title: `${dish}: recipe notes`,
          content: note,
          type: "knowledge",
          tags: ["food", ...tags],
        };
      },
    },
    // ENTERTAINMENT â€” 4%
    {
      weight: 4,
      generate: (i) => {
        const mtype = mediaTypes[(i * 3 + 1) % mediaTypes.length];
        const item = mediaItems[i % mediaItems.length];
        const note =
          mediaNotes[
            (i * 7 + ((i / mediaItems.length) | 0) * 3 + 3) % mediaNotes.length
          ];
        const tags =
          entertainmentTags[
            (i * 5 + ((i / mediaItems.length) | 0) * 7 + 1) %
              entertainmentTags.length
          ];
        const type: MemType = i % 3 === 0 ? "profile" : "episodic";
        return {
          title: `${mtype}: ${item}`,
          content: note,
          type,
          tags: ["media", ...tags],
        };
      },
    },
  ];

  const totalWeight = cats.reduce((sum, c) => sum + c.weight, 0);
  const result: ReturnType<typeof mem>[] = [];
  const usedTitles = new Set<string>();

  for (const cat of cats) {
    const catCount = Math.round((cat.weight / totalWeight) * count);
    let idx = 0;

    for (let i = 0; i < catCount; i++) {
      let generated = cat.generate(idx);
      let attempts = 0;

      // Skip duplicates by advancing index
      while (usedTitles.has(generated.title) && attempts < 100) {
        idx++;
        generated = cat.generate(idx);
        attempts++;
      }

      // Last resort: append a numeric suffix
      if (usedTitles.has(generated.title)) {
        generated = { ...generated, title: `${generated.title} (note ${i})` };
      }

      usedTitles.add(generated.title);
      const status: "active" | "pinned" = rng() < 0.06 ? "pinned" : "active";
      result.push(
        mem(
          generated.title,
          generated.content,
          generated.type,
          generated.tags,
          status,
        ),
      );
      idx++;
    }
  }

  return result;
}

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
  rel(0, 5, "RSCs can't use hooks â€” strict mode flags those violations"),
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
    "Alex prefers raw queries â€” same philosophy as Obsidian's local-first",
  ),
  rel(
    39,
    43,
    "Mom's kindle and Dad's Sunday calls â€” both need calendar reminders",
  ),
  rel(40, 31, "Jake from Vercel validated our RSC-first frontend decision"),
  rel(41, 44, "Prof. Chen's GNN ideas connect to Emma's DDIA recommendation"),
  rel(
    43,
    45,
    "Dad's Sunday calls and Tom's allergy checks â€” roommate/family care",
  ),
  rel(46, 48, "Dr. Park's ship-fast advice shaped mentor-guided MVP scope"),
  rel(48, 50, "Google recruiter wants the polished MVP Dr. Park recommended"),
  rel(47, 49, "study group discusses the distributed systems Alex debates"),
  rel(50, 52, "recruiter's TS focus motivates helping sister learn to code"),
  rel(51, 53, "TechHub founders and team dinner â€” same networking circle"),

  // --- Preferences cluster ---
  rel(
    54,
    63,
    "dark mode in VS Code and Vim keybindings â€” same editor config",
  ),
  rel(55, 67, "morning deep work blocks are reserved for weekend vmem coding"),
  rel(56, 61, "oat milk cortado fuels the lo-fi hip hop focus sessions"),
  rel(57, 63, "Keychron Q1 pairs with Vim keybindings for typing speed"),
  rel(58, 62, "print books and bullet notes â€” both physical info retention"),
  rel(59, 60, "Pomodoro sit/stand timer syncs with PR review focus blocks"),
  rel(64, 65, "batch Slack checks protect the 11pm-7am sleep window"),

  // --- Health cluster ---
  rel(68, 73, "5x5 deadlifts and 5K runs share the same morning gym slot"),
  rel(
    69,
    45,
    "shellfish allergy and Tom's â€” same EpiPen protocol at dinners",
  ),
  rel(
    70,
    76,
    "3L water goal suffers on the same busy meeting days as caffeine",
  ),
  rel(71, 75, "neck stretches prevent the same RSI that caused wrist pain"),
  rel(73, 77, "5K runs start at FitZone's 6am opening before crowds"),

  // --- Travel cluster ---
  rel(78, 80, "Fuunji ramen queue starts at Shinjuku â€” Suica card needed"),
  rel(
    79,
    81,
    "Berlin hot desk and Amsterdam bike lanes â€” EU remote work setup",
  ),
  rel(
    82,
    85,
    "Amsterdam cycling and Singapore hawker â€” both cheap local transit",
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
  rel(75, 71, "wrist exercises and neck stretches â€” same physio protocol"),
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

  ...generateBulkRelationships(),
];

function generateBulkRelationships() {
  const handcraftedCount = 257;
  const total = memories.length;
  const result: Array<{
    sourceId: string;
    targetId: string;
    reason: string;
  }> = [];

  let seed = 99;
  function rng() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  const reasons = [
    "related topic in same domain",
    "builds on the same foundational concept",
    "complementary perspectives on similar problem",
    "referenced in the same context",
    "learned around the same time period",
    "shares underlying technical pattern",
    "discovered through same research thread",
    "part of the same knowledge cluster",
    "connected through shared experience",
    "natural progression from earlier insight",
  ];

  for (let i = handcraftedCount; i < total; i++) {
    const numRels = 1 + Math.floor(rng() * 3);
    for (let r = 0; r < numRels; r++) {
      const windowSize = 30 + Math.floor(rng() * 70);
      const minTarget = Math.max(handcraftedCount, i - windowSize);
      const maxTarget = Math.min(total - 1, i + windowSize);
      const targetIdx = minTarget + Math.floor(rng() * (maxTarget - minTarget));
      if (targetIdx === i) continue;

      const source = memories[i];
      const target = memories[targetIdx];
      if (!source || !target) continue;

      result.push({
        sourceId: source.id,
        targetId: target.id,
        reason: reasons[Math.floor(rng() * reasons.length)],
      });
    }
  }

  return result;
}

export const fullMemories = memories;
export const fullRelationships = relationships;
export const handcraftedMemories = memories.slice(0, HANDCRAFTED_MEMORY_COUNT);

// Set<string> (not the crypto.randomUUID template-literal type) so it can be
// queried with the plain-string ids used by generateBulkRelationships.
const handcraftedMemoryIds = new Set<string>(
  handcraftedMemories.map((memory) => memory.id),
);

export const handcraftedRelationships = relationships.filter(
  (relationship) =>
    handcraftedMemoryIds.has(relationship.sourceId) &&
    handcraftedMemoryIds.has(relationship.targetId),
);
