import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { connectorCallbackHtml } from "./connectorCallbackHtml";

export const connectorCallback = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response(
      connectorCallbackHtml("missing_params", null, "http://localhost:3000"),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  const result = await ctx.runAction(
    internal.connectors.oauth.handleCallbackInternal,
    { code, state },
  );

  const frontendUrl = result.frontendUrl ?? "http://localhost:3000";

  return new Response(
    connectorCallbackHtml(result.error, result.connectorId, frontendUrl),
    { headers: { "Content-Type": "text/html" } },
  );
});
