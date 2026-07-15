"use client";

import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import { useTheme } from "next-themes";
import { Navigate } from "@tanstack/react-router";
import { SonnerToaster, TooltipProvider } from "@vmem/ui";
import { AppSkeleton } from "@/components/AppSkeleton";
import { ThemeProvider } from "@/components/contexts/ThemeContext";
import { NotificationProvider } from "@/components/contexts/NotificationContext";
import { MemoryProvider } from "@/components/contexts/MemoryContext";

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
