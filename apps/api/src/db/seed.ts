import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { getDriver, ensureIndexes, closeDriver } from "./neo4j.js";
import { setupDatabase } from "./setup.js";
import crypto from "node:crypto";

const USER_ID = "user_3BmJ4t48rN2ZkglhnxOTUJSMpLC";

const SOURCES = [
  "chrome-extension",
  "chat",
  "manual",
  "api-import",
  "email-digest",
  "cli",
] as const;

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
  if (idx < 15) {
    createdAt = recentDate(7);
  } else if (idx < 35) {
    createdAt = recentDate(30);
  } else {
    createdAt = randomDate(90);
  }

  const updatedAt = new Date(
    new Date(createdAt).getTime() + Math.random() * 7 * 86400000,
  ).toISOString();
  return {
    id: crypto.randomUUID(),
    userId: USER_ID,
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
];

function buildEvents() {
  const events: Array<{
    eventId: string;
    memoryId: string;
    action: string;
    createdAt: string;
  }> = [];

  for (const m of memories) {
    events.push({
      eventId: crypto.randomUUID(),
      memoryId: m.id,
      action: "created",
      createdAt: m.createdAt,
    });
  }

  const updatedIndices = [3, 10, 22, 27, 35, 48, 55, 68, 78, 95];
  for (const idx of updatedIndices) {
    const m = memories[idx];
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

    console.log(`inserting ${memories.length} memories...`);
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
      { memories },
    );

    console.log(`creating ${relationships.length} relationships...`);
    await session.run(
      `UNWIND $rels AS rel
       MATCH (a:Memory {id: rel.sourceId})
       MATCH (b:Memory {id: rel.targetId})
       CREATE (a)-[:RELATES_TO {reason: rel.reason}]->(b)`,
      { rels: relationships },
    );

    const events = buildEvents();
    console.log(`creating ${events.length} memory events...`);
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
      { events },
    );

    console.log("done!");
    console.log(`  memories: ${memories.length}`);
    console.log(`  relationships: ${relationships.length}`);
    console.log(`  events: ${events.length}`);
  } finally {
    await session.close();
    await closeDriver();
  }
}

seed().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
