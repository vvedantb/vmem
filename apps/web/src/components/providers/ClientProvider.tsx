import { ThemeProvider as NextThemesProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { EnsureUser } from "@/components/providers/EnsureUser";

export function ClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexClientProvider>
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
    </ConvexClientProvider>
  );
}
