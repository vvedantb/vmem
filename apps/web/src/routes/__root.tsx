import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ClientProvider } from "@/components/providers/ClientProvider";
import { LegacyPathRedirect } from "@/components/workspace/LegacyPathRedirect";

export interface RouterContext {
  isSignedIn: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  // unmatched paths land here (inside ClientProvider, so Convex/Clerk hooks work)
  notFoundComponent: LegacyPathRedirect,
});

function RootComponent() {
  return (
    <ClientProvider>
      <Outlet />
    </ClientProvider>
  );
}
