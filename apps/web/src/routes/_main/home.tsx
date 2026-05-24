import { createFileRoute, redirect } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import Dashboard from "@/components/Dashboard";
import { consumeMcpOauthParams } from "@/lib/mcpOauthStorage";

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
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <PageContainer title="Dashboard" centeredMaxWidth showTitle>
      <Dashboard />
    </PageContainer>
  );
}
