import { z } from "zod";
import type { BenchmarkMemory } from "../../../eval/corpus";
import { labelledDocumentText } from "./corpus";
import { competitiveJson, mapConcurrent } from "./http";
import { COMPETITIVE_SCOPE } from "./keys";
import { matchVendorHits, type VendorHit } from "./match";

const MEM0_API_BASE = "https://api.mem0.ai";
const unknownSchema = z.unknown();

const addResponseSchema = z
  .object({
    event_id: z.string().optional(),
    status: z.string().optional(),
    message: z.string().optional(),
    results: z.array(z.unknown()).optional(),
  })
  .passthrough();

const eventResponseSchema = z
  .object({
    status: z.string().optional(),
    error: z.string().nullable().optional(),
  })
  .passthrough();

const searchHitSchema = z
  .object({
    id: z.string().optional(),
    memory: z.string().optional(),
    score: z.number().optional(),
    metadata: z.unknown().optional(),
  })
  .passthrough();

const searchResponseSchema = z.union([
  z.object({ results: z.array(searchHitSchema) }).passthrough(),
  z.array(searchHitSchema),
]);

interface Mem0ClientOptions {
  apiKey: string;
  userId?: string;
  fetchImpl?: typeof fetch;
  writeConcurrency?: number;
  threshold?: number;
  topK?: number;
}

function mem0Headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Token ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function waitForEvent(
  options: Mem0ClientOptions,
  eventId: string,
): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const event = await competitiveJson({
      url: `${MEM0_API_BASE}/v1/event/${eventId}/`,
      method: "GET",
      headers: mem0Headers(options.apiKey),
      schema: eventResponseSchema,
      fetchImpl: options.fetchImpl,
    });
    const status = event?.status?.toUpperCase();
    if (status === "SUCCEEDED") return;
    if (status === "FAILED") {
      throw new Error(
        `Mem0 event ${eventId} failed${event?.error ? `: ${event.error}` : ""}`,
      );
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1000);
    });
  }
  throw new Error(`Mem0 event ${eventId} timed out`);
}

async function deleteMem0User(options: Mem0ClientOptions): Promise<void> {
  const userId = options.userId ?? COMPETITIVE_SCOPE;
  await competitiveJson({
    url: `${MEM0_API_BASE}/v1/memories/?user_id=${encodeURIComponent(userId)}`,
    method: "DELETE",
    headers: mem0Headers(options.apiKey),
    schema: unknownSchema,
    fetchImpl: options.fetchImpl,
    allowEmpty: true,
  });
}

export function mem0AddBody(memory: BenchmarkMemory, userId: string): unknown {
  const createdMs = Date.parse(memory.createdAt);
  return {
    messages: [{ role: "user", content: labelledDocumentText(memory) }],
    user_id: userId,
    infer: false,
    metadata: {
      vmem_id: memory.id,
      vmem_title: memory.title,
      vmem_type: memory.type,
    },
    ...(Number.isFinite(createdMs)
      ? { timestamp: Math.floor(createdMs / 1000) }
      : {}),
  };
}

export async function ingestMem0(
  memories: readonly BenchmarkMemory[],
  options: Mem0ClientOptions,
): Promise<void> {
  const userId = options.userId ?? COMPETITIVE_SCOPE;
  await deleteMem0User(options);
  await mapConcurrent(
    memories,
    options.writeConcurrency ?? 3,
    async (memory) => {
      const added = await competitiveJson({
        url: `${MEM0_API_BASE}/v3/memories/add/`,
        method: "POST",
        headers: mem0Headers(options.apiKey),
        body: mem0AddBody(memory, userId),
        schema: addResponseSchema,
        fetchImpl: options.fetchImpl,
        timeoutMs: 90_000,
      });
      const eventId = added?.event_id;
      const status = added?.status?.toUpperCase();
      if (eventId !== undefined && status !== "SUCCEEDED") {
        await waitForEvent(options, eventId);
      }
    },
  );
}

async function searchMem0(
  query: string,
  options: Mem0ClientOptions,
): Promise<VendorHit[]> {
  const userId = options.userId ?? COMPETITIVE_SCOPE;
  const json = await competitiveJson({
    url: `${MEM0_API_BASE}/v3/memories/search/`,
    method: "POST",
    headers: mem0Headers(options.apiKey),
    body: {
      query,
      filters: { user_id: userId },
      top_k: options.topK ?? 10,
      rerank: false,
      ...(options.threshold === undefined
        ? {}
        : { threshold: options.threshold }),
    },
    schema: searchResponseSchema,
    fetchImpl: options.fetchImpl,
  });
  const hits = Array.isArray(json) ? json : (json?.results ?? []);
  return hits.map((hit) => ({
    text: hit.memory ?? "",
    metadata: hit.metadata,
  }));
}

export async function retrieveMem0Titles(
  query: string,
  memories: readonly BenchmarkMemory[],
  options: Mem0ClientOptions,
): Promise<{ titles: string[]; latencyMs: number; texts: string[] }> {
  const started = performance.now();
  const hits = await searchMem0(query, options);
  return {
    titles: matchVendorHits(hits, memories),
    latencyMs: performance.now() - started,
    texts: hits.map((hit) => hit.text),
  };
}
