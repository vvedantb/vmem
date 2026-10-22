import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vmem/backend", () => ({
  api: { rollups: { getRollups: "getRollups" }, userSettings: { get: "get" } },
}));
// loading: the card renders its header and skeleton only
vi.mock("convex/react", () => ({ useQuery: () => undefined }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock("@/components/workspace/active-profile", () => ({
  useActiveProfile: () => ({ _id: "p1" }),
}));

const { default: MemoryTimelineSummaryCard } =
  await import("./MemoryTimelineSummaryCard");

function render(searchParams: string) {
  return renderToStaticMarkup(
    <NuqsTestingAdapter searchParams={searchParams}>
      <MemoryTimelineSummaryCard />
    </NuqsTestingAdapter>,
  );
}

describe("MemoryTimelineSummaryCard jump to date", () => {
  it("shows the selected UTC day in a DatePicker, not a native date input", () => {
    const html = render("?period=day&on=2026-10-07");
    // the picker reads "YYYY-MM-DD" as a calendar date, so the day never shifts
    const shown = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(2026, 9, 7));
    expect(html).toContain(`aria-label="Jump to date (UTC), ${shown}"`);
    expect(html).not.toContain('type="date"');
  });
});
