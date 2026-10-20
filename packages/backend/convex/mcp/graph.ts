import type { MemoryType, MemoryWithTags } from "@vmem/sdk";
import type { ActionCtx } from "../_generated/server";
import type { McpScope } from "../profiles/mcpAccess";
import { memoryReadScopeForMcp, withMcpMemoryScope } from "./memoryScope";
import { collectScopedMemoriesPaged } from "../memoryStore/walk";
import {
  loadGraphEntities,
  loadGraphLinks,
  memoryGraphNodes,
  type GraphMentionsEdge,
  type GraphNodeEntry,
  type GraphRelatesToEdge,
} from "../graphApi";

type MemoryGraphNode = {
  id: string;
  title: string;
  type?: MemoryType;
  tags: string[];
  createdAt: string;
  kind: "memory";
  source?: string;
  sourceType: string | null;
};

type TagEdge = {
  source: string;
  target: string;
  weight: number;
  sharedTags: string[];
};

type EntityNode = {
  id: string;
  title: string;
  entityType?: string;
  createdAt: string;
};

export type McpMemoryGraphResult = {
  nodes: MemoryGraphNode[];
  relatesToEdges: GraphRelatesToEdge[];
  tagEdges: TagEdge[];
  entities: EntityNode[];
  mentionsEdges: GraphMentionsEdge[];
  focusNodeId: string | null;
  truncated: boolean;
  // pass back as `cursor` for the next page of memory nodes
  nextCursor: string | null;
  stats: {
    nodeCount: number;
    relatesToEdgeCount: number;
    tagEdgeCount: number;
    entityCount: number;
    mentionsEdgeCount: number;
    totalNodesBeforeCap: number;
  };
};

const DEFAULT_NODE_LIMIT = 80;
const MAX_NODE_LIMIT = 100;
const MAX_TAGS_PER_NODE = 12;
const MAX_TAG_EDGES = 1_000;

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_NODE_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_NODE_LIMIT);
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor.length === 0) return 0;
  if (!/^\d+$/.test(cursor)) throw new Error("Invalid cursor");
  return Number(cursor);
}

export interface GetMemoryGraphForMcpArgs {
  clerkId: string;
  mcpScope: McpScope;
  profileId?: string;
  focus?: string;
  memoryIds?: string[];
  types?: MemoryType[];
  tags?: string[];
  sources?: string[];
  cursor?: string;
  limit?: number;
}

// same rules as the web graph filters: every tag (case-insensitive), any
// source, any type
function matchesGraphFilters(
  memory: MemoryWithTags,
  args: Pick<GetMemoryGraphForMcpArgs, "types" | "tags" | "sources">,
): boolean {
  if (args.types?.length && !args.types.includes(memory.type)) return false;
  if (args.sources?.length && !args.sources.includes(memory.source)) {
    return false;
  }
  const tags = memory.tags.map((tag) => tag.toLowerCase());
  return (args.tags ?? []).every((tag) => tags.includes(tag.toLowerCase()));
}

// seeds first, then every memory one link away from a seed
function withOneHopNeighbours(
  memories: readonly MemoryWithTags[],
  links: readonly GraphRelatesToEdge[],
  seedIds: readonly string[],
): MemoryWithTags[] {
  const seeds = new Set(seedIds);
  const neighbours = new Set<string>();
  for (const link of links) {
    if (seeds.has(link.source)) neighbours.add(link.target);
    if (seeds.has(link.target)) neighbours.add(link.source);
  }
  return [
    ...memories.filter((memory) => seeds.has(memory.id)),
    ...memories.filter(
      (memory) => !seeds.has(memory.id) && neighbours.has(memory.id),
    ),
  ];
}

// one edge per pair of memories that share a tag, strongest first
function buildTagEdges(
  nodes: readonly { id: string; tags: readonly string[] }[],
  maxEdges: number = MAX_TAG_EDGES,
): TagEdge[] {
  const edges: TagEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const left = nodes[i];
    if (left === undefined || left.tags.length === 0) continue;
    const leftTags = new Set(left.tags);
    for (let j = i + 1; j < nodes.length; j++) {
      const right = nodes[j];
      if (right === undefined) continue;
      const sharedTags = [...new Set(right.tags)].filter((tag) =>
        leftTags.has(tag),
      );
      if (sharedTags.length === 0) continue;
      const [source, target] =
        left.id < right.id ? [left.id, right.id] : [right.id, left.id];
      edges.push({ source, target, weight: sharedTags.length, sharedTags });
    }
  }
  edges.sort((a, b) => b.weight - a.weight);
  return edges.slice(0, maxEdges);
}

function toMcpNode(node: GraphNodeEntry): MemoryGraphNode {
  return {
    id: node.id,
    title: node.title,
    type: node.type,
    tags: node.tags.slice(0, MAX_TAGS_PER_NODE),
    createdAt: node.createdAt,
    kind: "memory",
    source: node.source,
    sourceType: node.sourceType,
  };
}

export async function getMemoryGraphForMcp(
  ctx: ActionCtx,
  args: GetMemoryGraphForMcpArgs,
): Promise<McpMemoryGraphResult> {
  const limit = normalizeLimit(args.limit);
  const offset = parseCursor(args.cursor);
  const scoped = await withMcpMemoryScope(ctx, args, (scope) =>
    collectScopedMemoriesPaged(ctx, memoryReadScopeForMcp(scope)),
  );
  const filtered = scoped.filter((memory) => matchesGraphFilters(memory, args));

  const seedIds =
    args.focus !== undefined ? [args.focus] : (args.memoryIds ?? []);
  let candidates: MemoryWithTags[] = filtered;
  let links: GraphRelatesToEdge[] | null = null;
  if (seedIds.length > 0) {
    if (
      args.focus !== undefined &&
      !scoped.some((memory) => memory.id === args.focus)
    ) {
      throw new Error("Memory not found");
    }
    links = await loadGraphLinks(ctx, filtered);
    candidates = withOneHopNeighbours(filtered, links, seedIds);
  }

  const page = candidates.slice(offset, offset + limit);
  const visible = new Set(page.map((memory) => memory.id));
  const [relatesToEdges, entities] = await Promise.all([
    links === null
      ? loadGraphLinks(ctx, page)
      : Promise.resolve(
          links.filter(
            (link) => visible.has(link.source) && visible.has(link.target),
          ),
        ),
    loadGraphEntities(ctx, page),
  ]);
  const nodes = memoryGraphNodes(page).map(toMcpNode);
  const tagEdges = buildTagEdges(page);
  const hasMore = offset + page.length < candidates.length;

  return {
    nodes,
    relatesToEdges,
    tagEdges,
    entities: entities.entityNodes.map((node) => ({
      id: node.id,
      title: node.title,
      entityType: node.entityType,
      createdAt: node.createdAt,
    })),
    mentionsEdges: entities.mentionsEdges,
    focusNodeId: args.focus ?? null,
    truncated: hasMore,
    nextCursor: hasMore ? String(offset + page.length) : null,
    stats: {
      nodeCount: nodes.length,
      relatesToEdgeCount: relatesToEdges.length,
      tagEdgeCount: tagEdges.length,
      entityCount: entities.entityNodes.length,
      mentionsEdgeCount: entities.mentionsEdges.length,
      totalNodesBeforeCap: candidates.length,
    },
  };
}
