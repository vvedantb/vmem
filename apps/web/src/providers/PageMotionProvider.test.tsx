// @vitest-environment happy-dom
// Pins PageMotionProvider: Convex flag query args, html[data-page-motion],
// useDisablePageMotion, and the nested MotionConfig reducedMotion.
import { use } from "react";
import { MotionConfigContext } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, resetDocument, type Mounted } from "@/test/dom";

const convex = vi.hoisted(() => {
  const state: {
    isAuthenticated: boolean;
    flags: { disablePageMotion?: boolean } | undefined;
    useQuery: ReturnType<typeof vi.fn>;
  } = { isAuthenticated: false, flags: undefined, useQuery: vi.fn() };
  return state;
});

vi.mock("@vmem/backend", () => ({
  api: { userSettings: { getExperimentalFlags: "getExperimentalFlags" } },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: convex.isAuthenticated,
    isLoading: false,
  }),
  useQuery: (...args: Array<string | object>) => {
    convex.useQuery(...args);
    return convex.flags;
  },
}));

const { PageMotionProvider, useDisablePageMotion } =
  await import("./PageMotionProvider");

const seen: { disabled: boolean | null; reducedMotion: string | null } = {
  disabled: null,
  reducedMotion: null,
};

function record(disabled: boolean, reducedMotion: string | null) {
  seen.disabled = disabled;
  seen.reducedMotion = reducedMotion;
}

function Probe() {
  const disabled = useDisablePageMotion();
  record(disabled, use(MotionConfigContext).reducedMotion ?? null);
  return null;
}

let mounted: Mounted | null = null;

beforeEach(() => {
  resetDocument();
  convex.isAuthenticated = false;
  convex.flags = undefined;
  convex.useQuery.mockClear();
  seen.disabled = null;
  seen.reducedMotion = null;
});

afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
});

const tree = (
  <PageMotionProvider>
    <Probe />
  </PageMotionProvider>
);

describe("PageMotionProvider", () => {
  it("skips the flags query when signed out and keeps motion on", async () => {
    mounted = await mount(tree);
    expect(convex.useQuery).toHaveBeenLastCalledWith(
      "getExperimentalFlags",
      "skip",
    );
    expect(document.documentElement.dataset.pageMotion).toBe("on");
    expect(seen).toEqual({ disabled: false, reducedMotion: "never" });
  });

  it("queries flags when signed in; loading keeps motion on", async () => {
    convex.isAuthenticated = true;
    mounted = await mount(tree);
    expect(convex.useQuery).toHaveBeenLastCalledWith(
      "getExperimentalFlags",
      {},
    );
    expect(document.documentElement.dataset.pageMotion).toBe("on");
    expect(seen).toEqual({ disabled: false, reducedMotion: "never" });
  });

  it("disablePageMotion turns motion off", async () => {
    convex.isAuthenticated = true;
    convex.flags = { disablePageMotion: true };
    mounted = await mount(tree);
    expect(document.documentElement.dataset.pageMotion).toBe("off");
    expect(seen).toEqual({ disabled: true, reducedMotion: "always" });

    convex.flags = { disablePageMotion: false };
    await mounted.rerender(
      <PageMotionProvider>
        <Probe />
      </PageMotionProvider>,
    );
    expect(document.documentElement.dataset.pageMotion).toBe("on");
    expect(seen).toEqual({ disabled: false, reducedMotion: "never" });
  });

  it("useDisablePageMotion is false outside the provider", async () => {
    mounted = await mount(<Probe />);
    expect(seen.disabled).toBe(false);
    expect(document.documentElement.dataset.pageMotion).toBeUndefined();
  });
});
