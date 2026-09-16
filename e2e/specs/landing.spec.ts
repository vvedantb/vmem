import { expect, test } from "@playwright/test";
import {
  assertDarkCanvas,
  assertNoVividRedOnPrimaryCta,
  htmlHasLandingFoucGuard,
  isDarkOnlyLanding,
  trackFailedStaticAssets,
  waitForMarketingHero,
} from "../helpers/landing";

test.describe("landing (signed out)", { tag: ["@landing", "@smoke"] }, () => {
  test("renders the public marketing page", async ({ page }) => {
    const failedAssets = trackFailedStaticAssets(page);
    await page.goto("/");
    await waitForMarketingHero(page);
    await expect(
      page.getByRole("button", { name: "Sign in" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Get started" }).first(),
    ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Page" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Product" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Recall" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Surfaces" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Memories" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    expect(failedAssets, failedAssets.join("\n")).toEqual([]);
  });

  test("dark-only contract when How it works is in nav", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForMarketingHero(page);
    if (!(await isDarkOnlyLanding(page))) {
      test.skip(
        true,
        "Hosted build does not yet include the #163 dark-only landing",
      );
    }

    const nav = page.getByRole("navigation", { name: "Page" });
    await expect(nav.getByRole("link", { name: "How it works" })).toBeVisible();
    await assertDarkCanvas(page);
    await assertNoVividRedOnPrimaryCta(page);
    await expect(
      page.getByRole("link", { name: "vmem on GitHub" }).first(),
    ).toHaveAttribute("href", "https://github.com/vvedantb/vmem");
    await expect(
      page.getByRole("heading", {
        name: /Put memory under the agents you already use/i,
      }),
    ).toBeVisible();
    expect(await htmlHasLandingFoucGuard(page)).toBe(true);
  });

  test("Sign in and Get started open Clerk modals", async ({ page }) => {
    await page.goto("/");
    await waitForMarketingHero(page);
    await page.getByRole("button", { name: "Sign in" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Get started" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("product nav hash-scrolls on the same page", async ({ page }) => {
    await page.goto("/");
    await waitForMarketingHero(page);
    const nav = page.getByRole("navigation", { name: "Page" });
    await nav.getByRole("link", { name: "Product" }).click();
    await expect(page).toHaveURL(/#product/);
  });

  test("product stage exposes a scrubbable memories timeline", async ({
    page,
  }) => {
    await page.goto("/");
    const product = page.locator("#product");
    await expect(
      product.getByRole("button", { name: "Timeline" }),
    ).toBeVisible();
    await product.getByRole("button", { name: "Timeline" }).click();
    await expect(
      product.getByRole("slider", { name: "Scrub through memory time" }),
    ).toBeVisible();
    await expect(
      product.getByRole("button", { name: "Jump to now" }),
    ).toBeVisible();
    const spans = product.getByRole("group", { name: "Time window size" });
    await spans.getByRole("button", { name: "All", exact: true }).click();
    await expect(
      spans.getByRole("button", { name: "All", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("/codebases is not a public product surface", async ({ page }) => {
    await page.goto("/codebases");
    await waitForMarketingHero(page);
    await expect(page.getByRole("link", { name: /codebases/i })).toHaveCount(0);
  });

  test("/home while signed out stays on the marketing page", async ({
    page,
  }) => {
    await page.goto("/home");
    await expect(
      page.getByRole("heading", { name: /Memory your agents can/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: "Sign in" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Memories" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/[^/]+\/home/);
  });

  test("Sign in opens the Clerk modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(
      dialog
        .getByLabel(/email address/i)
        .or(dialog.locator('input[name="identifier"]')),
    ).toBeVisible();
  });
});

test.describe(
  "landing mobile (signed out)",
  { tag: ["@landing", "@mobile"] },
  () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("keeps Sign in and Get started in the bar", async ({ page }) => {
      await page.goto("/");
      await waitForMarketingHero(page);
      await expect(
        page.getByRole("button", { name: "Sign in" }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Get started" }).first(),
      ).toBeVisible();
    });

    test("dark landing opens How it works from the menu", async ({ page }) => {
      await page.goto("/");
      await waitForMarketingHero(page);
      if (!(await isDarkOnlyLanding(page))) {
        test.skip(
          true,
          "Hosted build does not yet include the #163 dark-only landing",
        );
      }
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(
        page.getByRole("menuitem", { name: "How it works" }),
      ).toBeVisible();
    });
  },
);
