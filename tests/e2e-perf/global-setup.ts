/**
 * Setup global da auditoria E2E/perf.
 *
 * Derruba APENAS o banco isolado de testes (`save-state-e2e`).
 * Trava de segurança: recusa operar se o nome do banco não contiver
 * `e2e` ou `test`. Nunca toca no banco de desenvolvimento/produção.
 */
import mongoose from "mongoose";

const E2E_URI =
  process.env.E2E_MONGODB_URI ?? "mongodb://localhost:27017/save-state-e2e";

async function globalSetup(): Promise<void> {
  const dbName = new URL(E2E_URI).pathname.replace("/", "") || "(default)";
  if (!/e2e|test/i.test(dbName)) {
    throw new Error(
      `[global-setup] REFUSADO: nome de banco "${dbName}" não parece ser de teste. ` +
        `Abortando para proteger dados reais.`,
    );
  }
  await mongoose.connect(E2E_URI);
  await mongoose.connection.db?.dropDatabase();
  await mongoose.disconnect();
  // (log intencional de auditoria)
  console.log(`[global-setup] banco isolado "${dbName}" limpo para a auditoria.`);
}

export default globalSetup;
