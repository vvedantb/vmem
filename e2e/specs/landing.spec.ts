import { expect, test } from "@playwright/test";

test.describe("landing (signed out)", { tag: ["@landing", "@smoke"] }, () => {
  test("renders the public marketing page", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Memory your agents can/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Get started" }).first(),
    ).toBeVisible();
    // Smoke hits production (`vmem.vedantb.com`), not this PR's preview.
    const nav = page.getByRole("navigation", { name: "Page" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Product" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Recall" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Surfaces" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Memories" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test("/codebases is not a public product surface", async ({ page }) => {
    await page.goto("/codebases");
    await expect(
      page.getByRole("heading", { name: /Memory your agents can/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /codebases/i })).toHaveCount(0);
  });
});
