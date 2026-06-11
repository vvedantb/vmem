import { createFileRoute, redirect } from "@tanstack/react-router";
import { WorkspaceEntryRedirect } from "@/components/workspace/WorkspaceEntryRedirect";
import { consumeMcpOauthParams } from "@/lib/mcpOauthStorage";

/**
 * `/home` is the post-login entry point (Clerk's signInFallbackRedirectUrl,
 * the agent-callback target, and the MCP OAuth bounce). It no longer renders
 * the dashboard — it resolves which workspace the user should land in and
 * redirects to `/$profileId/home`.
 */
export const Route = createFileRoute("/_main/home")({
  // If the user landed here mid-MCP OAuth flow (Clerk's prod handshake can
  // redirect to the global `signInFallbackRedirectUrl` before our authorize
  // route can mint the code), bounce them back into the flow.
  beforeLoad: () => {
    const pending = consumeMcpOauthParams();
    if (pending) {
      throw redirect({
        to: "/mcp/oauth/authorize",
        search: pending,
      });
    }
  },
  component: WorkspaceEntry,
});

function WorkspaceEntry() {
  return <WorkspaceEntryRedirect subPath="/home" />;
}
