"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemeProvider } from "../contexts/ThemeContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { useRouter } from "next/navigation";

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>["push"]>[1]
    >;
  }
}

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL environment variable");
}

const convex = new ConvexReactClient(convexUrl);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <ThemeProvider>
          <HeroUIProvider
            disableAnimation={true}
            skipFramerMotionAnimations={false}
            navigate={router.push}
          >
            <ToastProvider placement="top-center" />
            <NotificationProvider>{children}</NotificationProvider>
          </HeroUIProvider>
        </ThemeProvider>
      </NextThemesProvider>
    </ConvexProviderWithClerk>
  );
}
