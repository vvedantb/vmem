import { expect, test } from "@playwright/test";
import { MARKETING_HERO, waitForMarketingHero } from "../helpers/landing";

test.describe(
  "public SEO + 404 (signed out)",
  { tag: ["@public", "@smoke"] },
  () => {
    test("HTML has title, description, canonical, and Open Graph", async ({
      page,
    }) => {
      await page.goto("/");
      await waitForMarketingHero(page);
      await expect(page).toHaveTitle(/vmem/i);
      const description = page.locator('meta[name="description"]');
      await expect(description).toHaveAttribute("content", /Graph storage/i);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://vmem.vedantb.com/",
      );
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        /vmem/i,
      );
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        "content",
        "https://vmem.vedantb.com/og-image.png",
      );
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        "content",
        "summary_large_image",
      );
      const jsonLd = await page
        .locator('script[type="application/ld+json"]')
        .first()
        .textContent();
      expect(jsonLd).toContain("SoftwareApplication");
      expect(jsonLd).toContain("https://vmem.vedantb.com/");
    });

    test("robots, sitemap, favicon, and OG image are served", async ({
      request,
    }) => {
      const robots = await request.get("/robots.txt");
      expect(robots.ok()).toBeTruthy();
      const robotsText = await robots.text();
      expect(robotsText).toContain("Allow: /$");
      expect(robotsText).toContain("Disallow: /home");
      expect(robotsText).toContain(
        "Sitemap: https://vmem.vedantb.com/sitemap.xml",
      );

      const sitemap = await request.get("/sitemap.xml");
      expect(sitemap.ok()).toBeTruthy();
      expect(await sitemap.text()).toContain("https://vmem.vedantb.com/");

      const favicon = await request.get("/favicon.png");
      expect(favicon.ok()).toBeTruthy();
      expect(favicon.headers()["content-type"] ?? "").toMatch(/image\/png/);

      const og = await request.get("/og-image.png");
      expect(og.ok()).toBeTruthy();
      expect(og.headers()["content-type"] ?? "").toMatch(/image\/png/);
    });

    test("unknown public paths redirect to the marketing page", async ({
      page,
    }) => {
      await page.goto("/this-page-does-not-exist-xyz");
      await waitForMarketingHero(page);
      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole("heading", { name: MARKETING_HERO }),
      ).toBeVisible();
    });

    test("/docs is not a hosted Mintlify surface on the web app", async ({
      page,
    }) => {
      await page.goto("/docs");
      await waitForMarketingHero(page);
      await expect(page).toHaveURL(/\/$/);
    });

    test("/home signed out returns to marketing", async ({ page }) => {
      await page.goto("/home");
      await waitForMarketingHero(page);
    });
  },
);
