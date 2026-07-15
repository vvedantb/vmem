import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { routeTree } from "./routeTree.gen";
import { env } from "./env";
import { convex } from "./lib/convex-client";
import { AppSkeleton } from "./components/shell/AppSkeleton";
import { isChunkLoadError } from "./lib/utils/isChunkLoadError";
import { saveMcpOauthParamsFromUrl } from "./lib/mcpOauthStorage";
import "./globals.css";

// snapshot MCP OAuth params before ClerkProvider mounts
saveMcpOauthParamsFromUrl();

// handles stale deployment detection
function handleStaleDeployment(event: Event) {
  event.preventDefault();
  try {
    void convex.close();
  } catch {
    // webSocket may already be closed
  }
  window.location.reload();
}

// after a new Vercel deployment, cached HTML may reference old chunk hashes that no longer exist
// reload the page so the browser fetches the new HTML with correct asset references
window.addEventListener("vite:preloadError", handleStaleDeployment);

// catch chunk loading failures that bypass Vite's preload detection
// (e.g. dynamic imports triggered by route navigation or lazy components)
window.addEventListener("error", (event) => {
  if (isChunkLoadError(event.error)) {
    handleStaleDeployment(event);
  }
});
window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadError(event.reason)) {
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
