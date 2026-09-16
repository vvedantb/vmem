import { expect, type Locator, type Page } from "@playwright/test";
import type { E2ECredentials } from "./env";
import { waitForAppShell } from "./nav";

async function firstVisible(locators: Locator[]): Promise<Locator | undefined> {
  for (const locator of locators) {
    const node = locator.first();
    if (await node.isVisible().catch(() => false)) return node;
  }
  return undefined;
}

async function fillClerkSignIn(
  page: Page,
  creds: E2ECredentials,
): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  const identifier = await firstVisible([
    dialog.getByLabel(/email address/i),
    dialog.getByPlaceholder(/email/i),
    dialog.locator('input[name="identifier"]'),
    dialog.locator('input[type="email"]'),
    dialog.getByRole("textbox").first(),
  ]);
  if (identifier === undefined) {
    throw new Error("Clerk sign-in form did not expose an email field");
  }
  await identifier.fill(creds.email);

  const passwordField = dialog.locator('input[type="password"]');
  const continueButton = dialog.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  if (!(await passwordField.isVisible().catch(() => false))) {
    await continueButton.click();
    await expect(passwordField).toBeVisible({ timeout: 20_000 });
  }

  await passwordField.fill(creds.password);
  await continueButton.click();
}

export async function signInAsEva(
  page: Page,
  creds: E2ECredentials,
): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await fillClerkSignIn(page, creds);
  return waitForAppShell(page);
}
