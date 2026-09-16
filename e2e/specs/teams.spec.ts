import { expect, test } from "../fixtures";
import { gotoSettings } from "../helpers/nav";
import {
  createTeam,
  deleteCurrentTeam,
  gotoTeamMembers,
  gotoTeamSettings,
  openWorkspaceSwitcher,
} from "../helpers/teams";

test.describe("teams / sharing", { tag: ["@teams", "@smoke"] }, () => {
  test("personal workspace has no Team rail item and can open create team", async ({
    page,
    profileId,
  }) => {
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
    await expect(
      page.getByRole("link", { name: "Team", exact: true }),
    ).toHaveCount(0);
    await openWorkspaceSwitcher(page);
    await expect(
      page.getByRole("menuitem", { name: "Create team" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Manage profiles" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("teams / sharing", { tag: ["@teams"] }, () => {
  test("create, members, settings, invalid invite, delete", async ({
    page,
    profileId,
  }) => {
    await expect(page).toHaveURL(new RegExp(`/${profileId}/`));
    const teamName = `e2e-team-${Date.now()}`;
    await createTeam(page, teamName);

    try {
      await gotoTeamMembers(page);
      await expect(page.getByText(/1 member/)).toBeVisible();
      await expect(page.getByText("owner", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Add member" }).click();
      const add = page.getByRole("dialog");
      await add.getByLabel("Email").fill("notarealuser@example.com");
      await add.getByRole("button", { name: "Add" }).click();
      await expect(
        page.getByText(
          /no vmem account for that email|failed to add member|server error/i,
        ),
      ).toBeVisible({ timeout: 20_000 });
      await add.getByRole("button", { name: "Cancel" }).click();

      await gotoTeamSettings(page);
      const nameField = page.getByLabel("Name").or(page.locator("#team-name"));
      await expect(nameField.first()).toHaveValue(teamName);

      await page.getByRole("tab", { name: "Members" }).click();
      await gotoTeamSettings(page);
      await deleteCurrentTeam(page, teamName);
    } catch (err) {
      await page.goto("/home").catch(() => undefined);
      const stillOnTeam = page.url().includes("/team/");
      if (stillOnTeam) {
        await gotoTeamSettings(page).catch(() => undefined);
        await deleteCurrentTeam(page, teamName).catch(() => undefined);
      }
      throw err;
    }

    await expect(page).toHaveURL(/\/home/);
    await expect(
      page.getByRole("link", { name: "Team", exact: true }),
    ).toHaveCount(0);

    await gotoSettings(page, "/profiles");
    await expect(page.getByText(teamName)).toHaveCount(0);
  });
});
