import { defineConfig, devices } from "@playwright/test";

/**
 * Save State — auditoria E2E + performance client-side.
 *
 * Ambiente isolado de testes:
 * - Servidor: `next start` (build de produção) na porta 3101.
 * - Banco: E2E_MONGODB_URI local, efêmero, save-state-e2e e replica set.
 * - O `webServer` usa porta dedicada e nunca reaproveita um servidor ativo.
 *
 * Uso:
 *   1. pnpm build
 *   2. pnpm audit:e2e        (sobe servidor de produção + executa E2E funcional)
 *   3. pnpm audit:perf       (executa métricas client-side)
 *   4. pnpm audit:lighthouse (Lighthouse nas páginas principais)
 */
const E2E_PORT = Number(process.env.E2E_PORT ?? 3101);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;
const e2eMongoUri = process.env.E2E_MONGODB_URI ?? "";
const emailCaptureRequested = process.env.E2E_EMAIL_CAPTURE === "1";
const emailCaptureFile = process.env.E2E_EMAIL_CAPTURE_FILE ?? "";

function isSafeEphemeralReplicaSet(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === "mongodb:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      parsed.pathname.replace(/^\//u, "") === "save-state-e2e" &&
      parsed.searchParams.has("replicaSet")
    );
  } catch {
    return false;
  }
}

if (
  emailCaptureRequested &&
  (process.env.E2E_DATABASE_EPHEMERAL !== "1" ||
    !isSafeEphemeralReplicaSet(e2eMongoUri) ||
    !emailCaptureFile)
) {
  throw new Error("E2E email capture requires an explicitly opted-in local ephemeral replica set and capture file");
}

const emailCaptureEnabled = emailCaptureRequested;
const nextStartCommand = emailCaptureEnabled
  ? `node --require ./tests/e2e-perf/capture-resend.cjs ./node_modules/next/dist/bin/next start --port ${E2E_PORT}`
  : `npx next start --port ${E2E_PORT}`;

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
    command: nextStartCommand,
    url: `${BASE_URL}/api/health`,
      reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(E2E_PORT),
      MONGODB_URI: process.env.E2E_MONGODB_URI ?? "",
      MONGODB_DB_NAME: "save-state-e2e",
      JWT_SECRET: "e2e-test-secret-e2e-test-secret-1234",
      JWT_EXPIRES_IN: "7d",
      APP_URL: process.env.E2E_APP_URL ?? BASE_URL,
      SEARCH_METHOD: "IGDB",
      // Twitch E2E credentials are NEVER committed. Provide them via the
      // environment when E2E/perf suites need the live IGDB path; empty
      // values keep local-only suites working. If the previously committed
      // pair was a live app key, rotate/revoke it in the Twitch console.
      TWITCH_CLIENT_ID: process.env.E2E_TWITCH_CLIENT_ID ?? "",
      TWITCH_CLIENT_SECRET: process.env.E2E_TWITCH_CLIENT_SECRET ?? "",
      ...(emailCaptureEnabled
        ? {
            E2E_DATABASE_EPHEMERAL: "1",
            E2E_MONGODB_URI: e2eMongoUri,
            E2E_EMAIL_CAPTURE: "1",
            E2E_EMAIL_CAPTURE_FILE: emailCaptureFile,
            RESEND_API_KEY: "e2e-only-not-a-real-key",
            EMAIL_FROM: "Save State E2E <no-reply@example.invalid>",
          }
        : {}),
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
