import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANDING_MONO, LANDING_NAV_LINKS } from "./landingContent";

const here = path.dirname(fileURLToPath(import.meta.url));
const landingCssPath = createRequire(import.meta.url).resolve(
  "@vvedantb/ui/landing.css",
);

describe("landing is monochrome", () => {
  it("does not use danger/red tokens in marketing chrome", () => {
    const files = readdirSync(here).filter(
      (name) => /\.(tsx|ts|css)$/.test(name) && !name.includes(".test."),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(path.join(here, name), "utf8");
      expect(source, name).not.toMatch(/\bdanger\b/);
      expect(source, name).not.toMatch(/tagToColor/);
    }
    expect(readFileSync(landingCssPath, "utf8")).not.toMatch(/\bdanger\b/);
  });

  it("uses gray fills for product mocks", () => {
    for (const [name, hex] of Object.entries(LANDING_MONO)) {
      const match = /^#([0-9a-f]{2})\1\1$/i.exec(hex);
      expect(match, `${name} ${hex} should be a gray hex`).not.toBeNull();
    }
  });

  it("keeps How it works in marketing nav", () => {
    expect(LANDING_NAV_LINKS.map((link) => link.label)).toContain(
      "How it works",
    );
  });
});

describe("landing wordmark", () => {
  const read = (name: string) => readFileSync(path.join(here, name), "utf8");

  it("uses AppWordmark in header and footer", () => {
    const nav = read("LandingNav.tsx");
    const footer = read("LandingFooter.tsx");
    expect(nav).toContain('<AppWordmark app="vmem" />');
    expect(footer).toContain('<AppWordmark app="vmem" />');
    expect(nav).not.toContain("LandingWordmark");
    expect(footer).not.toContain("LandingWordmark");
    expect(nav).not.toContain("VmemBrand");
    expect(footer).not.toContain("VmemBrand");
  });

  it("removes the local LandingWordmark", () => {
    expect(existsSync(path.join(here, "LandingWordmark.tsx"))).toBe(false);
    for (const name of readdirSync(here)) {
      if (!/\.(tsx|ts)$/.test(name) || name.includes(".test.")) continue;
      expect(read(name), name).not.toContain("LandingWordmark");
    }
  });

  it("keeps italic out of every landing source file", () => {
    for (const name of readdirSync(here)) {
      if (!/\.(tsx|ts)$/.test(name) || name.includes(".test.")) continue;
      expect(read(name), name).not.toMatch(/\bitalic\b/);
    }
  });

  it("uses AppWordmark in the in-app preview", () => {
    const stage = read("LandingAppStage.tsx");
    expect(stage).toContain("AppWordmark");
    expect(stage).not.toContain("VmemBrandText");
    expect(stage).not.toContain("LandingWordmark");
    expect(stage).not.toMatch(/\bitalic\b/);
  });
});
