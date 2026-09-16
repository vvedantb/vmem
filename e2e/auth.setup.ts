import { test as setup } from "@playwright/test";
import { signInAsEva } from "./helpers/auth";
import { AUTH_STATE_PATH, requireE2ECredentials } from "./helpers/env";

setup(
  "authenticate as eva@",
  { tag: ["@auth", "@setup"] },
  async ({ page }) => {
    const creds = requireE2ECredentials();
    await signInAsEva(page, creds);
    await page.context().storageState({ path: AUTH_STATE_PATH });
  },
);
