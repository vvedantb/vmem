import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
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

export interface RouterContext {
  isSignedIn: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <NuqsAdapter>
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
      </NuqsAdapter>
    </ConvexProviderWithClerk>
  );
}
