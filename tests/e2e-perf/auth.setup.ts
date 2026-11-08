/**
 * Setup de autenticação: cria UM usuário de auditoria (único por execução),
 * faz login e persiste o storageState para os projetos e2e/perf/matrix.
 */
import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { uniqueUser, registerUser } from "./helpers";

const AUTH_FILE = "tests/e2e-perf/.auth/user.json";

setup("auth.setup: registra e autentica usuário de auditoria", async ({
  page,
  request,
}) => {
  const user = uniqueUser();
  await registerUser(request, user);

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/senha/i).fill(user.password);
  await page.getByRole("button", { name: /entrar/i }).click();

  // Login redireciona para /home (Server Component autenticado).
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(/jogos|dashboard|backlog/i, {
    timeout: 15_000,
  });

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
