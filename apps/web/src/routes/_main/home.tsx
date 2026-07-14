import { createFileRoute, redirect } from "@tanstack/react-router";
import { WorkspaceEntryRedirect } from "@/components/workspace/WorkspaceEntryRedirect";
import { consumeMcpOauthParams } from "@/lib/mcpOauthStorage";

// `/home` is the post-login entry point (Clerk's signInFallbackRedirectUrl, the
export const Route = createFileRoute("/_main/home")({
  // if the user landed here mid-MCP OAuth flow (Clerk's prod handshake can redirect
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
