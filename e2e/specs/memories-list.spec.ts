import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import {
  createDisposableMemory,
  deleteMemoryByTitle,
  disposableMemoryTitle,
  memoryRow,
  openMemoriesList,
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
      await page.getByRole("textbox", { name: "Search" }).fill(title);
      const row = memoryRow(page, title);
      await expect(row.first()).toBeVisible({ timeout: 20_000 });
      await deleteMemoryByTitle(page, title);
      await expect(row).toHaveCount(0);
    } catch (error) {
      await deleteMemoryByTitle(page, title).catch(() => undefined);
      throw error;
    }
  });
});
