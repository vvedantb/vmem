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
