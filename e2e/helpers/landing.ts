import { expect, type Page } from "@playwright/test";

export const MARKETING_HERO = /Memory your agents can/i;

function parseRgb(
  color: string,
): { r: number; g: number; b: number } | undefined {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);
  if (match === null) return undefined;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function isVividRed(color: string): boolean {
  const rgb = parseRgb(color);
  if (rgb === undefined) return false;
  return rgb.r > 160 && rgb.g < 90 && rgb.b < 90 && rgb.r - rgb.g > 80;
}

export async function waitForMarketingHero(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: MARKETING_HERO }),
  ).toBeVisible();
}

/** #163 dark-only landing puts "How it works" in the page nav. */
export async function isDarkOnlyLanding(page: Page): Promise<boolean> {
  const nav = page.getByRole("navigation", { name: "Page" });
  return (await nav.getByRole("link", { name: "How it works" }).count()) > 0;
}

export async function htmlHasLandingFoucGuard(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.scripts).some((script) =>
      (script.textContent ?? "").includes('classList.add("dark")'),
    ),
  );
}

export async function assertNoVividRedOnPrimaryCta(page: Page): Promise<void> {
  const cta = page.getByRole("button", { name: "Get started" }).first();
  await expect(cta).toBeVisible();
  const background = await cta.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  expect(
    isVividRed(background),
    `Get started background should not be red (${background})`,
  ).toBe(false);
}

export async function assertDarkCanvas(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveClass(/dark/);
  const background = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  const rgb = parseRgb(background);
  expect(rgb, `body background ${background}`).toBeDefined();
  if (rgb === undefined) return;
  const luminance = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  expect(luminance, `body background ${background}`).toBeLessThan(50);
}

export function trackFailedStaticAssets(page: Page): string[] {
  const failed: string[] = [];
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (
      /\.(?:png|jpe?g|gif|svg|webp|ico|woff2?)$/i.test(url) ||
      /\/(favicon|og-image)/i.test(url)
    ) {
      failed.push(`${response.status()} ${url}`);
    }
  });
  return failed;
}
