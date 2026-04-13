import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";

interface GraphResult {
  nodes: {
    id: string;
    title: string;
    content: string;
    tags: string[];
    createdAt: string;
  }[];
  relatesToEdges: { source: string; target: string; reason: string }[];
  tagEdges: {
    source: string;
    target: string;
    weight: number;
    sharedTags: string[];
  }[];
}

export const getGraphData = authAction({
  args: { focus: v.optional(v.string()) },
  handler: async (ctx, args): Promise<GraphResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.graph.getGraphDataInternal,
      {
        clerkId,
        focus: args.focus,
      },
    );
  },
});

export const getLocalGraph = authAction({
  args: { focusId: v.string() },
  handler: async (ctx, args): Promise<GraphResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.graph.getLocalGraphInternal,
      {
        clerkId,
        focusId: args.focusId,
      },
    );
  },
});
