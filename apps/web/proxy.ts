import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { serverEnv } from "./env/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/api(.*)",
  "/agent-callback(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  if (req.nextUrl.pathname === "/" && !userId) {
    if (
      req.nextUrl.searchParams.has("agent") &&
      serverEnv.AGENT_CLERK_USER_ID
    ) {
      const loginUrl = new URL("/api/auth/agent-login", req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (req.nextUrl.pathname === "/" && userId) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
