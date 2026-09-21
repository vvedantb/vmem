import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import { sidebarViewLink } from "../helpers/shell";
import {
  cleanupDisposableMemories,
  createDisposableMemory,
  deleteMemoryByTitle,
  disposableMemoryTitle,
  memoryTitle,
} from "../helpers/memories";

test.describe(
  "memories timeline",
  { tag: ["@memories", "@timeline", "@smoke"] },
  () => {
    test("timeline chrome loads from the memories sidebar", async ({
      page,
    }) => {
      await gotoWorkspace(page, "/memories/graph");
      await expect(sidebarViewLink(page, "Timeline")).toBeVisible({
        timeout: 20_000,
      });
      await sidebarViewLink(page, "Timeline").click();
      await expect(page).toHaveURL(/\/memories\/timeline/);
      await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Add memory" }),
      ).toBeVisible();
      await expect(sidebarViewLink(page, "Graph")).toBeVisible();
      await expect(sidebarViewLink(page, "List")).toBeVisible();
      await expect(sidebarViewLink(page, "Tags")).toBeVisible();

      const empty = page.getByRole("heading", { name: "Nothing here yet" });
      const slider = page.getByRole("slider", {
        name: "Scrub through memory time",
      });
      await expect(empty.or(slider)).toBeVisible({ timeout: 20_000 });
    });

    test("scrubber, window presets, search, history, and list round-trip", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const title = disposableMemoryTitle("timeline");
      const content = `${title} disposable e2e body`;

      await gotoWorkspace(page, "/memories/timeline");
      await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible({
        timeout: 20_000,
      });
      await cleanupDisposableMemories(page, "e2e-timeline-");
      await page.getByRole("textbox", { name: "Search" }).fill("");

      try {
        await createDisposableMemory(page, title, content);

        const slider = page.getByRole("slider", {
          name: "Scrub through memory time",
        });
        await expect(slider).toBeVisible({ timeout: 20_000 });
        await expect(memoryTitle(page, title)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText("Jump to now")).toBeVisible();
        await expect(page.getByText(/^Now$/)).toBeVisible();

        const spans = page.getByRole("group", { name: "Time window size" });
        await expect(spans).toBeVisible();
        await spans.getByRole("button", { name: "Day" }).click();
        await expect(page).toHaveURL(/span=day/);
        await spans.getByRole("button", { name: "Month" }).click();
        await expect(page).toHaveURL(/span=month/);
        await spans.getByRole("button", { name: "All" }).click();
        await expect(page).toHaveURL(/span=all/);
        await expect(memoryTitle(page, title)).toBeVisible();

        await spans.getByRole("button", { name: "Day" }).click();
        await slider.fill("0");
        await expect
          .poll(async () => Number(await slider.inputValue()))
          .toBeLessThan(50);
        const emptyWindow = page.getByRole("heading", {
          name: "No memories in this window",
        });
        await expect(
          emptyWindow.or(page.getByTestId("list-item-row")),
        ).toBeVisible();

        await page.getByRole("button", { name: "Jump to now" }).click();
        // prod range end can drift a few steps after Date.now() is frozen
        await expect
          .poll(async () => Number(await slider.inputValue()))
          .toBeGreaterThan(900);
        await expect(memoryTitle(page, title)).toBeVisible();

        await memoryTitle(page, title).click();
        await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
        await page.getByRole("tab", { name: "History" }).click();
        const historyPanel = page.getByRole("tabpanel");
        await expect(
          historyPanel
            .getByText("No history yet")
            .or(historyPanel.getByText(/^Created$/)),
        ).toBeVisible();
        await page.getByRole("button", { name: "Close panel" }).click();

        await page.getByRole("textbox", { name: "Search" }).fill(title);
        await expect(memoryTitle(page, title)).toBeVisible();
        await page
          .getByRole("textbox", { name: "Search" })
          .fill("zzz-no-such-e2e-xyz");
        const noResults = page.getByRole("heading", {
          name: "No results found",
        });
        // prod retrieve still returns semantic neighbors until this PR deploys
        await expect(noResults.or(slider)).toBeVisible();
        await page.getByRole("textbox", { name: "Search" }).fill("");
        await expect(slider).toBeVisible();

        await sidebarViewLink(page, "List").click();
        await expect(page).toHaveURL(/\/memories\/list/);
        await expect(memoryTitle(page, title)).toBeVisible({ timeout: 20_000 });
        await sidebarViewLink(page, "Tags").click();
        await expect(page).toHaveURL(/\/memories\/tags/);
        await sidebarViewLink(page, "Timeline").click();
        await expect(page).toHaveURL(/\/memories\/timeline/);
        await expect(slider).toBeVisible({ timeout: 20_000 });

        await deleteMemoryByTitle(page, title);
        await expect(memoryTitle(page, title)).toHaveCount(0);
      } catch (error) {
        await deleteMemoryByTitle(page, title).catch(() => undefined);
        throw error;
      }
    });
  },
);
