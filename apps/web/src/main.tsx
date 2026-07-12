import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { routeTree } from "./routeTree.gen";
import { env } from "./env";
import { convex } from "./components/providers/ClientProvider";
import { AppSkeleton } from "./components/AppSkeleton";
import { isChunkLoadError } from "./lib/utils/isChunkLoadError";
import { saveMcpOauthParamsFromUrl } from "./lib/mcpOauthStorage";
import "./globals.css";

// Snapshot MCP OAuth params before ClerkProvider mounts. With prod Clerk live
// keys, the cross-domain session handshake on the popup's first paint can
// redirect `/mcp/oauth/authorize` to `/home`, stripping the search params we
// need to mint the auth code. Stashing them in sessionStorage here lets the
// `/home` route detect a pending flow and bounce back into it.
saveMcpOauthParamsFromUrl();

/**
 * Handles stale deployment detection: closes the Convex WebSocket to prevent
 * a cascade of "Not authenticated" server errors, then reloads the page.
 */
function handleStaleDeployment(event: Event) {
  event.preventDefault();
  try {
    convex.close();
  } catch {
    // WebSocket may already be closed
  }
  window.location.reload();
}

// After a new Vercel deployment, cached HTML may reference old chunk hashes that no longer exist.
// Reload the page so the browser fetches the new HTML with correct asset references.
window.addEventListener("vite:preloadError", handleStaleDeployment);

// Catch chunk loading failures that bypass Vite's preload detection
// (e.g. dynamic imports triggered by route navigation or lazy components).
window.addEventListener("error", (event) => {
  if (event.error instanceof Error && isChunkLoadError(event.error)) {
    handleStaleDeployment(event);
  }
});
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof Error && isChunkLoadError(event.reason)) {
    handleStaleDeployment(event);
  }
});

const router = createRouter({
  routeTree,
  context: { isSignedIn: false },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <AppSkeleton />;
  }

  return (
    <RouterProvider
      router={router}
      context={{ isSignedIn: isSignedIn ?? false }}
    />
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ClerkProvider
        publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}
        signInFallbackRedirectUrl="/home"
        signUpFallbackRedirectUrl="/home"
      >
        <InnerApp />
      </ClerkProvider>
    </StrictMode>,
  );
}
