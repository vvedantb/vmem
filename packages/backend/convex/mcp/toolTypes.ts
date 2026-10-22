import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { AuthActionCtx } from "../auth";
import type { McpScope } from "../profiles/mcpAccess";
import type { McpToolContent, ToolHandlerResult } from "./content";

export const emptyInputSchema = z.object({});

export interface ToolHandlerContext {
  ctx: ActionCtx;
  clerkUserId: string;
  scope: McpScope;
}

export function scopedClerk(ctx: ToolHandlerContext) {
  return { clerkId: ctx.clerkUserId, scope: ctx.scope };
}

export function scopedMemory(ctx: ToolHandlerContext) {
  return { clerkId: ctx.clerkUserId, mcpScope: ctx.scope };
}

export async function requireUserId(
  h: ToolHandlerContext,
): Promise<Id<"users">> {
  const userId = await h.ctx.runQuery(
    internal.auth.getUserIdByClerkIdInternal,
    { clerkId: h.clerkUserId },
  );
  if (userId === null) throw new Error("User not found");
  return userId;
}

// the ctx an authAction handler gets, for tools that reuse action handlers
export async function authActionCtx(
  h: ToolHandlerContext,
): Promise<AuthActionCtx> {
  return { ...h.ctx, userId: await requireUserId(h) };
}

// destructive tools take confirm: true so an agent has to opt in explicitly
export const confirmParam = z
  .literal(true)
  .describe("Must be true: this action is permanent");

export const READ_ONLY_TOOL: ToolAnnotations = { readOnlyHint: true };

export interface ToolSpec<Shape extends z.ZodRawShape> {
  readonly name: string;
  readonly schema: z.ZodObject<Shape>;
  readonly description: string | ((scopeLabel: string) => string);
  readonly errorLabel: string;
  // omit to register on every mcp scope
  readonly scopes?: readonly McpScope[];
  // mcp tool hints, e.g. readOnlyHint for tools that never write
  readonly annotations?: ToolAnnotations;
  readonly toContent?: (result: ToolHandlerResult) => McpToolContent;
  // method syntax, bivariant params so toolspec<> erases into erasedtoolspec
  run(
    h: ToolHandlerContext,
    params: z.infer<z.ZodObject<Shape>>,
  ): Promise<unknown>;
}

export function toolSpec<Shape extends z.ZodRawShape>(
  spec: ToolSpec<Shape>,
): ToolSpec<Shape> {
  return spec;
}

export type McpBindableTool = {
  readonly name: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  readonly run: (
    h: ToolHandlerContext,
    params: z.infer<z.ZodObject<z.ZodRawShape>>,
  ) => Promise<unknown>;
};

// structural erase of toolspec<> so heterogeneous catalog entries can bind
type ErasedToolSpec = {
  readonly name: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  // method syntax keeps run bivariant so specific toolspec shapes assign here
  run(
    h: ToolHandlerContext,
    params: z.infer<z.ZodObject<z.ZodRawShape>>,
  ): Promise<unknown>;
};

export function bindToolSpec(spec: ErasedToolSpec): McpBindableTool {
  return {
    name: spec.name,
    schema: spec.schema,
    run: (h, params) => spec.run(h, spec.schema.parse(params)),
  };
}
