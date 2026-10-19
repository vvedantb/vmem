import { Component, type ReactNode } from "react";
import { ClerkProvider, useAuth } from "@clerk/chrome-extension";
import { ConvexReactClient } from "convex/react";
import { ConvexClerkProvider } from "@vvedantb/convex-client";
import { TooltipProvider } from "@vvedantb/ui";
import {
  CLERK_COOKIE_SYNC_HOST,
  CLERK_PUBLISHABLE_KEY,
  CONVEX_URL,
} from "@/lib/constants";

const convex = new ConvexReactClient(CONVEX_URL);
const POPUP_URL = chrome.runtime.getURL("popup.html");

const instrumentSans = '"Instrument Sans", system-ui, sans-serif';

// A Clerk boot throw must not blank the popup. Render nothing so the static
// #boot fallback in popup/index.html shows (it appears when #root is empty).
class BootBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    console.error("[vmem popup] boot failed", error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <BootBoundary>
      <ClerkProvider
        publishableKey={CLERK_PUBLISHABLE_KEY}
        afterSignOutUrl={POPUP_URL}
        signInFallbackRedirectUrl={POPUP_URL}
        signUpFallbackRedirectUrl={POPUP_URL}
        syncHost={CLERK_COOKIE_SYNC_HOST}
        __experimental_syncHostListener
        appearance={{ variables: { fontFamily: instrumentSans } }}
      >
        <ConvexClerkProvider client={convex} useAuth={useAuth}>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </ConvexClerkProvider>
      </ClerkProvider>
    </BootBoundary>
  );
}
