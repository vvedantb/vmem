export type PreviewNodeId =
  | "profile"
  | "episodic"
  | "knowledge"
  | "tool"
  | "entity";

interface PreviewNode {
  id: PreviewNodeId;
  cx: number;
  cy: number;
  r: number;
  label: string;
  labelY: number;
  snippet: string;
  isCenter?: boolean;
}

interface PreviewEdge {
  from: PreviewNodeId;
  to: PreviewNodeId;
  d: string;
  isRecall?: boolean;
}

export const previewNodes: PreviewNode[] = [
  {
    id: "profile",
    cx: 88,
    cy: 52,
    r: 7,
    label: "profile",
    labelY: 36,
    snippet: "Prefers dark mode, vim keybindings, and concise agent replies.",
  },
  {
    id: "episodic",
    cx: 160,
    cy: 94,
    r: 11,
    label: "episodic",
    labelY: 118,
    snippet: "Debugged Neo4j sync lag during the March graph refactor.",
    isCenter: true,
  },
  {
    id: "knowledge",
    cx: 248,
    cy: 58,
    r: 8,
    label: "knowledge",
    labelY: 42,
    snippet: "vmem stores memories in Neo4j with Convex orchestration.",
  },
  {
    id: "tool",
    cx: 56,
    cy: 132,
    r: 6,
    label: "tool output",
    labelY: 152,
    snippet: "grep found 14 references to profilePassesFilter in web app.",
  },
  {
    id: "entity",
    cx: 264,
    cy: 128,
    r: 6,
    label: "entity",
    labelY: 148,
    snippet: "City, University of London — Final Year Project context.",
  },
];

export const previewEdges: PreviewEdge[] = [
  { from: "profile", to: "episodic", d: "M88 52 L160 94" },
  { from: "episodic", to: "knowledge", d: "M160 94 L248 58", isRecall: true },
  { from: "tool", to: "episodic", d: "M56 132 L160 94" },
  { from: "entity", to: "episodic", d: "M264 128 L160 94" },
  { from: "profile", to: "tool", d: "M88 52 L56 132" },
  { from: "knowledge", to: "entity", d: "M248 58 L264 128" },
];

export function edgeTouchesNode(
  edge: PreviewEdge,
  nodeId: PreviewNodeId | null,
): boolean {
  if (nodeId === null) return true;
  return edge.from === nodeId || edge.to === nodeId;
}
