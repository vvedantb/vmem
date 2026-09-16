import { test as base, expect } from "@playwright/test";
import { gotoWorkspace, waitForAppShell } from "./helpers/nav";

type AppFixtures = {
  profileId: string;
};

export const test = base.extend<AppFixtures>({
  profileId: async ({ page }, provide) => {
    await page.goto("/home");
    const profileId = await waitForAppShell(page);
    await provide(profileId);
  },
});

export { expect, gotoWorkspace, waitForAppShell };
