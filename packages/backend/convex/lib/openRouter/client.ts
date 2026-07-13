/**
 * OpenRouter client factory.
 */

import { OpenRouter } from "@openrouter/sdk";

export const OPENROUTER_HTTP_REFERER = "https://vmem.vedantb.com";
export const OPENROUTER_APP_TITLE = "vmem";

export function createOpenRouterClient(apiKey: string): OpenRouter {
  return new OpenRouter({
    apiKey,
    httpReferer: OPENROUTER_HTTP_REFERER,
    appTitle: OPENROUTER_APP_TITLE,
  });
}
