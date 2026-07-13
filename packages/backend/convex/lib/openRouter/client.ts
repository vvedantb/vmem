import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterError } from "@openrouter/sdk/models/errors";

export const OPENROUTER_HTTP_REFERER = "https://vmem.vedantb.com";
export const OPENROUTER_APP_TITLE = "vmem";

export function createOpenRouterClient(apiKey: string): OpenRouter {
  return new OpenRouter({
    apiKey,
    httpReferer: OPENROUTER_HTTP_REFERER,
    appTitle: OPENROUTER_APP_TITLE,
  });
}

export function truncateOpenRouterBody(body: string, max = 500): string {
  return body.length > max ? body.slice(0, max) : body;
}

export function readOpenRouterError(
  err: unknown,
  fallbackStatus = 0,
): { status: number; message: string } {
  if (err instanceof OpenRouterError) {
    return {
      status: err.statusCode,
      message: truncateOpenRouterBody(err.body),
    };
  }
  if (err instanceof Error) {
    return { status: fallbackStatus, message: err.message };
  }
  return { status: fallbackStatus, message: "unknown error" };
}

/**
 * Transient network faults that should be retried (or, at process level,
 * swallowed) rather than treated as a hard failure. These come from the
 * fetch/undici layer — not the OpenRouter API — and are especially common
 * in long batch jobs where the connection pool reuses a keep-alive socket
 * the server has already closed (surfaces as an undici "terminated" /
 * ECONNRESET, sometimes as an *unhandled* rejection with no awaiter).
 *
 * Matches on both the error and its `cause` chain (undici nests the socket
 * error under `cause`), checking Node error `code`s and known message
 * fragments. Deliberately narrow: anything not listed here is a real error.
 */
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

const TRANSIENT_MESSAGE_FRAGMENTS: readonly string[] = [
  "terminated",
  "socket hang up",
  "fetch failed",
  "other side closed",
  "network socket disconnected",
  // Neo4j driver pool faults under burst load against a managed cloud
  // instance (Aura): a cold connection burst after an idle gap can exceed
  // the acquisition timeout even though the instance is healthy. Transient —
  // a brief pause + retry finds the now-warm pool.
  "connection acquisition timed out",
  "pool is closed",
  // OpenRouter SDK parsing an empty/truncated response body (a gateway hiccup,
  // more common under throughput routing like ":nitro"). Surfaces as
  // "Unexpected end of JSON input" from the SDK's response matcher, sometimes
  // on a detached promise. Transient — retry gets a complete body.
  "unexpected end of json input",
];

function readErrorCode(err: Error): string | undefined {
  if ("code" in err && typeof err.code === "string") {
    return err.code;
  }
  return undefined;
}

export function isTransientNetworkError(err: unknown): boolean {
  // Walk the cause chain (undici puts the real socket error under `cause`).
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = readErrorCode(current);
    if (code !== undefined && TRANSIENT_CODES.has(code)) return true;
    const message = current.message.toLowerCase();
    if (TRANSIENT_MESSAGE_FRAGMENTS.some((f) => message.includes(f))) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
