import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * GitHub OAuth callback — receives the authorization code from GitHub's redirect.
 * Delegates to handleGitHubCallbackInternal which validates the state, exchanges
 * the code for a token, and stores the encrypted connection.
 */
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

  const appUrl = result.returnUrl ?? "http://localhost:3000";

  if (result.error) {
    return Response.redirect(
      `${appUrl}/codebases?error=${encodeURIComponent(result.error)}`,
    );
  }

  return Response.redirect(`${appUrl}/codebases?connected=true`);
});
