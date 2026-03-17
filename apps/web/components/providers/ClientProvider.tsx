"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";
import { ThemeProvider } from "../contexts/ThemeContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { MemoryProvider } from "../contexts/MemoryContext";
import { MotionProvider } from "./MotionProvider";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL environment variable");
}

const convex = new ConvexReactClient(convexUrl);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <NextThemesProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <MotionProvider>
            <ThemeProvider>
              <NotificationProvider>
                <MemoryProvider>{children}</MemoryProvider>
              </NotificationProvider>
              <Toaster position="top-center" />
            </ThemeProvider>
          </MotionProvider>
        </NextThemesProvider>
      </ConvexProviderWithClerk>
    </NuqsAdapter>
  );
}
