// Adapted from unblocked/context-engine-simulator (MIT, Copyright 2026 Unblocked)
// https://github.com/unblocked/context-engine-simulator
// MCP server fields (providerIdentifier / serverName) follow its stream parser.

import { z } from "zod";

const optString = z.string().optional().catch(undefined);
const optNumber = z.number().optional().catch(undefined);

const mcpFieldsSchema = z.object({
  providerIdentifier: optString,
  serverName: optString,
});

const mcpToolCallSchema = mcpFieldsSchema.extend({
  args: mcpFieldsSchema.optional().catch(undefined),
});

const usageSchema = z.object({
  input_tokens: optNumber,
  output_tokens: optNumber,
});

const lineSchema = z.object({
  type: optString,
  tool_call: z
    .object({ mcpToolCall: mcpToolCallSchema.optional().catch(undefined) })
    .optional()
    .catch(undefined),
  message: z
    .object({
      content: z
        .array(z.object({ type: optString, name: optString }).catch({}))
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
  result: optString,
  is_error: z.boolean().optional().catch(undefined),
  total_cost_usd: optNumber,
  duration_ms: optNumber,
  usage: usageSchema.optional().catch(undefined),
});

export interface StreamResult {
  text: string;
  isError: boolean;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface StreamLine {
  mcpServers: string[];
  result: StreamResult | null;
}

// Claude Code names MCP tools mcp__<server>__<tool>.
function serverFromToolName(name: string | undefined): string | null {
  if (name === undefined || !name.startsWith("mcp__")) return null;
  const server = name.split("__")[1];
  return server !== undefined && server !== "" ? server : null;
}

// Complete lines only. The text after the last newline is returned as rest.
export function splitNdjson(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((line) => line.trim() !== ""), rest };
}

// null for lines that are not JSON objects
export function parseStreamLine(line: string): StreamLine | null {
  let parsed: z.infer<typeof lineSchema>;
  try {
    parsed = lineSchema.parse(JSON.parse(line));
  } catch {
    return null;
  }

  const servers = new Set<string>();
  const call = parsed.tool_call?.mcpToolCall;
  const named =
    call?.args?.providerIdentifier ??
    call?.args?.serverName ??
    call?.providerIdentifier ??
    call?.serverName;
  if (named !== undefined && named !== "") servers.add(named);
  for (const block of parsed.message?.content ?? []) {
    if (block.type !== "tool_use") continue;
    const server = serverFromToolName(block.name);
    if (server !== null) servers.add(server);
  }

  const result: StreamResult | null =
    parsed.type === "result"
      ? {
          text: parsed.result ?? "",
          isError: parsed.is_error ?? false,
          costUsd: parsed.total_cost_usd ?? 0,
          inputTokens: parsed.usage?.input_tokens ?? 0,
          outputTokens: parsed.usage?.output_tokens ?? 0,
          durationMs: parsed.duration_ms ?? 0,
        }
      : null;

  return { mcpServers: [...servers], result };
}
