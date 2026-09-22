import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shouldFullLoadClerkOnNavigate } from "./slides-public-boot";

const webSrc = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("shouldFullLoadClerkOnNavigate", () => {
  it("stays on the no-Clerk tree for /slides (search params live on the same path)", () => {
    expect(shouldFullLoadClerkOnNavigate(true, "/slides")).toBe(false);
    expect(shouldFullLoadClerkOnNavigate(true, "/slides/")).toBe(false);
  });

  it("reloads when a no-Clerk slides boot navigates to any other route", () => {
    expect(shouldFullLoadClerkOnNavigate(true, "/")).toBe(true);
    expect(shouldFullLoadClerkOnNavigate(true, "/home")).toBe(true);
    expect(shouldFullLoadClerkOnNavigate(true, "/slides-deck")).toBe(true);
    expect(shouldFullLoadClerkOnNavigate(true, "/_main/home")).toBe(true);
  });

  it("does not reload when Clerk already booted with the app", () => {
    expect(shouldFullLoadClerkOnNavigate(false, "/")).toBe(false);
    expect(shouldFullLoadClerkOnNavigate(false, "/home")).toBe(false);
    expect(shouldFullLoadClerkOnNavigate(false, "/slides")).toBe(false);
  });
});

describe("slides boot skips Clerk on preview domains", () => {
  it("main.tsx mounts ClerkProvider only when not on the slides public boot path", () => {
    const main = readFileSync(join(webSrc, "main.tsx"), "utf8");
    expect(main).toContain("slidesPublicBoot");
    expect(main).toContain("ClerkProvider");
    expect(main).toMatch(
      /slidesPublicBoot\s*\?[\s\S]*RouterProvider[\s\S]*:\s*\([\s\S]*ClerkProvider/,
    );
  });

  it("ConvexClientProvider uses anonymous ConvexProvider when slides skipped Clerk", () => {
    const provider = readFileSync(
      join(webSrc, "providers/ConvexClientProvider.tsx"),
      "utf8",
    );
    expect(provider).toContain("slidesPublicBoot");
    expect(provider).toContain("ConvexProvider");
    expect(provider).toContain("ConvexProviderWithClerk");
    expect(provider).toMatch(
      /if\s*\(\s*slidesPublicBoot\s*\)[\s\S]*ConvexProvider/,
    );
  });

  it("root route full-loads when leaving the no-Clerk slides tree", () => {
    const root = readFileSync(join(webSrc, "routes/__root.tsx"), "utf8");
    expect(root).toContain("shouldFullLoadClerkOnNavigate");
    expect(root).toContain("window.location.assign");
  });

  it("ClientProvider does not mount EnsureUser on the slides public boot path", () => {
    const client = readFileSync(
      join(webSrc, "providers/ClientProvider.tsx"),
      "utf8",
    );
    expect(client).toContain("slidesPublicBoot");
    expect(client).toMatch(/!slidesPublicBoot\s*&&\s*<EnsureUser/);
  });

  it("EnsureUser is a no-op on slidesPublicBoot without calling useConvexAuth", () => {
    const ensureUser = readFileSync(
      join(webSrc, "providers/EnsureUser.tsx"),
      "utf8",
    );
    const exported = ensureUser.match(
      /export function EnsureUser\(\) \{[\s\S]*?(?=\nfunction |\nexport )/,
    );
    expect(exported?.[0]).toContain("slidesPublicBoot");
    expect(exported?.[0]).toContain("return null");
    expect(exported?.[0]).not.toContain("useConvexAuth");
    expect(ensureUser).toMatch(
      /function EnsureUserWhenAuth[\s\S]*useConvexAuth/,
    );
  });

  it("slides tree does not run useConvexAuth / Authenticated / Unauthenticated", () => {
    const AUTH_HOOK =
      /\b(useConvexAuth|Authenticated|Unauthenticated|AuthLoading)\b/;
    const files = [
      join(webSrc, "routes/slides.tsx"),
      ...listTsx(join(webSrc, "routes/_components/slides")),
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(AUTH_HOOK);
    }
  });
});

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsx(path));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}
