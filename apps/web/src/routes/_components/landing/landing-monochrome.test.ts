import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANDING_MONO, LANDING_NAV_LINKS } from "./landingContent";

const here = path.dirname(fileURLToPath(import.meta.url));

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

  it("shares one Instrument Serif regular wordmark in header and footer", () => {
    const wordmark = read("LandingWordmark.tsx");
    expect(wordmark).toContain("landing-wordmark-text");
    expect(wordmark).not.toMatch(/font-semibold|font-bold/);

    const css = read("landing.css");
    expect(css).toMatch(/\.landing-wordmark-text[\s\S]*font-weight:\s*400/);
    expect(css).toMatch(/\.landing-wordmark-text[\s\S]*font-synthesis:\s*none/);

    const nav = read("LandingNav.tsx");
    const footer = read("LandingFooter.tsx");
    expect(nav).toContain("LandingWordmark");
    expect(footer).toContain("LandingWordmark");
    expect(nav).not.toContain("VmemBrand");
    expect(footer).not.toContain("VmemBrand");
  });

  it("leaves the in-app preview on Instrument Sans VmemBrandText", () => {
    const stage = read("LandingAppStage.tsx");
    expect(stage).toContain("VmemBrandText");
    expect(stage).not.toContain("LandingWordmark");
  });
});
