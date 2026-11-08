/**
 * E2E — Autenticação e sessão (fluxos reais do código).
 *
 * Cobre: acesso, login, logout, persistência de sessão, expiração/invalidação,
 * redirecionamentos, 401/403 e isolamento entre usuários (ownership).
 */
import { test, expect } from "@playwright/test";
import { uniqueUser, registerUser, loginUser, createGame } from "./helpers";

/**
 * Contexto 100% limpo (sem storageState do projeto): garante visitante
 * real independentemente de como o runner injeta estado nos contextos manuais.
 */
async function freshContext(browser: import("@playwright/test").Browser) {
  return browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
}

test.describe("autenticação e sessão", () => {
  test("visitante é redirecionado para /login ao acessar rota protegida", async ({
    browser,
  }) => {
    const context = await freshContext(browser);
    const page = await context.newPage();
    await page.goto("/backlog");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("login via UI autentica e persiste sessão durante navegação", async ({
    browser,
    request,
  }) => {
    const user = uniqueUser();
    await registerUser(request, user);

    const context = await freshContext(browser);
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/senha/i).fill(user.password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/home/);

    // Persistência: navegar entre seções mantém a sessão.
    for (const route of ["/dashboard", "/backlog", "/diary", "/home"]) {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login/);
    }
    await context.close();
  });

  test("logout encerra a sessão e protege as rotas novamente", async ({
    page,
  }) => {
    // storageState já autenticado (auth.setup).
    await page.goto("/home");
    await expect(page).not.toHaveURL(/\/login/);

    const res = await page.request.post("/api/logout");
    expect(res.ok()).toBeTruthy();

    await page.goto("/backlog");
    await expect(page).toHaveURL(/\/login/);
  });

  test("cookie inválido/expirado redireciona para login (401 funcional)", async ({
    browser,
  }) => {
    const context = await freshContext(browser);
    await context.addCookies([
      {
        name: "token",
        value: "token-invalido-para-auditoria",
        domain: "localhost",
        path: "/",
      },
    ]);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("API sem cookie retorna 401 no contrato { error: { code, message } }", async ({
    browser,
  }) => {
    const context = await freshContext(browser);
    const res = await context.request.get("/api/games");
    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBeTruthy();
    expect(json.error.message).toBeTruthy();
    await context.close();
  });

  test("isolamento: usuário B não acessa jogo do usuário A", async ({
    page,
    request,
  }) => {
    const userA = uniqueUser();
    await registerUser(request, userA);
    await loginUser(request, userA.email, userA.password);
    const game = await createGame(request, {
      game: { name: `Jogo Privado ${Date.now()}` },
      status: "backlog",
    });
    const gameId: string = game._id ?? game.id;
    expect(gameId).toBeTruthy();

    const userB = uniqueUser();
    await registerUser(request, userB);
    await loginUser(request, userB.email, userB.password);

    const res = await request.get(`/api/games/${gameId}`);
    expect([403, 404]).toContain(res.status());
  });

  test("sessionVersion: troca de senha invalida sessões antigas", async ({
    page,
    request,
  }) => {
    const user = uniqueUser();
    await registerUser(request, user);
    await loginUser(request, user.email, user.password);

    // Captura o cookie da sessão antiga.
    const meBefore = await request.get("/api/auth/me");
    expect(meBefore.ok()).toBeTruthy();

    const change = await request.post("/api/auth/change-password", {
      data: { currentPassword: user.password, newPassword: "nova-Senha-456" },
    });
    expect(change.ok()).toBeTruthy();

    // Sessão antiga (mesmo cookie) deve ser rejeitada após o bump.
    const meAfter = await request.get("/api/auth/me");
    expect(meAfter.status()).toBe(401);

    // Nova senha funciona.
    await loginUser(request, user.email, "nova-Senha-456");
    const meNew = await request.get("/api/auth/me");
    expect(meNew.ok()).toBeTruthy();
  });
});
