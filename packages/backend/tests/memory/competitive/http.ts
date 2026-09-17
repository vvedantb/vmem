import pRetry from "p-retry";
import type { z } from "zod";

const DEFAULT_TIMEOUT_MS = 60_000;

export class CompetitiveHttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, detail: string) {
    super(`competitive http ${String(status)} ${url}${detail}`);
    this.name = "CompetitiveHttpError";
    this.status = status;
    this.url = url;
  }
}

export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const slots: Array<R | undefined> = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      slots[index] = await fn(item, index);
    }
  };
  const n = Math.max(1, Math.min(concurrency, Math.max(1, items.length)));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return slots.map((row, index) => {
    if (row === undefined) {
      throw new Error(`missing concurrent result at ${String(index)}`);
    }
    return row;
  });
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) return undefined;
  const json: unknown = JSON.parse(text);
  return json;
}

export async function competitiveJson<T>(args: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowEmpty?: boolean;
}): Promise<T | undefined> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return pRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(args.url, {
          method: args.method,
          headers: args.headers,
          body: args.body === undefined ? undefined : JSON.stringify(args.body),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof Error && error.name === "AbortError") {
          throw new CompetitiveHttpError(408, args.url, "");
        }
        throw error;
      }
      clearTimeout(timer);
      if (!response.ok) {
        const detailText = await response.text();
        const snippet = detailText.slice(0, 240);
        throw new CompetitiveHttpError(
          response.status,
          args.url,
          snippet.length > 0 ? `: ${snippet}` : "",
        );
      }
      if (args.allowEmpty && response.status === 204) {
        return undefined;
      }
      const json = await readBody(response);
      if (json === undefined) {
        if (args.allowEmpty) return undefined;
        throw new CompetitiveHttpError(
          response.status,
          args.url,
          ": empty body",
        );
      }
      const parsed = args.schema.safeParse(json);
      if (!parsed.success) {
        throw new CompetitiveHttpError(
          response.status,
          args.url,
          `: response failed validation (${parsed.error.issues[0]?.message ?? "invalid"})`,
        );
      }
      return parsed.data;
    },
    {
      retries: 4,
      factor: 2,
      minTimeout: 1000,
      randomize: true,
    },
  );
}
