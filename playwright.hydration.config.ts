import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "hydration-preferences.spec.ts",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.HYDRATION_BASE_URL ?? "http://127.0.0.1:3000",
    launchOptions: {
      executablePath:
        process.env.CHROME_EXECUTABLE ??
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
    },
    trace: "retain-on-failure",
  },
});
