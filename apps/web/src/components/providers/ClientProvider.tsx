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
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Navigate } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { SonnerToaster, TooltipProvider } from "@vmem/ui";
import { AppSkeleton } from "@/components/AppSkeleton";
import { ThemeProvider } from "@/components/contexts/ThemeContext";
import { NotificationProvider } from "@/components/contexts/NotificationContext";
import { MemoryProvider } from "@/components/contexts/MemoryContext";

import { MotionProvider } from "@/components/providers/MotionProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { env } from "@/env";
import { api } from "@vmem/backend";

if (!env.VITE_CONVEX_URL) {
  throw new Error("Missing VITE_CONVEX_URL in your .env file");
}

export const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

// tracks whether the user has been signed in during this page session
// used by useStableAuth to detect unexpected auth loss (stale deployment)
let wasEverSignedIn = false;

// debounce clerk auth loss after stale post-deploy js (avoids convex auth cascade)
function useStableAuth() {
  const auth = useAuth();
  const [overrideLoading, setOverrideLoading] = useState(false);

  useEffect(() => {
    if (auth.isSignedIn) {
      wasEverSignedIn = true;
      setOverrideLoading(false);
      return;
    }

    // was signed in and now not — debounce to avoid Convex auth cascade
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

// forward resolved theme to sonner (light until next-themes hydrates)
function ThemedSonnerToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      position="top-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
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
              <MemoryProvider>{children}</MemoryProvider>
            </NotificationProvider>
          </TooltipProvider>
          <ThemedSonnerToaster />
        </ThemeProvider>
      </Authenticated>
    </>
  );
}
