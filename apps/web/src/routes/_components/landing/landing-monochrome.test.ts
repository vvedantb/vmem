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
