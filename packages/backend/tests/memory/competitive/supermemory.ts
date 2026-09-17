import { z } from "zod";
import type { BenchmarkMemory } from "../../../eval/corpus";
import { labelledDocumentText } from "./corpus";
import { competitiveJson, CompetitiveHttpError, mapConcurrent } from "./http";
import { COMPETITIVE_SCOPE } from "./keys";
import { matchVendorHits, type VendorHit } from "./match";

const SUPERMEMORY_API_BASE = "https://api.supermemory.ai";

const addDocSchema = z
  .object({
    id: z.string(),
    status: z.string().optional(),
  })
  .passthrough();

const batchAddSchema = z
  .object({
    results: z.array(
      z
        .object({
          id: z.string(),
          status: z.string().optional(),
          error: z.string().optional(),
        })
        .passthrough(),
    ),
    failed: z.number(),
    success: z.number(),
  })
  .passthrough();

const documentSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    dreamingStatus: z.string().optional(),
    customId: z.string().nullable().optional(),
  })
  .passthrough();

const searchHitSchema = z
  .object({
    id: z.string().optional(),
    memory: z.string().optional(),
    chunk: z.string().optional(),
    similarity: z.number().optional(),
    metadata: z.unknown().optional(),
    customId: z.string().optional(),
  })
  .passthrough();

const searchResponseSchema = z
  .object({
    results: z.array(searchHitSchema),
    timing: z.number().optional(),
  })
  .passthrough();

interface SuperMemoryClientOptions {
  apiKey: string;
  containerTag?: string;
  fetchImpl?: typeof fetch;
  threshold?: number;
  limit?: number;
}

function smHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export function supermemoryDocumentBody(
  memory: BenchmarkMemory,
  containerTag: string,
): {
  content: string;
  containerTag: string;
  customId: string;
  metadata: { vmem_id: string; vmem_title: string; vmem_type: string };
  documentDate: string;
  dreaming: "instant";
} {
  return {
    content: labelledDocumentText(memory),
    containerTag,
    customId: memory.id,
    metadata: {
      vmem_id: memory.id,
      vmem_title: memory.title,
      vmem_type: memory.type,
    },
    documentDate: memory.createdAt,
    dreaming: "instant",
  };
}

async function waitForDocuments(
  ids: readonly string[],
  options: SuperMemoryClientOptions,
): Promise<void> {
  const pending = new Set(ids.filter((id) => id.length > 0));
  const deadline = Date.now() + 15 * 60_000;
  while (pending.size > 0) {
    if (Date.now() > deadline) {
      throw new Error(
        `SuperMemory indexing timed out (${String(pending.size)} documents still processing)`,
      );
    }
    const snapshot = [...pending];
    await mapConcurrent(snapshot, 8, async (id) => {
      const doc = await competitiveJson({
        url: `${SUPERMEMORY_API_BASE}/v3/documents/${id}`,
        method: "GET",
        headers: smHeaders(options.apiKey),
        schema: documentSchema,
        fetchImpl: options.fetchImpl,
      });
      const status = doc?.status;
      if (status === "failed") {
        throw new Error(`SuperMemory document ${id} failed`);
      }
      if (status === "done") {
        pending.delete(id);
      }
    });
    if (pending.size === 0) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });
  }
}

export async function ingestSuperMemory(
  memories: readonly BenchmarkMemory[],
  options: SuperMemoryClientOptions,
): Promise<void> {
  const containerTag = options.containerTag ?? COMPETITIVE_SCOPE;
  const documents = memories.map((memory) =>
    supermemoryDocumentBody(memory, containerTag),
  );
  const ids: string[] = [];
  const chunkSize = 100;
  try {
    for (let offset = 0; offset < documents.length; offset += chunkSize) {
      const chunk = documents.slice(offset, offset + chunkSize);
      const added = await competitiveJson({
        url: `${SUPERMEMORY_API_BASE}/v3/documents/batch`,
        method: "POST",
        headers: smHeaders(options.apiKey),
        body: { containerTag, documents: chunk, dreaming: "instant" },
        schema: batchAddSchema,
        fetchImpl: options.fetchImpl,
        timeoutMs: 120_000,
      });
      if (added === undefined) {
        throw new Error("SuperMemory batch add returned an empty body");
      }
      if (added.failed > 0) {
        const first = added.results.find((row) => row.error !== undefined);
        throw new Error(
          `SuperMemory batch add failed ${String(added.failed)} documents${
            first?.error !== undefined ? `: ${first.error}` : ""
          }`,
        );
      }
      ids.push(
        ...added.results.map((row) => row.id).filter((id) => id.length > 0),
      );
    }
    if (ids.length === 0 && documents.length > 0) {
      const singles = await mapConcurrent(documents, 3, async (doc) => {
        const created = await competitiveJson({
          url: `${SUPERMEMORY_API_BASE}/v3/documents`,
          method: "POST",
          headers: smHeaders(options.apiKey),
          body: doc,
          schema: addDocSchema,
          fetchImpl: options.fetchImpl,
        });
        if (created === undefined) {
          throw new Error("SuperMemory add document returned an empty body");
        }
        return created.id;
      });
      await waitForDocuments(singles, options);
      return;
    }
    await waitForDocuments(ids, options);
  } catch (error) {
    if (error instanceof CompetitiveHttpError && error.status === 402) {
      throw new Error(
        "SuperMemory 402 (credits/token limit). Set COMPETITIVE_QUERY_LIMIT and COMPETITIVE_MEMORY_LIMIT to the same subset for all three systems.",
        { cause: error },
      );
    }
    throw error;
  }
}

async function searchSuperMemory(
  query: string,
  options: SuperMemoryClientOptions,
): Promise<VendorHit[]> {
  const containerTag = options.containerTag ?? COMPETITIVE_SCOPE;
  const json = await competitiveJson({
    url: `${SUPERMEMORY_API_BASE}/v4/search`,
    method: "POST",
    headers: smHeaders(options.apiKey),
    body: {
      q: query,
      containerTag,
      searchMode: "hybrid",
      limit: options.limit ?? 10,
      rerank: false,
      include: { documents: true },
      ...(options.threshold === undefined
        ? {}
        : { threshold: options.threshold }),
    },
    schema: searchResponseSchema,
    fetchImpl: options.fetchImpl,
  });
  const hits = json?.results ?? [];
  return hits.map((hit) => ({
    text: hit.memory ?? hit.chunk ?? "",
    metadata: hit.metadata,
    customId: hit.customId,
  }));
}

export async function retrieveSuperMemoryTitles(
  query: string,
  memories: readonly BenchmarkMemory[],
  options: SuperMemoryClientOptions,
): Promise<{ titles: string[]; latencyMs: number; texts: string[] }> {
  const started = performance.now();
  const hits = await searchSuperMemory(query, options);
  return {
    titles: matchVendorHits(hits, memories),
    latencyMs: performance.now() - started,
    texts: hits.map((hit) => hit.text),
  };
}
