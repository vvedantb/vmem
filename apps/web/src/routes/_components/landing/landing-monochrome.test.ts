import { describe, expect, it } from "vitest";
import { LANDING_MONO, LANDING_NAV_LINKS } from "./landingContent";

describe("landing is monochrome", () => {
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
