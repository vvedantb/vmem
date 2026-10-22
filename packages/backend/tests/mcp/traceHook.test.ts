import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
} from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { registerResources } from "../../convex/mcp/resources";
import { registerTools } from "../../convex/mcp/tools";
import { createConvexBackend } from "./convexHarness";
import {
  createMockActionCtx,
  createMockStore,
  MOCK_CLERK_ID,
  requireActionCtx,
  type MockStore,
} from "./mockBackend";

type RecordArgs = FunctionArgs<typeof internal.mcpTraces.record>;
type ScheduledRef = FunctionReference<"mutation" | "action", "internal">;
type RunAfter = (
  delay: number,
  ref: ScheduledRef,
  args: RecordArgs,
) => Promise<string>;

// real registerTools / registerResources over an in-memory MCP transport; the
// scheduler captures the trace payload instead of running it
async function connect(store: MockStore, runAfter: RunAfter) {
  const ctx = requireActionCtx({
    ...createMockActionCtx(store),
    scheduler: { runAfter, runAt: runAfter },
  });
  const server = new McpServer({ name: "vmem-trace-test", version: "0.0.0" });
  registerTools(server, MOCK_CLERK_ID, ctx, "personal");
  await registerResources(server, MOCK_CLERK_ID, ctx, "personal");
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "trace-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

function capture() {
  const traces: RecordArgs[] = [];
  // other scheduled jobs (embeddings, usage) are ignored
  const runAfter: RunAfter = async (_delay, ref, args) => {
    if (getFunctionName(ref) === "mcpTraces:record") traces.push(args);
    return "sched_trace";
  };
  return { traces, runAfter };
}

describe("MCP tool tracing hook", () => {
  it("schedules a trace for a successful call and record stores sanitised args", async () => {
    const { traces, runAfter } = capture();
    const client = await connect(createMockStore(), runAfter);
    const result = await client.callTool({
      name: "memory_add",
      arguments: {
        title: "Prefers pnpm",
        content: "c".repeat(500),
        type: "profile",
        source: "mcp",
      },
    });
    expect(result.isError).toBeFalsy();

    expect(traces).toHaveLength(1);
    const [trace] = traces;
    if (trace === undefined) throw new Error("trace missing");
    expect(trace).toMatchObject({
      clerkUserId: MOCK_CLERK_ID,
      scope: "personal",
      tool: "memory_add",
      ok: true,
      summary: 'memory_add → added "Prefers pnpm"',
    });
    expect(trace.durationMs).toBeGreaterThanOrEqual(0);
    expect(trace.args).not.toContain("c".repeat(201));
    expect(trace.resultIds).toHaveLength(1);

    const t = createConvexBackend();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: MOCK_CLERK_ID });
    });
    await t.mutation(internal.mcpTraces.record, trace);
    const stored = await t.run(async (ctx) => ({
      traces: await ctx.db.query("mcpTraces").collect(),
      details: await ctx.db.query("mcpTraceDetails").collect(),
    }));
    expect(stored.traces.map((row) => row.tool)).toEqual(["memory_add"]);
    expect(stored.details[0]?.args).toBe(trace.args);
    expect(stored.details[0]?.resultIds).toEqual(trace.resultIds);
  });

  it("schedules ok:false with the error for a failed call", async () => {
    const { traces, runAfter } = capture();
    const client = await connect(createMockStore(), runAfter);
    const result = await client.callTool({
      name: "memory_get",
      arguments: { id: "missing_memory" },
    });
    expect(result.isError).toBe(true);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      tool: "memory_get",
      ok: false,
      resultIds: [],
    });
    expect(traces[0]?.error).toBeTruthy();
    expect(traces[0]?.summary).toContain("→ error:");
  });

  it("keeps the tool result when scheduling the trace fails", async () => {
    const client = await connect(createMockStore(), async () => {
      throw new Error("scheduler down");
    });
    const result = await client.callTool({ name: "ping", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('\\"ok\\": true');
  });

  it("traces resource reads as resource:<uri>", async () => {
    const { traces, runAfter } = capture();
    const client = await connect(createMockStore(), runAfter);
    await client.readResource({ uri: "vmem://context_prompt" });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      tool: "resource:vmem://context_prompt",
      ok: true,
    });
  });
});
