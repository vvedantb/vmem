import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { routeTree } from "./routeTree.gen";
import { env } from "./env";
import { convex } from "./lib/convex-client";
import { AppSkeleton } from "./components/shell/AppSkeleton";
import { isChunkLoadError } from "./lib/utils/isChunkLoadError";
import "./globals.css";

// reload when deploy serves stale chunk hashes
function handleStaleDeployment(event: Event) {
  event.preventDefault();
  try {
    void convex.close();
  } catch {
    // socket may already be closed during teardown
  }
  window.location.reload();
}

// vite preload errors mean cached html points at removed chunks
window.addEventListener("vite:preloadError", handleStaleDeployment);

// route lazy imports can fail the same way outside preload
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
