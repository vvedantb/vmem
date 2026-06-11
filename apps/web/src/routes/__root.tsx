import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ClientProvider } from "@/components/providers/ClientProvider";
import { LegacyPathRedirect } from "@/components/workspace/LegacyPathRedirect";

export interface RouterContext {
  isSignedIn: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  // Unmatched paths land here (inside ClientProvider, so Convex/Clerk hooks
  // work). Multi-segment pre-workspace URLs like /memories/graph get
  // re-prefixed with the default workspace; everything else is a real 404.
  notFoundComponent: LegacyPathRedirect,
});

function RootComponent() {
  return (
    <ClientProvider>
      <Outlet />
    </ClientProvider>
  );
}
