import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("files", { tag: ["@files", "@smoke"] }, () => {
  test("files workspace loads", async ({ page }) => {
    await gotoWorkspace(page, "/files");
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: "Grid view" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "List view" })).toBeVisible();

    const empty = page.getByRole("heading", { name: "No files yet" });
    const upload = page.getByRole("button", { name: "Upload" });
    await expect(
      empty.or(upload).or(page.getByRole("button", { name: "Add" })),
    ).toBeVisible();
  });
});
