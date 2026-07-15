import { ThemeProvider as NextThemesProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { MotionProvider } from "@/providers/MotionProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { EnsureUser } from "@/providers/EnsureUser";

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
