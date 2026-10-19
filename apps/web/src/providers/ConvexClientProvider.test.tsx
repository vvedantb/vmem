// Pins which Convex provider ConvexClientProvider renders: the Clerk one,
// driven by useStableAuth, over the shared app client.
import { renderToString } from "react-dom/server";
import { ConvexReactClient, useConvex, useConvexAuth } from "convex/react";
import { describe, expect, it, vi } from "vitest";
import { ConvexClientProvider } from "./ConvexClientProvider";

const mocks = vi.hoisted(() => {
  const client: { current: ConvexReactClient | null } = { current: null };
  return {
    useStableAuth: vi.fn(() => ({
      isLoaded: true,
      isSignedIn: false,
      getToken: async () => null,
      orgId: undefined,
      orgRole: undefined,
    })),
    client,
  };
});

vi.mock("@vvedantb/ui", () => ({ useStableAuth: mocks.useStableAuth }));
vi.mock("@/lib/convex-client", () => {
  const convex = new ConvexReactClient("https://pin-test.convex.cloud");
  mocks.client.current = convex;
  return { convex };
});

describe("ConvexClientProvider", () => {
  it("provides the app client with auth from useStableAuth", () => {
    const seen: { sameClient: boolean; auth: string }[] = [];
    function Probe() {
      const client = useConvex();
      const { isLoading, isAuthenticated } = useConvexAuth();
      seen.push({
        sameClient: client === mocks.client.current,
        auth: `${isLoading}/${isAuthenticated}`,
      });
      return <span>child</span>;
    }
    const html = renderToString(
      <ConvexClientProvider>
        <Probe />
      </ConvexClientProvider>,
    );
    expect(html).toBe("<span>child</span>");
    expect(seen).toEqual([{ sameClient: true, auth: "false/false" }]);
    expect(mocks.useStableAuth).toHaveBeenCalled();
  });
});
