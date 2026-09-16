import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("skills", { tag: ["@skills", "@smoke"] }, () => {
  test("workspace skills and hub load", async ({ page }) => {
    await gotoWorkspace(page, "/skills");
    await expect(page.locator("#main-content")).toBeVisible();

    await gotoWorkspace(page, "/skills/hub");
    await expect(page.getByRole("heading", { name: "Skills Hub" })).toBeVisible(
      {
        timeout: 20_000,
      },
    );
  });
});
