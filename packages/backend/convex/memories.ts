import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { authMutation, authQuery } from "./auth";

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );
}

function toMemoryResponse(memory: Doc<"memories">) {
  return {
    id: memory._id,
    title: memory.title,
    content: memory.content,
    tags: memory.tags,
    createdAt: new Date(memory.createdAt).toISOString(),
  };
}

async function getOwnedMemoryById(
  ctx: { db: { get: (id: Id<"memories">) => Promise<Doc<"memories"> | null> } },
  userId: Id<"users">,
  memoryId: string,
): Promise<Doc<"memories"> | null> {
  try {
    const memory = await ctx.db.get(memoryId as Id<"memories">);
    if (!memory || memory.userId !== userId) {
      return null;
    }
    return memory;
  } catch {
    return null;
  }
}

export const listMy = authQuery({
  args: {},
  handler: async (ctx) => {
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    memories.sort((a, b) => b.createdAt - a.createdAt);
    return memories.map(toMemoryResponse);
  },
});

export const createMy = authMutation({
  args: {
    title: v.string(),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    const content = args.content.trim();

    if (!title) {
      throw new Error("Title is required");
    }
    if (!content) {
      throw new Error("Content is required");
    }

    const now = Date.now();
    const memoryId = await ctx.db.insert("memories", {
      userId: ctx.userId,
      title,
      content,
      tags: normalizeTags(args.tags ?? []),
      createdAt: now,
      updatedAt: now,
    });

    const created = await ctx.db.get(memoryId);
    if (!created) {
      throw new Error("Memory creation failed");
    }

    return toMemoryResponse(created);
  },
});

export const getMyById = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const memory = await getOwnedMemoryById(ctx, ctx.userId, args.id);
    return memory ? toMemoryResponse(memory) : null;
  },
});

export const updateMy = authMutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await getOwnedMemoryById(ctx, ctx.userId, args.id);
    if (!existing) {
      return null;
    }

    if (
      args.title === undefined &&
      args.content === undefined &&
      args.tags === undefined
    ) {
      throw new Error("No updates provided");
    }

    const patch: Partial<Doc<"memories">> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new Error("Title cannot be empty");
      }
      patch.title = title;
    }

    if (args.content !== undefined) {
      const content = args.content.trim();
      if (!content) {
        throw new Error("Content cannot be empty");
      }
      patch.content = content;
    }

    if (args.tags !== undefined) {
      patch.tags = normalizeTags(args.tags);
    }

    await ctx.db.patch(existing._id, patch);

    const updated = await ctx.db.get(existing._id);
    if (!updated) {
      throw new Error("Memory not found after update");
    }

    return toMemoryResponse(updated);
  },
});

export const deleteMy = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const existing = await getOwnedMemoryById(ctx, ctx.userId, args.id);
    if (!existing) {
      return false;
    }

    await ctx.db.delete(existing._id);
    return true;
  },
});
