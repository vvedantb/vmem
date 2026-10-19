import { ConvexClerkProvider } from "@vvedantb/convex-client";
import { useStableAuth } from "@vvedantb/ui";
import { convex } from "@/lib/convex-client";

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexClerkProvider client={convex} useAuth={useStableAuth}>
      {children}
    </ConvexClerkProvider>
  );
}
