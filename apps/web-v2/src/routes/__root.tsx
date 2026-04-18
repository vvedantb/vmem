import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { NuqsAdapter } from "nuqs/adapters/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@vmem/ui";
import { ThemeProvider } from "@/components/contexts/ThemeContext";
import { NotificationProvider } from "@/components/contexts/NotificationContext";
import { MemoryProvider } from "@/components/contexts/MemoryContext";
import { LocalLLMProvider } from "@/components/contexts/LocalLLMContext";
import { PendingEnrichmentRunner } from "@/components/PendingEnrichmentRunner";
import { VoiceProvider } from "@/components/contexts/VoiceContext";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { env } from "@/env";

const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ClerkProvider publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}>
      <NuqsAdapter>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <NextThemesProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <MotionProvider>
              <QueryProvider>
                <ThemeProvider>
                  <TooltipProvider>
                    <NotificationProvider>
                      <LocalLLMProvider>
                        <VoiceProvider>
                          <MemoryProvider>
                            <PendingEnrichmentRunner />
                            <Outlet />
                          </MemoryProvider>
                        </VoiceProvider>
                      </LocalLLMProvider>
                    </NotificationProvider>
                  </TooltipProvider>
                  <Toaster position="top-center" />
                </ThemeProvider>
              </QueryProvider>
            </MotionProvider>
          </NextThemesProvider>
        </ConvexProviderWithClerk>
      </NuqsAdapter>
    </ClerkProvider>
  );
}
