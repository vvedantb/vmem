import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

export const githubCallback = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  const result = await ctx.runAction(
    internal.github.handleGitHubCallbackInternal,
    { code, state },
  );

  const redirectTo = new URL(result.returnUrl ?? "http://localhost:3000");

  if (result.error) {
    redirectTo.searchParams.set("error", result.error);
  } else {
    redirectTo.searchParams.set("connected", "true");
  }

  return Response.redirect(redirectTo.toString());
});
