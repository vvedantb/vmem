import {
  pgTable,
  text,
  timestamp,
  real,
  pgEnum,
  uuid,
  jsonb,
  index,
  vector,
} from "drizzle-orm/pg-core";

export const memoryTypeEnum = pgEnum("memory_type", [
  "profile",
  "episodic",
  "knowledge",
]);

export const memoryStatusEnum = pgEnum("memory_status", [
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "approved",
  "rejected",
]);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    content: text("content").notNull(),
    type: memoryTypeEnum("type").notNull(),
    source: text("source").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    confidence: real("confidence").notNull().default(1.0),
    status: memoryStatusEnum("status").notNull().default("active"),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    index("memories_user_id_idx").on(table.userId),
    index("memories_type_idx").on(table.type),
    index("memories_status_idx").on(table.status),
  ],
);

export const proposedUpdates = pgTable(
  "proposed_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    proposedContent: text("proposed_content").notNull(),
    reason: text("reason").notNull(),
    status: proposalStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [index("proposed_updates_memory_id_idx").on(table.memoryId)],
);

export const memoryEvents = pgTable(
  "memory_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    details: jsonb("details").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("memory_events_memory_id_idx").on(table.memoryId),
    index("memory_events_created_at_idx").on(table.createdAt),
  ],
);
