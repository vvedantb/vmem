"use client";

import { ConvexProviderWithClerk } from "convex/react-clerk";
import { convex } from "@/lib/convex-client";
import { useStableAuth } from "@/hooks/useStableAuth";

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useStableAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
