/**
 * Slide-local copy of the landing memory-graph data, with a concrete, plain
 * example instead of the internal memory-type taxonomy (profile / episodic /
 * knowledge / entity) the landing page uses — that jargon is never explained in
 * the deck, so for a zero-knowledge audience it just confuses.
 *
 * The node `id`s are kept (they're internal only, never shown) so the geometry
 * and edges carry over unchanged; only the visible `label`s and `snippet`s are
 * rewritten into a relatable story: a project kickoff with a colleague.
 * Kept separate from `landing-preview-data.ts` so the live landing page is
 * untouched.
 */

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
    label: "You",
    labelY: 36,
    snippet: "You like short updates and meetings in the morning.",
  },
  {
    id: "episodic",
    cx: 160,
    cy: 94,
    r: 11,
    label: "Kickoff",
    labelY: 118,
    snippet: "Your project kickoff with James on Tuesday.",
    isCenter: true,
  },
  {
    id: "knowledge",
    cx: 248,
    cy: 58,
    r: 8,
    label: "Redesign",
    labelY: 42,
    snippet: "The website redesign — due the end of Q3.",
  },
  {
    id: "tool",
    cx: 56,
    cy: 132,
    r: 6,
    label: "Follow-up",
    labelY: 152,
    snippet: "The follow-up email James sent after the call.",
  },
  {
    id: "entity",
    cx: 264,
    cy: 128,
    r: 6,
    label: "James",
    labelY: 148,
    snippet: "James — the product lead running the redesign.",
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
