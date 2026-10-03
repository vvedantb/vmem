import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("files", { tag: ["@files", "@smoke"] }, () => {
  test("files workspace loads", async ({ page }) => {
    await gotoWorkspace(page, "/files");
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(
        "No files yet. Use Add to upload a file or create a folder.",
        { exact: true },
      ),
    ).toBeVisible();
  });
});
