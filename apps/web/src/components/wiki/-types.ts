import type { api, Id } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";

export type WikiNodeId = Id<"wikiNodes">;

export type WikiListNode = FunctionReturnType<typeof api.wiki.listTree>[number];

export type WikiSearchHit = FunctionReturnType<typeof api.wiki.search>[number];

export type WikiNodeDoc = NonNullable<
  FunctionReturnType<typeof api.wiki.getNode>
>;

export type WikiVersionSummary = FunctionReturnType<
  typeof api.wikiVersions.list
>[number];
