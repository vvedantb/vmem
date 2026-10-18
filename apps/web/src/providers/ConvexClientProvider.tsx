import { useStableAuth } from "@vvedantb/ui";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { convex } from "@/lib/convex-client";

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
