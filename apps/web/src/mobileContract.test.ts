import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webSrc = dirname(fileURLToPath(import.meta.url));
const webApp = join(webSrc, "..");
const uiSrc = join(webSrc, "..", "..", "..", "packages", "ui", "src");

const cssRules = stripComments(
  readFileSync(join(webSrc, "globals.css"), "utf8").replaceAll("\r\n", "\n"),
);

function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

function styledSources(): Array<{ path: string; source: string }> {
  const files: Array<{ path: string; source: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      if (!/\.(?:tsx?|css)$/.test(entry.name)) continue;
      files.push({
        path: relative(webApp, full),
        source: stripComments(readFileSync(full, "utf8")).replaceAll(
          /\/\/.*$/gm,
          "",
        ),
      });
    }
  };
  walk(webSrc);
  walk(uiSrc);
  expect(files.length, "no sources found").toBeGreaterThan(50);
  return files;
}

describe("the mobile viewport contract", () => {
  it("lets the user zoom, and opts into the safe-area insets", () => {
    const html = readFileSync(join(webApp, "index.html"), "utf8");
    const meta = html.slice(
      html.indexOf('name="viewport"'),
      html.indexOf(">", html.indexOf('name="viewport"')),
    );
    expect(meta, "no viewport meta").toContain("width=device-width");
    expect(meta, "blocking zoom fails WCAG 1.4.4").not.toContain(
      "user-scalable=no",
    );
    expect(meta, "capping scale fails WCAG 1.4.4").not.toContain(
      "maximum-scale",
    );
    expect(meta, "env(safe-area-inset-*) stays 0 without it").toContain(
      "viewport-fit=cover",
    );
  });

  it("sizes full-height layouts in dvh/svh, never vh", () => {
    const offenders = styledSources().flatMap(({ path, source }) => {
      const hits = [
        ...source.matchAll(/\b(?:min-|max-)?h-screen\b/g),
        ...source.matchAll(/\b\d+(?:\.\d+)?vh\b/g),
      ];
      return hits.map((hit) => `${path}: ${hit[0]}`);
    });
    expect(
      offenders,
      "use dvh (or svh) — 100vh is taller than the visible viewport on iOS",
    ).toEqual([]);
  });
});

describe("the reveal-on-hover utility", () => {
  it("ships the control visible and only hides it where hover exists", () => {
    expect(cssRules).toMatch(/\.reveal-on-hover\s*\{[\s\S]*opacity:\s*1/);
    const hidden = cssRules.slice(cssRules.indexOf(".reveal-on-hover"));
    expect(hidden).toContain("hover: hover");
    expect(hidden).toMatch(/min-width:\s*640px/);
  });

  it("restores the control on focus", () => {
    const hidden = cssRules.slice(cssRules.indexOf(".reveal-on-hover"));
    expect(hidden).toContain(":focus-visible");
    expect(hidden).toContain(":focus-within");
  });
});

describe("small Button sizes", () => {
  function sizeDeclaration(size: string): string {
    const button = stripComments(
      readFileSync(join(uiSrc, "ui", "button.tsx"), "utf8"),
    ).replaceAll(/\/\/.*$/gm, "");
    const variants = button.slice(
      button.indexOf("size:"),
      button.indexOf("defaultVariants"),
    );
    const at = variants.search(new RegExp(`"?${size}"?:`));
    expect(at, `the ${size} size is gone`).toBeGreaterThan(-1);
    return variants.slice(at, variants.indexOf("\n", at));
  }

  it.each(["icon-xs"])("%s uses ungated hit-target", (size) => {
    const declaration = sizeDeclaration(size);
    expect(declaration).toContain("hit-target");
    expect(declaration).not.toContain("max-sm:hit-target");
  });

  it.each(["sm", "icon-sm"])(
    "%s reaches the 40px floor on touch only",
    (size) => {
      const declaration = sizeDeclaration(size);
      expect(declaration).toContain("max-sm:hit-target");
    },
  );
});

describe("the TabsList primitive", () => {
  it("scrolls its own overflow on a phone, and only there", () => {
    const tabs = stripComments(
      readFileSync(join(uiSrc, "ui", "tabs.tsx"), "utf8"),
    ).replaceAll(/\/\/.*$/gm, "");
    expect(tabs).toContain("max-sm:overflow-x-auto");
    expect(tabs).toContain("max-sm:max-w-full");
    expect(tabs).toContain("max-sm:justify-center-safe");
    expect(tabs).not.toMatch(/(?<!max-sm:)justify-center-safe/);
  });
});

describe("the Table primitive", () => {
  it("scrolls wide tables inside their own box on a phone", () => {
    const table = stripComments(
      readFileSync(join(uiSrc, "ui", "table.tsx"), "utf8"),
    ).replaceAll(/\/\/.*$/gm, "");
    const wrapper = table.slice(0, table.indexOf("<table"));
    expect(wrapper, "the wrapper has to be able to scroll").toMatch(
      /overflow-(?:auto|x-auto)/,
    );
    expect(wrapper, "without min-w-0 the wrapper grows instead").toContain(
      "max-sm:min-w-0",
    );
  });
});

describe("floating overlays", () => {
  const overlays = [
    "dialog.tsx",
    "popover.tsx",
    "hover-card.tsx",
    "tooltip.tsx",
    "_menu-classes.ts",
  ] as const;

  it.each(overlays)("%s caps its width against the viewport", (file) => {
    const source = readFileSync(join(uiSrc, "ui", file), "utf8");
    expect(source, "an overlay can be wider than a 320px screen").toMatch(
      /\bmax-w-\[calc\(100vw-|\bw-\[calc\(100vw-/,
    );
  });
});

describe("buttons that hide their label on phones", () => {
  it("keep an accessible name", () => {
    const offenders = styledSources().flatMap(({ path, source }) => {
      const hits = [
        ...source.matchAll(/<span\s+className="hidden (?:sm|md):inline"/g),
      ];
      return hits.flatMap((hit) => {
        const at = hit.index;
        const before = source.slice(Math.max(0, at - 1200), at);
        const openAt = Math.max(
          before.lastIndexOf("<Button"),
          before.lastIndexOf("<button"),
        );
        if (openAt === -1) return [];
        const control = before.slice(openAt);
        if (/<\/[Bb]utton>/.test(control)) return [];
        if (/\baria-label=/.test(control)) return [];
        const after = source.slice(at, at + 240);
        if (/className="sm:hidden"/.test(after)) return [];
        return [`${path}: ${hit[0]}`];
      });
    });
    expect(
      offenders,
      "use max-sm:sr-only so the button keeps its name on a phone",
    ).toEqual([]);
  });
});
