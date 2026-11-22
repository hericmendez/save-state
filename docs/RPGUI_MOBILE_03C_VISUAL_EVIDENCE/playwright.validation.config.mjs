/**
 * Browser matrix for the actual MOBILE-03C shell/components in a local
 * fixture. No application server, auth state, or database is used.
 */
const config = {
  testDir: "C:/Users/Heric/Documents/save-state/docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE",
  testMatch: ["mobile03c-fixture.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  outputDir:
    "C:/Users/Heric/Documents/save-state/docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/test-results",
  projects: [
    {
      name: "mobile03c-component-fixture",
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
