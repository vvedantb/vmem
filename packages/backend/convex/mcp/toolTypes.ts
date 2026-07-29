import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
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

export interface ToolSpec<Shape extends z.ZodRawShape> {
  readonly name: string;
  readonly schema: z.ZodObject<Shape>;
  readonly description: string | ((scopeLabel: string) => string);
  readonly errorLabel: string;
  // omit to register on every mcp scope
  readonly scopes?: readonly McpScope[];
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
