/**
 * E2E — Autenticação e sessão (fluxos reais do código).
 *
 * Cobre: acesso, login, logout, persistência de sessão, expiração/invalidação,
 * redirecionamentos, 401/403 e isolamento entre usuários (ownership).
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  uniqueUser,
  createVerifiedUserFixture,
  loginUser,
  createGame,
  createPendingUser,
  createPasswordResetToken,
  getE2EVerificationState,
} from "./helpers";

// Confirmation links contain bearer tokens; never persist them in traces or screenshots.
test.use({ trace: "off", screenshot: "off", video: "off" });

/**
 * Contexto 100% limpo (sem storageState do projeto): garante visitante
 * real independentemente de como o runner injeta estado nos contextos manuais.
 */
async function freshContext(browser: import("@playwright/test").Browser) {
  return browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
}

function interceptedVerificationPath(): string {
  const captureFile = process.env.E2E_EMAIL_CAPTURE_FILE;
  if (!captureFile) throw new Error("E2E email capture is not configured");
  const messages = readFileSync(captureFile, "utf8").trim().split("\n").filter(Boolean);
  if (messages.length === 0) throw new Error("No email was captured by the local E2E adapter");
  const latest = JSON.parse(messages[messages.length - 1]) as { text: string };
  const link = /https:\/\/localhost:3101\/verify-email\?token=[^\s]+/u.exec(latest.text)?.[0];
  if (!link) throw new Error("Captured message did not contain a verification link");
  const parsed = new URL(link);
  return `${parsed.pathname}${parsed.search}`;
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
    await createVerifiedUserFixture(request, user);

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

  test("cadastro, email interceptado, confirmação pela UI e login", async ({ browser }) => {
    const context = await freshContext(browser);
    const page = await context.newPage();
    const user = uniqueUser();

    await page.goto("/register");
    await page.getByLabel("Nome").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(user.password);
    await page.getByLabel("Confirmar senha").fill(user.password);
    const registrationResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/register"),
    );
    await page.getByRole("button", { name: /criar conta/i }).click();
    const registrationResponse = await registrationResponsePromise;
    expect(registrationResponse.status()).toBe(201);
    const genericRegistrationBody = await registrationResponse.json();
    expect(genericRegistrationBody).toEqual({
      data: {
        message:
          "Se o endereço puder receber uma confirmação, enviaremos instruções. Verifique sua caixa de entrada ou solicite outro link.",
      },
    });
    await expect(page).toHaveURL(/\/check-email/);

    expect(await getE2EVerificationState(user.email)).toEqual({ exists: true, verified: false });
    expect((await context.request.get("/api/auth/me")).status()).toBe(401);
    const captureFile = process.env.E2E_EMAIL_CAPTURE_FILE;
    if (!captureFile) throw new Error("E2E email capture is not configured");
    await expect.poll(() => {
      const captured = readFileSync(captureFile, "utf8").trim();
      return captured ? captured.split("\n").length : 0;
    }).toBe(1);

    const duplicatePending = await context.request.post("/api/auth/register", {
      data: { ...user, password: "different-password-456" },
    });
    expect(duplicatePending.status()).toBe(registrationResponse.status());
    expect(await duplicatePending.json()).toEqual(genericRegistrationBody);
    expect(readFileSync(captureFile, "utf8").trim().split("\n")).toHaveLength(1);
    expect((await context.request.post("/api/auth/login", {
      data: { email: user.email, password: user.password },
    })).status()).toBe(401);

    const confirmationPath = interceptedVerificationPath();
    await page.goto(confirmationPath).catch(() => {
      throw new Error("Could not open the locally intercepted email confirmation link");
    });
    await page.getByRole("button", { name: /confirmar e-mail/i }).click();
    await expect(page.getByRole("status")).toContainText(/e-mail confirmado/i);
    expect(await getE2EVerificationState(user.email)).toEqual({ exists: true, verified: true });

    const duplicateVerified = await context.request.post("/api/auth/register", {
      data: { ...user, password: "another-password-789" },
    });
    expect(duplicateVerified.status()).toBe(registrationResponse.status());
    expect(await duplicateVerified.json()).toEqual(genericRegistrationBody);
    expect(readFileSync(captureFile, "utf8").trim().split("\n")).toHaveLength(1);
    expect((await context.request.post("/api/auth/login", {
      data: { email: user.email, password: "another-password-789" },
    })).status()).toBe(401);

    await page.getByRole("button", { name: /ir para login/i }).click();
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/senha/i).fill(user.password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login/);

    await context.close();
  });

  test("conta pendente não autentica; confirmação pelo endpoint permite login", async ({ browser }) => {
    const context = await freshContext(browser);
    const request = context.request;
    const user = uniqueUser();
    const rawToken = await createPendingUser(user);
    const pendingLogin = await request.post("/api/auth/login", {
      data: { email: user.email, password: user.password },
    });
    expect(pendingLogin.status()).toBe(401);
    expect((await pendingLogin.json()).error.message).toBe("Invalid credentials");
    expect((await request.get("/api/auth/me")).status()).toBe(401);

    const verified = await request.post("/api/auth/verify-email", {
      data: { token: rawToken },
    });
    expect(verified.ok()).toBeTruthy();
    await loginUser(request, user.email, user.password);
    expect((await request.get("/api/auth/me")).ok()).toBeTruthy();
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
    await createVerifiedUserFixture(request, userA);
    await loginUser(request, userA.email, userA.password);
    const game = await createGame(request, {
      game: { name: `Jogo Privado ${Date.now()}` },
      status: "backlog",
    });
    const gameId: string = game._id ?? game.id;
    expect(gameId).toBeTruthy();

    const userB = uniqueUser();
    await createVerifiedUserFixture(request, userB);
    await loginUser(request, userB.email, userB.password);

    const res = await request.get(`/api/games/${gameId}`);
    expect([403, 404]).toContain(res.status());
  });

  test("sessionVersion: troca de senha invalida sessões antigas", async ({
    page,
    request,
  }) => {
    const user = uniqueUser();
    await createVerifiedUserFixture(request, user);
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

  test("reset consome um token uma vez e invalida a sessão antiga", async ({ request }) => {
    const user = uniqueUser();
    await createVerifiedUserFixture(request, user);
    await loginUser(request, user.email, user.password);
    const oldSession = await request.get("/api/auth/me");
    expect(oldSession.ok()).toBeTruthy();
    const resetToken = await createPasswordResetToken(user.email);

    const reset = await request.post("/api/auth/reset-password", {
      data: { token: resetToken, password: "reset-E2E-password-456" },
    });
    expect(reset.ok()).toBeTruthy();
    expect((await request.post("/api/auth/reset-password", {
      data: { token: resetToken, password: "another-E2E-password-789" },
    })).status()).toBe(400);
    expect((await request.get("/api/auth/me")).status()).toBe(401);
    await loginUser(request, user.email, "reset-E2E-password-456");
    expect((await request.get("/api/auth/me")).ok()).toBeTruthy();
  });
});
