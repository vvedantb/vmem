import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import {
  createDisposableMemory,
  deleteMemoryByTitle,
  disposableMemoryTitle,
  disposableTag,
  expectFilterPanelChrome,
  expectMemoryHidden,
  expectMemoryVisible,
  gotoMemoriesListWithParams,
  openMemoriesList,
  searchMemories,
  selectFilterTab,
} from "../helpers/memories";

test.describe("memories filters", { tag: ["@memories"] }, () => {
  test("filter chrome exposes kind, tags, source, and type — not status", async ({
    page,
  }) => {
    await gotoWorkspace(page, "/memories/list");
    await openMemoriesList(page);
    await expectFilterPanelChrome(page);
    await selectFilterTab(page, "Type");
    await expect(page.getByText("All types")).toBeVisible();
    await expect(page.getByText("Knowledge", { exact: true })).toBeVisible();
    await expect(page.getByText("Episodic", { exact: true })).toBeVisible();
    await expect(page.getByText("Profile", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("tag, type, source, and kind filters keep or hide a created memory", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const title = disposableMemoryTitle("filter");
    const tag = disposableTag("filter");
    await gotoWorkspace(page, "/memories/list");
    await openMemoriesList(page);

    try {
      await createDisposableMemory(page, title, `${title} filter body`, tag);

      await gotoMemoriesListWithParams(page, {
        kinds: "memory",
        tags: tag,
      });
      await expectMemoryVisible(page, title);

      await gotoMemoriesListWithParams(page, {
        kinds: "memory",
        tags: tag,
        types: "knowledge",
        sources: "web",
      });
      await expectMemoryVisible(page, title);

      await gotoMemoriesListWithParams(page, {
        kinds: "memory",
        tags: tag,
        types: "episodic",
      });
      await expect(
        page
          .getByRole("heading", { name: "No results found" })
          .or(page.getByRole("heading", { name: "Nothing here yet" })),
      ).toBeVisible({ timeout: 20_000 });
      await expectMemoryHidden(page, title);

      await gotoMemoriesListWithParams(page, {
        kinds: "memory",
        tags: "e2e-missing-tag-zzz",
      });
      await expect(
        page
          .getByRole("heading", { name: "No results found" })
          .or(page.getByRole("heading", { name: "Nothing here yet" })),
      ).toBeVisible({ timeout: 20_000 });

      await gotoMemoriesListWithParams(page, {});
      await searchMemories(page, title);
      await expectMemoryVisible(page, title);
      await deleteMemoryByTitle(page, title);
    } catch (error) {
      await gotoMemoriesListWithParams(page, {}).catch(() => undefined);
      await deleteMemoryByTitle(page, title).catch(() => undefined);
      throw error;
    }
  });
});
