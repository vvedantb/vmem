import { expect, test } from "../fixtures";
import { DEFAULT_E2E_BASE_URL, e2eBaseURL } from "../helpers/env";
import { gotoWorkspace } from "../helpers/nav";
import { railLink } from "../helpers/shell";

// Writes data (undoable): opt in with E2E_DREAM=1 against a non-prod target.
const dreamWrites =
  process.env.E2E_DREAM === "1" && e2eBaseURL() !== DEFAULT_E2E_BASE_URL;

test.describe("dreaming", { tag: ["@dreaming"] }, () => {
  test("the Dreaming page lists runs on the rail", async ({ page }) => {
    await gotoWorkspace(page, "/dreaming");
    await expect(railLink(page, "Dreaming")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("heading", { name: "Dream runs" })).toBeVisible(
      { timeout: 20_000 },
    );
  });

  test("dry run -> apply -> undo one group", async ({ page }) => {
    test.skip(!dreamWrites, "set E2E_DREAM=1 and a non-prod E2E_BASE_URL");
    test.setTimeout(180_000);
    await gotoWorkspace(page, "/dreaming");
    await page.getByRole("button", { name: "Scan for duplicates" }).click();

    // the dry run finishes in the background: newest row first
    const dryRow = page
      .getByRole("button")
      .filter({ hasText: "Dry run" })
      .first();
    await expect(dryRow).toBeVisible({ timeout: 30_000 });
    await expect(dryRow).not.toContainText("running", { timeout: 120_000 });
    const card = page.getByTestId("dream-cleanup-card");
    const cleanUp = card.getByRole("button", { name: "Clean up" });
    test.skip(!(await cleanUp.isVisible()), "the scan found no duplicates");

    await card.getByRole("button", { name: "Review" }).click();
    await cleanUp.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Clean up" })
      .click();
    await expect(card).toBeHidden({ timeout: 120_000 });

    // newest run first: the apply run of the cleanup
    const runRow = page
      .getByRole("button", { expanded: false })
      .filter({ hasText: "Cleanup" })
      .filter({ hasNotText: "Dry run" })
      .first();
    await runRow.click();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await expect(undo.first()).toBeVisible({ timeout: 20_000 });
    await undo.first().click();
    await expect(page.getByText("Undone").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
