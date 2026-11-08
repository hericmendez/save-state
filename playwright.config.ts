import { defineConfig, devices } from "@playwright/test";

/**
 * Save State — auditoria E2E + performance client-side.
 *
 * Ambiente isolado de testes:
 * - Servidor: `next start` (build de produção) na porta 3101.
 * - Banco: mongodb://localhost:27017/save-state-e2e (NUNCA o banco de dev).
 * - O `webServer` reaproveita um servidor já em execução (`reuseExistingServer`),
 *   ou sobe um próprio com as variáveis de ambiente de teste.
 *
 * Uso:
 *   1. pnpm build
 *   2. pnpm audit:e2e        (sobe servidor de produção + executa E2E funcional)
 *   3. pnpm audit:perf       (executa métricas client-side)
 *   4. pnpm audit:lighthouse (Lighthouse nas páginas principais)
 */
const E2E_PORT = Number(process.env.E2E_PORT ?? 3101);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e-perf",
  globalSetup: "./tests/e2e-perf/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "tests/e2e-perf/.report", open: "never" }],
    ["json", { outputFile: "tests/e2e-perf/.results/summary.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: `npx next start --port ${E2E_PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      PORT: String(E2E_PORT),
      MONGODB_URI: "mongodb://localhost:27017/save-state-e2e",
      JWT_SECRET: "e2e-test-secret-e2e-test-secret-1234",
      JWT_EXPIRES_IN: "7d",
      APP_URL: BASE_URL,
      SEARCH_METHOD: "IGDB",
      // Twitch E2E credentials are NEVER committed. Provide them via the
      // environment when E2E/perf suites need the live IGDB path; empty
      // values keep local-only suites working. If the previously committed
      // pair was a live app key, rotate/revoke it in the Twitch console.
      TWITCH_CLIENT_ID: process.env.E2E_TWITCH_CLIENT_ID ?? "",
      TWITCH_CLIENT_SECRET: process.env.E2E_TWITCH_CLIENT_SECRET ?? "",
    },
  },
  projects: [
    { name: "auth-setup", testMatch: /\/auth\.setup\.ts/ },
    {
      name: "e2e",
      testMatch: /\/e2e-[^/]+\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        storageState: "tests/e2e-perf/.auth/user.json",
      },
    },
    {
      name: "perf",
      testMatch: /\/perf-[^/]+\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        storageState: "tests/e2e-perf/.auth/user.json",
        launchOptions: {
          args: ["--enable-precise-memory-info"],
        },
      },
    },
    {
      name: "mobile-matrix",
      testMatch: /\/matrix-[^/]+\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Pixel 7"],
        storageState: "tests/e2e-perf/.auth/user.json",
      },
    },
  ],
});
