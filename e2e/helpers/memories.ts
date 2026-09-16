import { expect, type Page } from "@playwright/test";
import { gotoWorkspace } from "./nav";

export function disposableMemoryTitle(area = "list"): string {
  return `e2e-${area}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function disposableTag(area = "tag"): string {
  return `e2e-${area}-${Date.now().toString(36)}`;
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

export async function searchMemories(page: Page, query: string): Promise<void> {
  const search = page.getByRole("textbox", { name: "Search" });
  await search.fill(query);
}

export async function clearSearch(page: Page): Promise<void> {
  const search = page.getByRole("textbox", { name: "Search" });
  await search.fill("");
  const clear = page.getByRole("button", { name: "Clear search" });
  if (await clear.isVisible().catch(() => false)) {
    await clear.click();
  }
}

export async function gotoMemoriesListWithParams(
  page: Page,
  params: Record<string, string> = {},
): Promise<string> {
  const profileId = await gotoWorkspace(page, "/memories/list");
  const search = new URLSearchParams(params).toString();
  const dest =
    search.length > 0
      ? `/${profileId}/memories/list?${search}`
      : `/${profileId}/memories/list`;
  const current = new URL(page.url());
  if (`${current.pathname}${current.search}` !== dest) {
    await page.goto(dest);
  }
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible({
    timeout: 20_000,
  });
  return profileId;
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
    const tagInput = page.getByPlaceholder("Add or search tags…");
    await tagInput.fill(tag);
    await tagInput.press("Enter");
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(page.getByText("Memory saved")).toBeVisible({ timeout: 20_000 });
}

export function memoryRow(page: Page, title: string) {
  return page.getByTestId("list-item-row").filter({ hasText: title });
}

export function memoryTitle(page: Page, title: string) {
  return memoryRow(page, title).getByText(title, { exact: true });
}

export async function expectMemoryVisible(
  page: Page,
  title: string,
): Promise<void> {
  await expect(memoryTitle(page, title)).toBeVisible({ timeout: 20_000 });
}

export async function expectMemoryHidden(
  page: Page,
  title: string,
): Promise<void> {
  await expect(memoryTitle(page, title)).toHaveCount(0);
}

export async function openMemoryByTitle(
  page: Page,
  title: string,
): Promise<void> {
  await searchMemories(page, title);
  await expectMemoryVisible(page, title);
  const heading = page.getByRole("heading", { name: title, exact: true });
  if (!(await heading.isVisible().catch(() => false))) {
    await memoryTitle(page, title).click();
  }
  await expect(heading).toBeVisible({ timeout: 20_000 });
}

export async function editOpenMemory(
  page: Page,
  next: { title?: string; content?: string; tag?: string },
): Promise<void> {
  await page.getByRole("button", { name: "Memory actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  if (next.title !== undefined) {
    await page.getByPlaceholder("Memory title").fill(next.title);
  }
  if (next.content !== undefined) {
    await page.getByPlaceholder("Memory content").fill(next.content);
  }
  if (next.tag !== undefined) {
    const tagInput = page.getByPlaceholder("Add a tag and press Enter");
    await tagInput.fill(next.tag);
    await tagInput.press("Enter");
  }
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Memory updated successfully")).toBeVisible({
    timeout: 20_000,
  });
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

  const heading = page.getByRole("heading", { name: title, exact: true });
  if (!(await heading.isVisible().catch(() => false))) {
    await rowTitle.click();
    await expect(heading).toBeVisible({ timeout: 8_000 });
  }
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

export async function cleanupSliceMemories(page: Page): Promise<void> {
  await searchMemories(page, "e2e-");
  const slice = /^e2e-(list|crud|rank|filter|tags)-/;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const leftover = page
      .getByTestId("list-item-row")
      .filter({ hasText: slice });
    const visible = await leftover
      .first()
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) return;
    const title = (await leftover.first().innerText()).trim().split("\n")[0];
    if (title === undefined || title.length === 0) return;
    const deleted = await deleteMemoryByTitle(page, title);
    if (!deleted) return;
    await searchMemories(page, "e2e-");
  }
}

export async function expectFilterPanelChrome(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Filter list" }).click();
  const kindTab = page.getByRole("tab", { name: "Kind" });
  await expect(kindTab).toBeVisible();
  await expect(page.getByRole("tab", { name: "Tags" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Source" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Type" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Status" })).toHaveCount(0);
}

export async function selectFilterTab(
  page: Page,
  tab: "Kind" | "Tags" | "Source" | "Type",
): Promise<void> {
  const tabTrigger = page.getByRole("tab", { name: tab });
  if (!(await tabTrigger.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Filter list" }).click();
  }
  await expect(tabTrigger).toBeVisible();
  await tabTrigger.click();
}
