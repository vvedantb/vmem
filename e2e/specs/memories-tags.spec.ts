import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import { sidebarViewLink } from "../helpers/shell";
import {
  createDisposableMemory,
  deleteMemoryByTitle,
  disposableMemoryTitle,
  disposableTag,
  expectMemoryVisible,
  gotoMemoriesListWithParams,
  openMemoriesList,
  openMemoriesTags,
  searchMemories,
} from "../helpers/memories";

test.describe(
  "memories tags",
  { tag: ["@memories", "@tags", "@smoke"] },
  () => {
    test("tags view is a stacked memories sidebar tab", async ({ page }) => {
      await gotoWorkspace(page, "/memories/list");
      await expect(sidebarViewLink(page, "Tags")).toBeVisible({
        timeout: 20_000,
      });
      await openMemoriesTags(page);
      await expect(
        page.getByRole("textbox", { name: "Search" }),
      ).toHaveAttribute("placeholder", /Search tags/i);

      const profileId = await gotoMemoriesListWithParams(page, {
        view: "tags",
        q: "legacy",
      });
      await expect(page).toHaveURL(new RegExp(`/${profileId}/memories/tags`));
      await expect(page).toHaveURL(/[?&]q=legacy/);
    });
  },
);

test.describe("memories tags data", { tag: ["@memories", "@tags"] }, () => {
  test("created tag appears in tags view and opens its memories", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const title = disposableMemoryTitle("tags");
    const tag = disposableTag("tags");
    await gotoWorkspace(page, "/memories/list");
    await openMemoriesList(page);

    try {
      await createDisposableMemory(page, title, `${title} tagged body`, tag);

      await openMemoriesTags(page);
      await searchMemories(page, tag);
      await expect(
        page.getByTestId("tag-row").filter({ hasText: tag }),
      ).toBeVisible({ timeout: 20_000 });

      await page.getByText(tag, { exact: true }).first().click();
      await expectMemoryVisible(page, title);

      await openMemoriesList(page);
      await deleteMemoryByTitle(page, title);
    } catch (error) {
      await openMemoriesList(page).catch(() => undefined);
      await deleteMemoryByTitle(page, title).catch(() => undefined);
      throw error;
    }
  });
});
