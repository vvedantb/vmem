import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { routeTree } from "./routeTree.gen";
import { env } from "./env";
import { convex } from "./lib/convex-client";
import { AppSkeleton } from "./components/shell/AppSkeleton";
import { installStaleDeployReload } from "@vvedantb/ui/client";
import { defaultRouterViewTransition } from "./lib/view-transitions";
import "./globals.css";

// reload once when a deploy serves stale chunk hashes
installStaleDeployReload({ onBeforeReload: () => void convex.close() });

const router = createRouter({
  routeTree,
  context: { isSignedIn: false },
  defaultViewTransition: defaultRouterViewTransition(),
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
