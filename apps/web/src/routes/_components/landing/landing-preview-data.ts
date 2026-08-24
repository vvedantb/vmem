export type PreviewNodeId =
  | "profile"
  | "episodic"
  | "knowledge"
  | "tool"
  | "entity"
  | "wiki"
  | "skill";

export type DemoMemoryId = PreviewNodeId;

export interface PreviewNode {
  id: PreviewNodeId;
  cx: number;
  cy: number;
  r: number;
  label: string;
  labelY: number;
  snippet: string;
  tags: string[];
  kind: "memory" | "entity" | "wiki-document" | "skill";
  isCenter?: boolean;
}

export interface PreviewEdge {
  from: PreviewNodeId;
  to: PreviewNodeId;
  d: string;
  isRecall?: boolean;
}

export interface DemoMemory {
  id: DemoMemoryId;
  title: string;
  content: string;
  type: "profile" | "episodic" | "knowledge";
  source: string;
  tags: string[];
  createdAt: string;
  connections: readonly { title: string; reason: string }[];
}

export interface DemoTrace {
  score: number;
  reason: string;
  scoreBreakdown: {
    fulltext: number;
    vector: number;
    recency: number;
    confidence: number;
    chunk: number;
    entity: number;
  };
}

export interface DemoQueryHit {
  memoryId: DemoMemoryId;
  score: number;
  trace: DemoTrace;
}

export interface DemoQuery {
  id: string;
  label: string;
  query: string;
  hits: readonly DemoQueryHit[];
}

export interface DemoWikiNode {
  id: string;
  title: string;
  kind: "folder" | "document";
  children?: readonly DemoWikiNode[];
  heading?: string;
  paragraphs?: readonly string[];
}

export interface DemoSkill {
  name: string;
  hint: string;
}

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString();

export const previewNodes: PreviewNode[] = [
  {
    id: "profile",
    cx: 168,
    cy: 92,
    r: 8,
    label: "profile",
    labelY: 74,
    snippet: "Prefers dark mode, vim keybindings, and concise agent replies.",
    tags: ["preferences"],
    kind: "memory",
  },
  {
    id: "episodic",
    cx: 320,
    cy: 176,
    r: 12,
    label: "episodic",
    labelY: 204,
    snippet: "Debugged Neo4j sync lag during the March graph refactor.",
    tags: ["neo4j", "graph"],
    kind: "memory",
    isCenter: true,
  },
  {
    id: "knowledge",
    cx: 508,
    cy: 108,
    r: 9,
    label: "knowledge",
    labelY: 90,
    snippet: "vmem stores memories in Neo4j with Convex orchestration.",
    tags: ["vmem", "architecture"],
    kind: "memory",
  },
  {
    id: "tool",
    cx: 112,
    cy: 248,
    r: 7,
    label: "tool output",
    labelY: 270,
    snippet: "grep found 14 references to profilePassesFilter in web app.",
    tags: ["code"],
    kind: "memory",
  },
  {
    id: "entity",
    cx: 536,
    cy: 248,
    r: 7,
    label: "entity",
    labelY: 270,
    snippet: "City, University of London — Final Year Project context.",
    tags: [],
    kind: "entity",
  },
  {
    id: "wiki",
    cx: 400,
    cy: 300,
    r: 7,
    label: "wiki",
    labelY: 322,
    snippet: "Graph recall notes: hybrid search, then one hop of expansion.",
    tags: ["docs"],
    kind: "wiki-document",
  },
  {
    id: "skill",
    cx: 248,
    cy: 64,
    r: 7,
    label: "skill",
    labelY: 46,
    snippet: "memory.retrieve — pull scored memories with a Context Trace.",
    tags: [],
    kind: "skill",
  },
];

export const previewEdges: PreviewEdge[] = [
  { from: "profile", to: "episodic", d: "M168 92 L320 176" },
  { from: "episodic", to: "knowledge", d: "M320 176 L508 108", isRecall: true },
  { from: "tool", to: "episodic", d: "M112 248 L320 176" },
  { from: "entity", to: "episodic", d: "M536 248 L320 176" },
  { from: "profile", to: "tool", d: "M168 92 L112 248" },
  { from: "knowledge", to: "entity", d: "M508 108 L536 248" },
  { from: "wiki", to: "knowledge", d: "M400 300 L508 108" },
  { from: "skill", to: "profile", d: "M248 64 L168 92" },
  { from: "skill", to: "episodic", d: "M248 64 L320 176" },
];

export const demoMemories: DemoMemory[] = [
  {
    id: "episodic",
    title: "Neo4j sync lag during graph refactor",
    content:
      "Debugged Neo4j sync lag during the March graph refactor. The stall was a missing index on profileId, not the writer itself.",
    type: "episodic",
    source: "cursor",
    tags: ["neo4j", "graph"],
    createdAt: daysAgo(2),
    connections: [
      {
        title: "vmem stores memories in Neo4j",
        reason: "same stack",
      },
      {
        title: "grep found profilePassesFilter",
        reason: "same session",
      },
    ],
  },
  {
    id: "knowledge",
    title: "vmem stores memories in Neo4j",
    content:
      "vmem stores memories in Neo4j with Convex orchestration. Retrieval mixes fulltext, vectors, chunks, entities, and one hop of graph expansion.",
    type: "knowledge",
    source: "mcp",
    tags: ["vmem", "architecture"],
    createdAt: daysAgo(5),
    connections: [
      {
        title: "Neo4j sync lag during graph refactor",
        reason: "same stack",
      },
      {
        title: "Graph recall notes",
        reason: "documents this",
      },
    ],
  },
  {
    id: "profile",
    title: "Editor and reply preferences",
    content:
      "Prefers dark mode, vim keybindings, and concise agent replies. Short answers over padded summaries.",
    type: "profile",
    source: "prompt-capture",
    tags: ["preferences"],
    createdAt: daysAgo(9),
    connections: [
      {
        title: "memory.retrieve skill",
        reason: "used by agents",
      },
    ],
  },
  {
    id: "entity",
    title: "City, University of London",
    content:
      "City, University of London — Final Year Project context for vmem, a graph-native memory layer for AI agents.",
    type: "knowledge",
    source: "web",
    tags: ["university", "fyp"],
    createdAt: daysAgo(14),
    connections: [
      {
        title: "vmem stores memories in Neo4j",
        reason: "project stack",
      },
    ],
  },
  {
    id: "tool",
    title: "grep found profilePassesFilter",
    content:
      "grep found 14 references to profilePassesFilter in the web app. Most sit in list filters and retrieve scoping.",
    type: "episodic",
    source: "cursor",
    tags: ["code"],
    createdAt: daysAgo(3),
    connections: [
      {
        title: "Neo4j sync lag during graph refactor",
        reason: "same session",
      },
    ],
  },
  {
    id: "wiki",
    title: "Graph recall notes",
    content:
      "Hybrid search first, then one hop of graph expansion. Every hit ships a Context Trace so the match is inspectable.",
    type: "knowledge",
    source: "web",
    tags: ["docs"],
    createdAt: daysAgo(7),
    connections: [
      {
        title: "vmem stores memories in Neo4j",
        reason: "documents this",
      },
    ],
  },
];

export const demoQueries: DemoQuery[] = [
  {
    id: "editor",
    label: "Editor preference",
    query: "What editor does the user prefer?",
    hits: [
      {
        memoryId: "profile",
        score: 0.94,
        trace: {
          score: 0.94,
          reason:
            "Matched because: fulltext hit on editor preferences, strong semantic match, recent profile memory",
          scoreBreakdown: {
            fulltext: 0.91,
            vector: 0.88,
            recency: 0.62,
            confidence: 0.9,
            chunk: 0.4,
            entity: 0,
          },
        },
      },
      {
        memoryId: "skill",
        score: 0.41,
        trace: {
          score: 0.41,
          reason: "Matched because: one-hop from profile via memory.retrieve",
          scoreBreakdown: {
            fulltext: 0.12,
            vector: 0.38,
            recency: 0.44,
            confidence: 0.7,
            chunk: 0,
            entity: 0,
          },
        },
      },
    ],
  },
  {
    id: "neo4j",
    label: "Neo4j lag",
    query: "Why was Neo4j sync slow in March?",
    hits: [
      {
        memoryId: "episodic",
        score: 0.97,
        trace: {
          score: 0.97,
          reason:
            "Matched because: fulltext hit on Neo4j sync lag, semantic match on graph refactor, recent episodic memory",
          scoreBreakdown: {
            fulltext: 0.96,
            vector: 0.91,
            recency: 0.84,
            confidence: 0.86,
            chunk: 0.55,
            entity: 0.2,
          },
        },
      },
      {
        memoryId: "knowledge",
        score: 0.72,
        trace: {
          score: 0.72,
          reason:
            "Matched because: semantic match on Neo4j storage, expanded one hop from the lag memory",
          scoreBreakdown: {
            fulltext: 0.48,
            vector: 0.81,
            recency: 0.58,
            confidence: 0.8,
            chunk: 0.22,
            entity: 0.35,
          },
        },
      },
      {
        memoryId: "tool",
        score: 0.53,
        trace: {
          score: 0.53,
          reason: "Matched because: same session as the graph refactor debug",
          scoreBreakdown: {
            fulltext: 0.18,
            vector: 0.44,
            recency: 0.8,
            confidence: 0.64,
            chunk: 0.31,
            entity: 0,
          },
        },
      },
    ],
  },
  {
    id: "fyp",
    label: "Final year project",
    query: "What is the City University project about?",
    hits: [
      {
        memoryId: "entity",
        score: 0.89,
        trace: {
          score: 0.89,
          reason:
            "Matched because: entity match on City, University of London, fulltext on Final Year Project",
          scoreBreakdown: {
            fulltext: 0.86,
            vector: 0.77,
            recency: 0.4,
            confidence: 0.82,
            chunk: 0.2,
            entity: 0.94,
          },
        },
      },
      {
        memoryId: "knowledge",
        score: 0.68,
        trace: {
          score: 0.68,
          reason:
            "Matched because: semantic match on the memory-layer project, linked to the university entity",
          scoreBreakdown: {
            fulltext: 0.33,
            vector: 0.79,
            recency: 0.58,
            confidence: 0.8,
            chunk: 0.16,
            entity: 0.62,
          },
        },
      },
    ],
  },
];

export const demoWikiTree: DemoWikiNode = {
  id: "fyp",
  title: "Final year project",
  kind: "folder",
  children: [
    {
      id: "recall",
      title: "Graph recall",
      kind: "document",
      heading: "Graph recall",
      paragraphs: [
        "Agents forget between sessions and across tools. vmem keeps a shared graph of what you know, then retrieves a slice when something asks.",
        "Retrieval is hybrid: fulltext, vectors, chunks, entities, then one hop of graph expansion. The Context Trace is the score breakdown — not a black-box rank.",
        "Conflicting updates become proposals instead of silent overwrites. Dream Mode synthesises higher-level memories in the background.",
      ],
    },
    {
      id: "stack",
      title: "Stack notes",
      kind: "document",
      heading: "Stack notes",
      paragraphs: [
        "Memories live in Neo4j. Convex handles auth, profiles, teams, and scheduled work.",
        "The web app, Chrome extension, MCP server, HTTP API, and SDK are clients on the same graph.",
      ],
    },
  ],
};

export const demoSkills: DemoSkill[] = [
  { name: "memory.retrieve", hint: "Scored recall with a Context Trace" },
  { name: "memory.save", hint: "Extract facts from a message and store them" },
  {
    name: "vmem://context_prompt",
    hint: "Resource agents can read as context",
  },
];

export const demoDashboard = {
  totalMemories: 128,
  addedToday: 6,
  thisWeek: 23,
  tagsUsed: 14,
  totalTrend: [82, 90, 96, 101, 108, 119, 128],
  newTrend: [2, 3, 1, 4, 5, 8, 6],
  portrait:
    "Builder working on a graph-native memory layer for agents. Prefers dark editors, short replies, and knowing why a retrieval matched.",
} as const;

export const demoSkillMemory: DemoMemory = {
  id: "skill",
  title: "memory.retrieve skill",
  content:
    "memory.retrieve — pull scored memories with a Context Trace. Defaults to the active profile unless a profileId is passed.",
  type: "knowledge",
  source: "mcp",
  tags: ["mcp", "skills"],
  createdAt: daysAgo(4),
  connections: [
    {
      title: "Editor and reply preferences",
      reason: "used by agents",
    },
  ],
};

export function memoryById(id: DemoMemoryId): DemoMemory {
  if (id === "skill") return demoSkillMemory;
  const memory = demoMemories.find((item) => item.id === id);
  return memory ?? demoSkillMemory;
}

export function queryById(id: string): DemoQuery {
  const query = demoQueries.find((item) => item.id === id);
  if (query !== undefined) return query;
  const first = demoQueries[0];
  if (first !== undefined) return first;
  return {
    id: "editor",
    label: "Editor preference",
    query: "What editor does the user prefer?",
    hits: [],
  };
}

export function skillAt(index: number): DemoSkill {
  const skill = demoSkills[index] ?? demoSkills[0];
  if (skill !== undefined) return skill;
  return {
    name: "memory.retrieve",
    hint: "Scored recall with a Context Trace",
  };
}

export function edgeTouchesNode(
  edge: PreviewEdge,
  nodeId: PreviewNodeId | null,
): boolean {
  if (nodeId === null) return true;
  return edge.from === nodeId || edge.to === nodeId;
}
