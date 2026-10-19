import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { useRouterState } from "@tanstack/react-router";
import { MotionProvider } from "@/providers/MotionProvider";
import { PageMotionProvider } from "@/providers/PageMotionProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { ThemeProvider } from "@/providers/theme";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { EnsureUser } from "@/providers/EnsureUser";

export function ClientProvider({ children }: { children: React.ReactNode }) {
  // Public marketing page is dark-only, matching vibot/verve. Do not persist
  // this through theme storage — signed-in app chrome keeps its own theme.
  const isLanding = useRouterState({
    select: (state) => state.location.pathname === "/",
  });

  return (
    <ConvexClientProvider>
      <NuqsAdapter>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={!isLanding}
          forcedTheme={isLanding ? "dark" : undefined}
          disableTransitionOnChange
        >
          <EnsureUser />
          <MotionProvider>
            <PageMotionProvider>
              <QueryProvider>{children}</QueryProvider>
            </PageMotionProvider>
          </MotionProvider>
        </ThemeProvider>
      </NuqsAdapter>
    </ConvexClientProvider>
  );
}
