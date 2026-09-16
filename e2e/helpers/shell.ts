import { expect, type Locator, type Page } from "@playwright/test";
import { mainContent } from "./memories";

export function railLink(page: Page, name: string): Locator {
  return page.getByRole("link", { name, exact: true });
}

export async function clickRail(page: Page, name: string): Promise<void> {
  await railLink(page, name).click();
}

export async function assertNoFatalChrome(page: Page): Promise<void> {
  await expect(page.getByText("Show Error", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Failed to load dashboard")).toHaveCount(0);
  await expect(page.getByText("Active profile is loading")).toHaveCount(0);
  await expect(page.getByText("Active profile not found")).toHaveCount(0);
}

export function statCardValue(page: Page, label: string): Locator {
  return mainContent(page)
    .locator("p")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following::p[contains(@class,'text-3xl')][1]");
}

export function sidebarPanel(page: Page): Locator {
  return page.locator("[data-sidebar-layout]");
}

export async function openWorkspaceSwitcher(page: Page): Promise<Locator> {
  const trigger = sidebarPanel(page)
    .locator("button")
    .filter({ hasText: /Personal|Team workspace/ })
    .first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

export async function openAccountMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /Account menu for/i }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}
