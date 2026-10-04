import { addTransitionType, startTransition } from "react";
import type { AnyRouter, NavigateOptions } from "@tanstack/react-router";

/*
 * View transitions (CSS lives at the bottom of globals.css).
 *
 * Route changes: TanStack Router commits through useSyncExternalStore, which
 * React never treats as a transition, so `<ViewTransition>` can't see them.
 * The router's own `viewTransition` option wraps the commit in
 * `document.startViewTransition` with a type, and globals.css only assigns
 * `view-transition-name` while that type is active.
 *
 * In-page updates (local state, optimistic Convex writes) use React's
 * `<ViewTransition>` inside `startTransition`.
 *
 * Browser support: without the View Transitions API everything swaps
 * instantly. Without transition types (`:active-view-transition-type`) the
 * router skips transitions too, since globals.css scopes names by type.
 * `prefers-reduced-motion: reduce` skips router transitions and zeroes every
 * view transition animation in CSS. The Experimental "Disable page animations"
 * flag (`html[data-page-motion=off]`) does the same for signed-in users.
 */

// AnyRouter: the registered router's type depends on this module
type RouterViewTransition = Exclude<
  NonNullable<NavigateOptions<AnyRouter>["viewTransition"]>,
  boolean
>;

// the slice of the router's location change info that we read
interface LocationChange {
  fromLocation?: { pathname: string };
  toLocation: { pathname: string };
  pathChanged: boolean;
}

// `:active-view-transition-type(...)` values used in globals.css
export const VIEW_TRANSITION_TYPE = {
  route: "vmem-route",
  memoryDetail: "vmem-memory-detail",
  listRemove: "vmem-list-remove",
} as const;

// `data-vt` hooks that globals.css names during typed transitions
export const VIEW_TRANSITION_TARGET = {
  sidebar: "sidebar",
  routeTabs: "route-tabs",
  memoryPanel: "memory-panel",
  memoryTitle: "memory-title",
} as const;

// shared by the router rule in globals.css and the React boundary
export const MEMORY_PANEL_TRANSITION_NAME = "vmem-memory-panel";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Convex experimental `disablePageMotion` stamped by `PageMotionProvider`. */
export function pageMotionDisabled(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.pageMotion === "off"
  );
}

function skipPageMotion(): boolean {
  return prefersReducedMotion() || pageMotionDisabled();
}

function supportsViewTransitionTypes(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("selector(:active-view-transition-type(a))")
  );
}

// landing, public slides and the agent callback keep instant swaps
function isShellPath(pathname: string): boolean {
  return (
    pathname !== "/" &&
    !pathname.startsWith("/slides") &&
    !pathname.startsWith("/agent-callback")
  );
}

// crossfade only real page changes inside the app shell (not first load or
// search-only updates like filters and view toggles)
export function routeTransitionTypes(
  change: LocationChange,
  reducedMotion: boolean = skipPageMotion(),
): string[] | false {
  const from = change.fromLocation;
  if (from === undefined || !change.pathChanged || reducedMotion) return false;
  if (!isShellPath(from.pathname) || !isShellPath(change.toLocation.pathname)) {
    return false;
  }
  return [VIEW_TRANSITION_TYPE.route];
}

// router-wide default, undefined leaves navigation instant
export function defaultRouterViewTransition():
  | RouterViewTransition
  | undefined {
  if (!supportsViewTransitionTypes()) return undefined;
  return { types: (change) => routeTransitionTypes(change) };
}

// memory list ↔ detail panel, overrides the route crossfade
export function memoryDetailViewTransition(): RouterViewTransition | false {
  if (!supportsViewTransitionTypes()) return false;
  return {
    types: () =>
      skipPageMotion() ? false : [VIEW_TRANSITION_TYPE.memoryDetail],
  };
}

// optimistic list removals, lets `<ViewTransition>` rows exit and reflow
export function startListRemoveTransition(update: () => void): void {
  if (skipPageMotion()) {
    update();
    return;
  }
  startTransition(() => {
    addTransitionType(VIEW_TRANSITION_TYPE.listRemove);
    update();
  });
}
