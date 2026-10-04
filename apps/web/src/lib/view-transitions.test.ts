import { describe, expect, it } from "vitest";
import {
  VIEW_TRANSITION_TYPE,
  defaultRouterViewTransition,
  memoryDetailViewTransition,
  pageMotionDisabled,
  routeTransitionTypes,
} from "./view-transitions";

function change(from: string | undefined, to: string) {
  return {
    fromLocation: from === undefined ? undefined : { pathname: from },
    toLocation: { pathname: to },
    pathChanged: from !== to,
  };
}

describe("routeTransitionTypes", () => {
  it("crossfades page changes inside the app shell", () => {
    expect(
      routeTransitionTypes(change("/p1/home", "/p1/memories"), false),
    ).toEqual([VIEW_TRANSITION_TYPE.route]);
    expect(
      routeTransitionTypes(
        change("/settings/usage", "/settings/profiles"),
        false,
      ),
    ).toEqual([VIEW_TRANSITION_TYPE.route]);
  });

  it("skips first load and search-only updates", () => {
    expect(routeTransitionTypes(change(undefined, "/p1/home"), false)).toBe(
      false,
    );
    expect(
      routeTransitionTypes(
        change("/p1/memories/list", "/p1/memories/list"),
        false,
      ),
    ).toBe(false);
  });

  it("skips pages outside the shell", () => {
    expect(routeTransitionTypes(change("/", "/home"), false)).toBe(false);
    expect(routeTransitionTypes(change("/p1/home", "/slides"), false)).toBe(
      false,
    );
    expect(
      routeTransitionTypes(change("/agent-callback", "/home"), false),
    ).toBe(false);
  });

  it("respects reduced motion", () => {
    expect(routeTransitionTypes(change("/p1/home", "/p1/wiki"), true)).toBe(
      false,
    );
  });

  it("does not skip page motion without the html flag", () => {
    expect(pageMotionDisabled()).toBe(false);
  });
});

describe("feature detection", () => {
  it("stays instant without the View Transitions API", () => {
    expect(defaultRouterViewTransition()).toBeUndefined();
    expect(memoryDetailViewTransition()).toBe(false);
  });
});
