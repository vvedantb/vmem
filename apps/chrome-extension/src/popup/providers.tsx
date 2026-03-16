import { ClerkProvider, useAuth } from "@clerk/chrome-extension";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import {
  CLERK_PUBLISHABLE_KEY,
  CLERK_SYNC_HOST,
  CONVEX_URL,
} from "@/lib/constants";

const convex = new ConvexReactClient(CONVEX_URL);
const EXTENSION_URL = chrome.runtime.getURL(".");

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl={`${EXTENSION_URL}/popup/index.html`}
      signInFallbackRedirectUrl={`${EXTENSION_URL}/popup/index.html`}
      signUpFallbackRedirectUrl={`${EXTENSION_URL}/popup/index.html`}
      syncHost={CLERK_SYNC_HOST}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
