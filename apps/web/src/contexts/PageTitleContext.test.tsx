// @vitest-environment happy-dom
// Pins PageTitleProvider/usePageTitle values, the no-provider default, and the
// PageContainer title sync (set on mount/change, cleared on unmount, no
// document.title writes).
import { act } from "react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PageContainer from "@/components/shell/PageContainer";
import { mount, resetDocument, type Mounted } from "@/test/dom";
import { PageTitleProvider, usePageTitle } from "./PageTitleContext";

type Value = ReturnType<typeof usePageTitle>;
const seen: { current: Value | null } = { current: null };

function record(value: Value) {
  seen.current = value;
}

function Probe() {
  const title = usePageTitle();
  record(title);
  return <output>{title.pageTitle}</output>;
}

function value(): Value {
  if (!seen.current) throw new Error("probe did not render");
  return seen.current;
}

// happy-dom rejects cancelled WAAPI animations; the entry motion is not pinned.
MotionGlobalConfig.skipAnimations = true;

let mounted: Mounted | null = null;

beforeEach(() => {
  resetDocument();
  seen.current = null;
});

afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
});

describe("PageTitleContext", () => {
  it("provides an empty title and a setter", async () => {
    mounted = await mount(
      <PageTitleProvider>
        <Probe />
      </PageTitleProvider>,
    );
    expect(value().pageTitle).toBe("");
    expect(Object.keys(value()).sort()).toEqual(["pageTitle", "setPageTitle"]);

    await act(async () => value().setPageTitle("Memories"));
    expect(value().pageTitle).toBe("Memories");
    expect(document.querySelector("output")?.textContent).toBe("Memories");
  });

  it("falls back to an inert default without a provider (no throw)", async () => {
    mounted = await mount(<Probe />);
    expect(value().pageTitle).toBe("");
    act(() => value().setPageTitle("Ignored"));
    expect(value().pageTitle).toBe("");
  });
});

describe("PageContainer title sync", () => {
  const page = (title: string | undefined, show = true) => (
    <PageTitleProvider>
      {show ? (
        <PageContainer title={title}>
          <p>body</p>
        </PageContainer>
      ) : null}
      <Probe />
    </PageTitleProvider>
  );

  it("sets on mount, follows changes, clears on unmount", async () => {
    mounted = await mount(page("Memories"));
    expect(value().pageTitle).toBe("Memories");

    await mounted.rerender(page("Inbox"));
    expect(value().pageTitle).toBe("Inbox");

    await mounted.rerender(page(undefined));
    expect(value().pageTitle).toBe("");

    await mounted.rerender(page("Skills"));
    expect(value().pageTitle).toBe("Skills");

    await mounted.rerender(page("Skills", false));
    expect(value().pageTitle).toBe("");
  });

  it("never writes document.title", async () => {
    mounted = await mount(page("Memories"));
    await mounted.rerender(page("Inbox"));
    await mounted.rerender(page("Inbox", false));
    expect(document.title).toBe("vmem");
  });
});
