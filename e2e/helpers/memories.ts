import { expect, type Page } from "@playwright/test";

export function disposableMemoryTitle(area = "list"): string {
  return `e2e-${area}-${Date.now()}`;
}

export async function openMemoriesList(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "List" }).click();
  await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible({
    timeout: 20_000,
  });
}

async function searchMemories(page: Page, query: string): Promise<void> {
  const search = page.getByRole("textbox", { name: "Search" });
  await search.fill(query);
}

export async function createDisposableMemory(
  page: Page,
  title: string,
  content: string,
  tag?: string,
): Promise<void> {
  await page.getByRole("button", { name: "Add memory" }).click();
  await page.getByPlaceholder("Memory title").fill(title);
  await page.getByPlaceholder("Add a description…").fill(content);
  if (tag !== undefined) {
    await page.getByRole("button", { name: /^Tags$/ }).click();
    await page.getByPlaceholder("Add or search tags…").fill(tag);
    await page
      .getByRole("button", { name: new RegExp(`Create .*${tag}`) })
      .click();
  }
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(page.getByText("Memory saved")).toBeVisible({ timeout: 20_000 });
}

export function memoryRow(page: Page, title: string) {
  return page.getByTestId("list-item-row").filter({ hasText: title });
}

export async function deleteMemoryByTitle(
  page: Page,
  title: string,
): Promise<boolean> {
  await searchMemories(page, title);
  const row = memoryRow(page, title);
  const visible = await row
    .first()
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;

  await row.first().click();
  await page.getByRole("button", { name: "Memory actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Delete Memory" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Memory deleted successfully")).toBeVisible({
    timeout: 20_000,
  });
  await expect(row).toHaveCount(0);
  return true;
}
