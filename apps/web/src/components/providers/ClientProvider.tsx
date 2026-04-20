"use client";

import { useEffect, useState } from "react";
import {
  ConvexReactClient,
  useConvexAuth,
  useMutation,
  AuthLoading,
  Authenticated,
  Unauthenticated,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/clerk-react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Navigate } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { Toaster } from "sonner";
import { TooltipProvider, Spinner } from "@vmem/ui";
import { ThemeProvider } from "@/components/contexts/ThemeContext";
import { NotificationProvider } from "@/components/contexts/NotificationContext";
import { MemoryProvider } from "@/components/contexts/MemoryContext";
import { LocalLLMProvider } from "@/components/contexts/LocalLLMContext";
import { VoiceProvider } from "@/components/contexts/VoiceContext";
import { PendingEnrichmentRunner } from "@/components/PendingEnrichmentRunner";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { env } from "@/env";
import { api } from "@vmem/backend";

if (!env.VITE_CONVEX_URL) {
  throw new Error("Missing VITE_CONVEX_URL in your .env file");
}

export const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

// Tracks whether the user has been signed in during this page session.
// Used by useStableAuth to detect unexpected auth loss (stale deployment).
let wasEverSignedIn = false;

/**
 * Wraps Clerk's useAuth to debounce unexpected auth loss.
 *
 * When Vercel deploys a new version, stale JS can break Clerk's internals,
 * causing it to report isSignedIn:false even though the user has a valid session.
 * ConvexProviderWithClerk then clears the auth token, and the Convex server
 * re-evaluates every active subscription without auth — producing a burst of
 * "Not authenticated" errors in the Convex logs.
 *
 * To prevent this: when auth drops from signed-in → not-signed-in, we tell
 * Convex "auth is still loading" for 2 seconds. During that window:
 * - Stale deployment: page reloads, WebSocket closes, subscriptions drop cleanly
 * - Real logout: routes unmount via router (which reads Clerk directly),
 *   subscriptions are cleaned up, then the timer fires and propagates the real state
 *
 * In both cases Convex never re-evaluates subscriptions without auth.
 */
function useStableAuth() {
  const auth = useAuth();
  const [overrideLoading, setOverrideLoading] = useState(false);

  useEffect(() => {
    if (auth.isSignedIn) {
      wasEverSignedIn = true;
      setOverrideLoading(false);
      return;
    }

    // Was signed in and now not — debounce to avoid Convex auth cascade
    if (wasEverSignedIn && auth.isLoaded && !auth.isSignedIn) {
      setOverrideLoading(true);
      const timer = setTimeout(() => {
        wasEverSignedIn = false;
        setOverrideLoading(false);
      }, 2000);
      return () => clearTimeout(timer);
    }

    setOverrideLoading(false);
  }, [auth.isLoaded, auth.isSignedIn]);

  if (overrideLoading) {
    return { ...auth, isLoaded: false };
  }
  return auth;
}

function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensureUserExists = useMutation(api.auth.ensureUserExists);

  useEffect(() => {
    if (isAuthenticated) {
      ensureUserExists({}).catch(console.error);
    }
  }, [isAuthenticated, ensureUserExists]);

  return null;
}

function AppSkeleton() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Spinner size="lg" />
    </div>
  );
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useStableAuth}>
      <NuqsAdapter>
        <NextThemesProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <EnsureUser />
          <MotionProvider>
            <QueryProvider>{children}</QueryProvider>
          </MotionProvider>
        </NextThemesProvider>
      </NuqsAdapter>
    </ConvexProviderWithClerk>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <AppSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <Navigate to="/" />
      </Unauthenticated>
      <Authenticated>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            <NotificationProvider>
              <LocalLLMProvider>
                <VoiceProvider>
                  <MemoryProvider>
                    <PendingEnrichmentRunner />
                    {children}
                  </MemoryProvider>
                </VoiceProvider>
              </LocalLLMProvider>
            </NotificationProvider>
          </TooltipProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </Authenticated>
    </>
  );
}
