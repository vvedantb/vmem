import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/api(.*)",
  "/agent-callback(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  if (
    req.nextUrl.pathname === "/" &&
    !userId &&
    req.nextUrl.searchParams.has("agent") &&
    process.env.AGENT_CLERK_USER_ID
  ) {
    const loginUrl = new URL("/api/auth/agent-login", req.url);
    return NextResponse.redirect(loginUrl);
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
