import { expect, type Page } from "@playwright/test";
import { profileIdFromUrl, waitForAppShell } from "./nav";

export async function openWorkspaceSwitcher(page: Page): Promise<void> {
  if (profileIdFromUrl(page.url()) === undefined) {
    await page.goto("/home");
    await waitForAppShell(page);
  }
  const showSidebar = page.getByRole("button", { name: "Show sidebar" });
  if (await showSidebar.isVisible().catch(() => false)) {
    await showSidebar.click();
  }
  const trigger = page
    .getByRole("button", { name: /Switch workspace/ })
    .or(
      page.getByRole("button").filter({ hasText: /Personal|Team workspace/ }),
    );
  await expect(trigger.first()).toBeVisible({ timeout: 20_000 });
  await trigger.first().click();
}

export async function createTeam(page: Page, name: string): Promise<void> {
  await openWorkspaceSwitcher(page);
  await page.getByRole("menuitem", { name: "Create team" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Create team" }),
  ).toBeVisible();
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(`Created ${name}`)).toBeVisible({
    timeout: 20_000,
  });
  await waitForAppShell(page);
}

export async function gotoTeamMembers(page: Page): Promise<void> {
  const teamLink = page.getByRole("link", { name: "Team", exact: true });
  await expect(teamLink).toBeVisible({ timeout: 20_000 });
  await teamLink.click();
  await expect(page).toHaveURL(/\/team\/members/);
  await expect(page.getByRole("button", { name: "Add member" })).toBeVisible({
    timeout: 20_000,
  });
}

export async function gotoTeamSettings(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/team\/settings/);
  await expect(page.getByRole("heading", { name: "Team name" })).toBeVisible({
    timeout: 20_000,
  });
}

export async function deleteCurrentTeam(
  page: Page,
  teamName: string,
): Promise<void> {
  await page.getByRole("button", { name: "Delete team" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: `Delete ${teamName}?` }),
  ).toBeVisible();
  await dialog.getByPlaceholder(teamName).fill(teamName);
  await dialog.getByRole("button", { name: "Delete team" }).click();
  await expect(page.getByText(`Deleted ${teamName}`)).toBeVisible({
    timeout: 30_000,
  });
}
