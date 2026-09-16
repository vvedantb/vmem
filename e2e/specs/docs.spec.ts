import { expect, test } from "@playwright/test";
import { e2eDocsURL } from "../helpers/docs";

const docsPages = [
  { path: "/introduction", heading: /What is vmem/i },
  { path: "/quickstart", heading: /Prerequisites|Clone and Install/i },
  { path: "/architecture", heading: /Architecture/i },
  { path: "/api-reference/overview", heading: /API|Overview/i },
  { path: "/mcp/overview", heading: /MCP/i },
] as const;

test.describe("Mintlify docs preview", { tag: ["@docs"] }, () => {
  test.use({ baseURL: e2eDocsURL() });

  test.beforeEach(async ({ request }, testInfo) => {
    try {
      const response = await request.get("/");
      const status = response.status();
      if (!(response.ok() || status === 307 || status === 308)) {
        testInfo.skip(true, `Docs preview returned ${status}`);
      }
    } catch {
      testInfo.skip(
        true,
        "Mintlify preview is not running (pnpm docs:dev → http://localhost:3001)",
      );
    }
  });

  test("home redirects to introduction", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/introduction/);
    await expect(
      page.getByRole("heading", { name: /What is vmem/i }),
    ).toBeVisible();
  });

  test("sidebar exposes Documentation, API Reference, and MCP", async ({
    page,
  }) => {
    await page.goto("/introduction");
    await expect(
      page.getByRole("link", { name: /Documentation/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /API Reference/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^MCP$/i }).first(),
    ).toBeVisible();
  });

  for (const pageSpec of docsPages) {
    test(`${pageSpec.path} renders`, async ({ page }) => {
      await page.goto(pageSpec.path);
      await expect(
        page.getByRole("heading", { name: pageSpec.heading }).first(),
      ).toBeVisible();
    });
  }

  test("removed features are labeled as removed", async ({ page }) => {
    await page.goto("/features/codebases");
    await expect(page.getByText(/not a live product feature/i)).toBeVisible();
    await page.goto("/features/mobile");
    await expect(page.getByText(/is not on/i)).toBeVisible();
  });

  test("logo and favicon assets load", async ({ request }) => {
    for (const path of [
      "/logo/icon-dark.svg",
      "/logo/icon-light.svg",
      "/favicon.svg",
    ]) {
      const response = await request.get(path);
      expect(response.ok(), path).toBeTruthy();
      expect(response.headers()["content-type"] ?? "").toMatch(/image\/svg/);
    }
  });

  test("unknown docs path is a 404", async ({ page, request }) => {
    const response = await request.get("/this-docs-page-does-not-exist");
    expect(response.status()).toBe(404);
    await page.goto("/this-docs-page-does-not-exist");
    await expect(
      page.getByRole("heading", { name: /Page not found/i }),
    ).toBeVisible();
  });
});
