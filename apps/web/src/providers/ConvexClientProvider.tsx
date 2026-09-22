import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { convex } from "@/lib/convex-client";
import { useStableAuth } from "@/hooks/useStableAuth";
import { slidesPublicBoot } from "@/lib/slides-public-boot";

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // `/slides` booted without ClerkProvider (preview / Clerk-disallowed hosts).
  // ConvexProviderWithClerk → useStableAuth → useAuth requires Clerk.
  if (slidesPublicBoot) {
    return <ConvexProvider client={convex}>{children}</ConvexProvider>;
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useStableAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
