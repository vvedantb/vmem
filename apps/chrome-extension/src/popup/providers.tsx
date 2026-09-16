import { ClerkProvider, useAuth } from "@clerk/chrome-extension";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { TooltipProvider } from "@vmem/ui";
import {
  CLERK_COOKIE_SYNC_HOST,
  CLERK_PUBLISHABLE_KEY,
  CONVEX_URL,
} from "@/lib/constants";

const convex = new ConvexReactClient(CONVEX_URL);
const POPUP_URL = chrome.runtime.getURL("popup.html");

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl={POPUP_URL}
      signInFallbackRedirectUrl={POPUP_URL}
      signUpFallbackRedirectUrl={POPUP_URL}
      syncHost={CLERK_COOKIE_SYNC_HOST}
      __experimental_syncHostListener
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
