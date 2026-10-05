import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.join(here, "../..");
const uiSrc = [
  path.join(webSrc, "../node_modules/@vvedantb/ui/src"),
  path.join(webSrc, "../../../node_modules/@vvedantb/ui/src"),
].find((dir) => existsSync(dir));
if (!uiSrc) {
  throw new Error("@vvedantb/ui source not installed");
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function cssRule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} rule exists`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("shared shell pills live in @vvedantb/shell", () => {
  it("does not keep a second PillTabs in this app", () => {
    expect(existsSync(path.join(here, "PillTabs.tsx"))).toBe(false);
    expect(read(path.join(here, "Sidebar.tsx"))).toContain(
      'from "@vvedantb/shell"',
    );
  });
});

describe("product tabs are isolated pills", () => {
  const tabs = read(path.join(uiSrc, "ui/tabs.tsx"));
  const css = read(path.join(webSrc, "globals.css"));

  it("defaults TabsList to the pills variant", () => {
    expect(tabs).toContain('variant = "pills"');
    expect(tabs).toContain('"t-tabs--pills"');
    expect(tabs).toContain('"t-tabs--segmented"');
  });

  it("only renders the sliding pill for the segmented variant", () => {
    const pillIdx = tabs.indexOf('className="t-tabs-pill"');
    const guardIdx = tabs.lastIndexOf('variant === "segmented"', pillIdx);
    expect(pillIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(pillIdx - guardIdx).toBeLessThan(80);
  });

  it("gives pills a gap and no shared track", () => {
    const base = cssRule(css, ".t-tabs");
    expect(base).not.toContain("background");
    expect(base).not.toContain("padding");

    const pills = cssRule(css, ".t-tabs--pills");
    expect(pills).toMatch(/gap:\s*6px/);
    expect(pills).toContain("background: transparent");

    const pill = cssRule(css, ".t-tabs--pills .t-tab");
    expect(pill).toContain("border: 1px solid var(--border)");
    expect(css).toMatch(
      /\.t-tabs--pills \.t-tab\[data-state="active"\] \{\s*background: var\(--tabs-pill-active-bg\)/,
    );
  });

  it("keeps the connected bar for the segmented variant", () => {
    const segmented = cssRule(css, ".t-tabs--segmented");
    expect(segmented).toContain("background: var(--tabs-bar-bg)");
    expect(css).toContain(".t-tabs-pill {");
  });

  it("restyles the timeline span picker as isolated pills", () => {
    const scrubber = read(
      path.join(webSrc, "components/memories/MemoryTimelineScrubber.tsx"),
    );
    expect(scrubber).not.toContain("rounded-full bg-segment");
    expect(scrubber).toContain("rounded-full border border-border");
  });

  it("leaves product TabsList on the default pills variant", () => {
    for (const rel of [
      "components/shell/RouteTabs.tsx",
      "components/files/FileToolbar.tsx",
      "components/memories/MemoryDetailPanel.tsx",
    ]) {
      expect(read(path.join(webSrc, rel))).not.toContain('variant="segmented"');
    }
  });
});

describe("marketing keeps the connected segmented control", () => {
  it("uses the segmented TabsList on the landing preview", () => {
    const preview = read(
      path.join(webSrc, "routes/_components/landing/LandingListPreview.tsx"),
    );
    expect(preview).toContain('<TabsList variant="segmented">');
  });

  it("leaves the landing app stage bar untouched", () => {
    const stage = read(
      path.join(webSrc, "routes/_components/landing/LandingAppStage.tsx"),
    );
    expect(stage).toContain("flex gap-1 rounded-full bg-segment");
  });
});
