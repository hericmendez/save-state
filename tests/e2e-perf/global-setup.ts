/**
 * Setup global da auditoria E2E/perf.
 *
 * Derruba APENAS o banco isolado de testes (`save-state-e2e`).
 * Trava de segurança: exige banco save-state-e2e, host local, replica set e
 * opt-ins explícitos. Nunca toca no banco de desenvolvimento/produção.
 */
import mongoose from "mongoose";
import { spawnSync } from "node:child_process";

const E2E_URI =
  process.env.E2E_MONGODB_URI;

async function globalSetup(): Promise<void> {
  if (
    process.env.E2E_DATABASE_EPHEMERAL !== "1" ||
    process.env.E2E_ALLOW_DATABASE_RESET !== "1" ||
    !E2E_URI
  ) {
    throw new Error(
      "[global-setup] Refusing database reset without explicit ephemeral E2E opt-in",
    );
  }
  const parsed = new URL(E2E_URI);
  const dbName = new URL(E2E_URI).pathname.replace("/", "") || "(default)";
  if (
    dbName !== "save-state-e2e" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !parsed.searchParams.has("replicaSet")
  ) {
    throw new Error(
      `[global-setup] REFUSADO: nome de banco "${dbName}" não parece ser de teste. ` +
        `Abortando para proteger dados reais.`,
    );
  }
  await mongoose.connect(E2E_URI);
  await mongoose.connection.db?.dropDatabase();
  await mongoose.disconnect();
  const provisionOptions = {
    cwd: process.cwd(),
    env: { ...process.env, MONGODB_URI: E2E_URI, MONGODB_DB_NAME: dbName },
    stdio: "inherit" as const,
  };
  const provision = process.platform === "win32"
    ? spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `pnpm db:indexes -- --create-missing --yes --db-name ${dbName}`],
        provisionOptions,
      )
    : spawnSync(
        "pnpm",
        ["db:indexes", "--", "--create-missing", "--yes", "--db-name", dbName],
        provisionOptions,
      );
  if (provision.error || provision.status !== 0) {
    throw new Error("[global-setup] Failed to provision indexes in the opted-in ephemeral E2E database");
  }
  // (log intencional de auditoria)
  console.log(`[global-setup] banco isolado "${dbName}" limpo para a auditoria.`);
}

export default globalSetup;
