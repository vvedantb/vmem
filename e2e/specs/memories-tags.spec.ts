import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import {
  createDisposableMemory,
  deleteMemoryByTitle,
  disposableMemoryTitle,
  disposableTag,
  expectMemoryVisible,
  openMemoriesList,
  searchMemories,
} from "../helpers/memories";

test.describe(
  "memories tags",
  { tag: ["@memories", "@tags", "@smoke"] },
  () => {
    test("tags view is reachable from the list chrome", async ({ page }) => {
      await gotoWorkspace(page, "/memories/list");
      await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("button", { name: /Change view/ }).click();
      await page.getByRole("menuitem", { name: "Tags" }).click();
      await expect(page).toHaveURL(/view=tags/);
      await expect(
        page.getByRole("textbox", { name: "Search" }),
      ).toHaveAttribute("placeholder", /Search tags/i);
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

      await page.getByRole("button", { name: /Change view/ }).click();
      await page.getByRole("menuitem", { name: "Tags" }).click();
      await expect(page).toHaveURL(/view=tags/);
      await searchMemories(page, tag);
      await expect(
        page.getByTestId("tag-row").filter({ hasText: tag }),
      ).toBeVisible({ timeout: 20_000 });

      await page.getByText(tag, { exact: true }).first().click();
      await expectMemoryVisible(page, title);

      await page.getByRole("button", { name: /Change view/ }).click();
      await page.getByRole("menuitem", { name: "Memories" }).click();
      await deleteMemoryByTitle(page, title);
    } catch (error) {
      await page
        .getByRole("button", { name: /Change view/ })
        .click()
        .catch(() => undefined);
      await page
        .getByRole("menuitem", { name: "Memories" })
        .click()
        .catch(() => undefined);
      await deleteMemoryByTitle(page, title).catch(() => undefined);
      throw error;
    }
  });
});
