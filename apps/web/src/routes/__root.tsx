import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@vmem/ui";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { env } from "@/env";

export const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

export interface RouterContext {
  isSignedIn: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

// Root component only contains providers that don't require authentication.
// Auth-dependent providers (ThemeProvider, MemoryProvider, etc.) are in _main/route.tsx
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
              <TooltipProvider>
                <Outlet />
              </TooltipProvider>
              <Toaster position="top-center" />
            </QueryProvider>
          </MotionProvider>
        </NextThemesProvider>
      </NuqsAdapter>
    </ConvexProviderWithClerk>
  );
}
