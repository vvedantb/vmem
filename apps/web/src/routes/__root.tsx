import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ClientProvider } from "@/components/providers/ClientProvider";

export interface RouterContext {
  isSignedIn: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ClientProvider>
      <Outlet />
    </ClientProvider>
  );
}
