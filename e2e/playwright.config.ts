import { defineConfig, devices } from "@playwright/test";
import {
  AUTH_STATE_PATH,
  e2eBaseURL,
  hasE2ECredentials,
  loadE2EEnvFiles,
} from "./helpers/env";

loadE2EEnvFiles();

const authEnabled = hasE2ECredentials();
const startWebServer = process.env.E2E_WEB_SERVER === "1";

export default defineConfig({
  testDir: ".",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "./playwright-report", open: "never" }],
  ],
  use: {
    baseURL: e2eBaseURL(),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1400, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: startWebServer
    ? {
        command: "pnpm --filter web dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "unauth",
      testMatch: /specs\/landing\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    ...(authEnabled
      ? [
          {
            name: "setup",
            testMatch: /auth\.setup\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
          {
            name: "chromium",
            dependencies: ["setup"],
            testIgnore: /specs\/landing\.spec\.ts|auth\.setup\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: AUTH_STATE_PATH,
            },
          },
        ]
      : []),
  ],
});
