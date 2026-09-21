import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import {
  clearSearch,
  createDisposableMemory,
  deleteMemoryByTitle,
  disposableMemoryTitle,
  disposableTag,
  editOpenMemory,
  expectMemoryHidden,
  expectMemoryVisible,
  memoryTitle,
  openMemoriesList,
  openMemoryByTitle,
  searchMemories,
} from "../helpers/memories";

test.describe("memories list", { tag: ["@memories", "@smoke"] }, () => {
  test("search, create a disposable memory, and delete it", async ({
    page,
  }) => {
    const title = disposableMemoryTitle("list");
    const content = `${title} disposable e2e body`;
    await gotoWorkspace(page, "/memories/list");
    await openMemoriesList(page);

    try {
      await createDisposableMemory(page, title, content);
      await searchMemories(page, title);
      const row = memoryTitle(page, title);
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.click();
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("textbox", { name: "Search" })).toHaveValue(
        title,
      );
      await expect(page).toHaveURL(/[?&]q=/);
      await deleteMemoryByTitle(page, title);
      await expect(row).toHaveCount(0);
    } catch (error) {
      await deleteMemoryByTitle(page, title).catch(() => undefined);
      throw error;
    }
  });
});

test.describe("memories crud", { tag: ["@memories"] }, () => {
  test("create, edit, persist after reload, then delete", async ({ page }) => {
    test.setTimeout(90_000);
    const title = disposableMemoryTitle("crud");
    const updatedTitle = `${title}-edited`;
    const tag = disposableTag("crud");
    await gotoWorkspace(page, "/memories/list");
    await openMemoriesList(page);

    try {
      await createDisposableMemory(page, title, `${title} original body`);
      await openMemoryByTitle(page, title);
      await expect(page.getByText(`${title} original body`)).toBeVisible();
      await expect(page.getByText("Knowledge")).toBeVisible();

      await editOpenMemory(page, {
        title: updatedTitle,
        content: `${updatedTitle} updated body`,
        tag,
      });
      await expect(
        page.getByRole("heading", { name: updatedTitle, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`${updatedTitle} updated body`),
      ).toBeVisible();
      await expect(page.getByText(tag, { exact: true })).toBeVisible();

      await page.reload();
      await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible({
        timeout: 20_000,
      });
      await searchMemories(page, updatedTitle);
      await expectMemoryVisible(page, updatedTitle);
      await openMemoryByTitle(page, updatedTitle);
      await expect(
        page.getByText(`${updatedTitle} updated body`),
      ).toBeVisible();
      await expect(page.getByText(tag, { exact: true })).toBeVisible();

      await deleteMemoryByTitle(page, updatedTitle);
      await expectMemoryHidden(page, updatedTitle);
    } catch (error) {
      await deleteMemoryByTitle(page, updatedTitle).catch(() => undefined);
      await deleteMemoryByTitle(page, title).catch(() => undefined);
      throw error;
    }
  });

  test("empty create shows a validation error toast or field error", async ({
    page,
  }) => {
    await gotoWorkspace(page, "/memories/list");
    await openMemoriesList(page);
    await page.getByRole("button", { name: "Add memory" }).click();
    await page.getByRole("button", { name: "Save memory" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  });
});

test.describe("memories search retrieve", { tag: ["@memories"] }, () => {
  test("unique title ranks first and unknown query is empty", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const title = disposableMemoryTitle("rank");
    await gotoWorkspace(page, "/memories/list");
    await openMemoriesList(page);

    try {
      await createDisposableMemory(page, title, `${title} retrieve body`);
      await searchMemories(page, title);
      await expectMemoryVisible(page, title);
      await expect(page.getByTestId("list-item-row").first()).toContainText(
        title,
      );

      const missing = `zzz-nosuch-vmem-${Date.now().toString(36)}`;
      await searchMemories(page, missing);
      await expect(
        page.getByRole("heading", { name: "No results found" }),
      ).toBeVisible({ timeout: 20_000 });
      await expectMemoryHidden(page, title);

      await clearSearch(page);
      await deleteMemoryByTitle(page, title);
    } catch (error) {
      await deleteMemoryByTitle(page, title).catch(() => undefined);
      throw error;
    }
  });
});
