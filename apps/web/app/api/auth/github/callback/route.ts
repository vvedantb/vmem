import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@vmem/backend";

/** Shape of GitHub's OAuth token exchange response. */
type GitHubTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** Subset of GitHub user we care about. */
type GitHubUser = {
  login: string;
  avatar_url: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/codebases?error=no_code", request.url),
    );
  }

  // --- Exchange code for access token ---
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL("/codebases?error=token_exchange_failed", request.url),
    );
  }

  const tokenData: GitHubTokenResponse = await tokenRes.json();

  if (!tokenData.access_token) {
    const errorParam = tokenData.error ?? "no_token";
    return NextResponse.redirect(
      new URL(`/codebases?error=${errorParam}`, request.url),
    );
  }

  // --- Fetch GitHub user info ---
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!userRes.ok) {
    return NextResponse.redirect(
      new URL("/codebases?error=user_fetch_failed", request.url),
    );
  }

  const userData: GitHubUser = await userRes.json();

  // --- Get Clerk auth token for Convex ---
  const { getToken } = await auth();
  const convexToken = await getToken({ template: "convex" });

  if (!convexToken) {
    return NextResponse.redirect(
      new URL("/codebases?error=not_authenticated", request.url),
    );
  }

  // --- Store connection in Convex ---
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.redirect(
      new URL("/codebases?error=convex_not_configured", request.url),
    );
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(convexToken);
    await convex.action(api.github.storeConnection, {
      githubUsername: userData.login,
      accessToken: tokenData.access_token,
      avatarUrl: userData.avatar_url,
    });
  } catch (err) {
    console.error("Failed to store GitHub connection:", err);
    return NextResponse.redirect(
      new URL("/codebases?error=store_failed", request.url),
    );
  }

  return NextResponse.redirect(
    new URL("/codebases?connected=true", request.url),
  );
}
