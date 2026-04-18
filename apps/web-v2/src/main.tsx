import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { routeTree } from "./routeTree.gen";
import { env } from "./env";
import { AppSkeleton } from "./components/AppSkeleton";
import "./globals.css";

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
