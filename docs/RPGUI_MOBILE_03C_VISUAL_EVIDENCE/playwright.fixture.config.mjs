/**
 * Isolated Playwright runner for the real MOBILE-03C React shell mounted in
 * the local Vite fixture. It intentionally skips production auth, database
 * setup, the app's webServer, and the production storageState.
 */
const config = {
  testDir: "C:/Users/Heric/Documents/save-state/tests/e2e-perf",
  testMatch: ["matrix-viewport.spec.ts"],
  testIgnore: [],
  globalSetup: undefined,
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  outputDir:
    "C:/Users/Heric/Documents/save-state/docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/test-results",
  projects: [
    {
      name: "mobile03c-fixture",
      use: {
        baseURL: "http://127.0.0.1:4173",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        launchOptions: {
          executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
        },
      },
    },
  ],
};

export default config;
