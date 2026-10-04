import { ThemeProvider as NextThemesProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { useRouterState } from "@tanstack/react-router";
import { MotionProvider } from "@/providers/MotionProvider";
import { PageMotionProvider } from "@/providers/PageMotionProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { EnsureUser } from "@/providers/EnsureUser";
import { slidesPublicBoot } from "@/lib/slides-public-boot";

export function ClientProvider({ children }: { children: React.ReactNode }) {
  // Public marketing page is dark-only, matching vibot/verve. Do not persist
  // this through next-themes storage — signed-in app chrome keeps its own theme.
  const isLanding = useRouterState({
    select: (state) => state.location.pathname === "/",
  });

  return (
    <ConvexClientProvider>
      <NuqsAdapter>
        <NextThemesProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={!isLanding}
          forcedTheme={isLanding ? "dark" : undefined}
          disableTransitionOnChange
        >
          {!slidesPublicBoot && <EnsureUser />}
          <MotionProvider>
            <PageMotionProvider>
              <QueryProvider>{children}</QueryProvider>
            </PageMotionProvider>
          </MotionProvider>
        </NextThemesProvider>
      </NuqsAdapter>
    </ConvexClientProvider>
  );
}
