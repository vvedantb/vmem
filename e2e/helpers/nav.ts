import { expect, type Page } from "@playwright/test";

const USER_LEVEL = new Set(["settings", "home", "sign-in", "sign-up"]);

export function profileIdFromUrl(url: string): string | undefined {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter((part) => part.length > 0);
  const first = segments[0];
  const second = segments[1];
  if (first === undefined || second === undefined) return undefined;
  if (USER_LEVEL.has(first)) return undefined;
  return first;
}

export async function waitForAppShell(page: Page): Promise<string> {
  await page.waitForURL(
    (url) => profileIdFromUrl(url.toString()) !== undefined,
    { timeout: 45_000 },
  );
  const profileId = profileIdFromUrl(page.url());
  if (profileId === undefined) {
    throw new Error(`Workspace URL did not resolve: ${page.url()}`);
  }
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  return profileId;
}

export async function gotoWorkspace(
  page: Page,
  subPath: string,
): Promise<string> {
  let profileId = profileIdFromUrl(page.url());
  if (profileId === undefined) {
    await page.goto("/home");
    profileId = await waitForAppShell(page);
  }
  const suffix = subPath.startsWith("/") ? subPath : `/${subPath}`;
  const dest = `/${profileId}${suffix}`;
  const current = new URL(page.url());
  if (current.pathname !== dest) {
    await page.goto(dest);
  }
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  return profileId;
}

export async function gotoSettings(page: Page, subPath: string): Promise<void> {
  const suffix = subPath.startsWith("/") ? subPath : `/${subPath}`;
  await page.goto(`/settings${suffix}`);
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
}
