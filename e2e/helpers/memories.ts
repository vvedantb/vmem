import { expect, type Page } from "@playwright/test";

export function disposableMemoryTitle(area = "list"): string {
  return `e2e-${area}-${Date.now()}`;
}

export function mainContent(page: Page) {
  return page.locator("#main-content");
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

// title text in the list (prod has no list-item-row testid yet)
export function memoryTitle(page: Page, title: string) {
  return mainContent(page).getByText(title, { exact: true });
}

export async function deleteMemoryByTitle(
  page: Page,
  title: string,
): Promise<boolean> {
  await searchMemories(page, title);
  const rowTitle = memoryTitle(page, title);
  const visible = await rowTitle
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;

  await rowTitle.click();
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
  await expect(rowTitle).toHaveCount(0);
  return true;
}

export async function cleanupDisposableMemories(
  page: Page,
  prefix: string,
): Promise<void> {
  await searchMemories(page, prefix);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const leftover = mainContent(page).getByText(new RegExp(`^${prefix}`));
    const visible = await leftover
      .first()
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) return;
    const title = (await leftover.first().innerText()).trim();
    if (title.length === 0) return;
    const deleted = await deleteMemoryByTitle(page, title);
    if (!deleted) return;
  }
}
