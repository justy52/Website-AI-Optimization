import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.OPTIQ_E2E_BASE_URL ?? "https://optiq-qa.vercel.app";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // QA shares an auth rate-limit boundary; avoid bursts of disposable signups.
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL,
    actionTimeout: 45_000,
    storageState: process.env.OPTIQ_E2E_STORAGE_STATE || undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: process.env.OPTIQ_E2E_BROWSER === "firefox" ? [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }] : [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
