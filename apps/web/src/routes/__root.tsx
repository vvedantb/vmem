import {
  createRootRouteWithContext,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { ClientProvider } from "@/providers/ClientProvider";
import { LegacyPathRedirect } from "@/components/workspace/LegacyPathRedirect";
import {
  slidesPublicBoot,
  shouldFullLoadClerkOnNavigate,
} from "@/lib/slides-public-boot";

export interface RouterContext {
  isSignedIn: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ location }) => {
    if (!shouldFullLoadClerkOnNavigate(slidesPublicBoot, location.pathname)) {
      return;
    }
    // No-Clerk `/slides` tree navigating to an authenticated (or landing) route
    // — full page load so ClerkProvider can mount. SPA continue would render
    // Clerk hooks (e.g. landing SignInButton) without a provider.
    const href = `${location.pathname}${location.searchStr}${location.hash}`;
    window.location.assign(href);
    throw redirect({ href, reloadDocument: true });
  },
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
