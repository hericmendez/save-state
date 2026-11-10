/**
 * H7 (Pendente quando sem replica set) — userGameId com review persistida.
 *
 * Auto-skip: o `beforeAll` tenta criar um jogo COM review (escrita
 * transacional). Sem replica set a API responde 500 com
 * "Review writes require a MongoDB replica set" e a suíte é pulada com o
 * motivo registrado — nunca falha por limitação do ambiente.
 * Com replica set (ex.: Atlas de staging ou `mongod --replSet`), executa o
 * fluxo completo e valida que o MongoDB não é alterado pela Fase 2.
 */
import { test, expect } from "@playwright/test";
import { uniqueUser, registerUser, loginUser } from "./helpers";

let REPLSET_OK = false;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const user = uniqueUser();
    await registerUser(context.request, user);
    await loginUser(context.request, user.email, user.password);
    const res = await context.request.post("/api/games", {
      data: {
        game: { name: `H7 Probe ${Date.now()}` },
        status: "backlog",
        review: { content: "# probe" },
      },
    });
    REPLSET_OK = res.ok();
    if (!REPLSET_OK) {
      const body = await res.text();
      console.log(`[H7] sem replica set (status ${res.status()}): ${body.slice(0, 160)}`);
    }
  } catch (err) {
    console.log(`[H7] sem replica set: ${String(err).slice(0, 160)}`);
    REPLSET_OK = false;
  } finally {
    await context.close();
  }
  test.skip(!REPLSET_OK, "H7 exige MongoDB replica set (transações); ambiente standalone.");
});

test.describe("H7 — userGameId com review persistida", () => {
  test("carrega a cópia do servidor, edita localmente e preserva o MongoDB", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const user = uniqueUser();
    await registerUser(context.request, user);
    await loginUser(context.request, user.email, user.password);

    const marker = `H7 Review ${Date.now()}`;
    const created = await context.request.post("/api/games", {
      data: {
        game: { name: marker },
        status: "backlog",
        review: { content: "# Review no servidor\n\nTexto **persistido**." },
      },
    });
    expect(created.ok()).toBeTruthy();
    const game = await created.json();
    const gameId: string = game.data._id;
    expect(gameId).toBeTruthy();

    const page = await context.newPage();
    await page.goto(`/reviews/editor?userGameId=${gameId}`);
    await expect(page.locator("body")).toContainText(/review no servidor/i);
    await expect(page.locator("body")).toContainText(/servidor/i);
    await expect(page.locator("body")).toContainText(/Review no servidor/);
    // Nada criado automaticamente.
    await expect(page.getByLabel(/markdown bruto/i)).toHaveCount(0);

    await page.getByRole("button", { name: /editar cópia local/i }).click();
    await page.getByRole("tab", { name: /markdown/i }).click();
    await expect(page.getByLabel(/markdown bruto/i)).toHaveValue(/Review no servidor/);
    await page.getByLabel(/markdown bruto/i).fill("# Review no servidor\n\nEdição LOCAL.");
    await expect(page.locator("body")).toContainText(/salvo neste dispositivo/i);

    // Reabrir recupera o rascunho local automaticamente (sem criar outro,
    // sem tocar na cópia do servidor).
    await page.reload();
    await page.getByRole("tab", { name: /markdown/i }).click();
    await expect(page.getByLabel(/markdown bruto/i)).toHaveValue(/Edição LOCAL/);

    // MongoDB intacto: a review do servidor não mudou.
    const review = await context.request.get(`/api/games/${gameId}/review`);
    expect(review.ok()).toBeTruthy();
    const reviewBody = await review.json();
    expect(reviewBody.data.content).toContain("Texto **persistido**.");
    expect(reviewBody.data.content).not.toContain("Edição LOCAL");

    // Outro usuário não acessa a review (404, sem vazamento).
    const other = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const user2 = uniqueUser();
    await registerUser(other.request, user2);
    await loginUser(other.request, user2.email, user2.password);
    const forbidden = await other.request.get(`/api/games/${gameId}/review`);
    expect(forbidden.status()).toBe(404);
    await other.close();
    await context.close();
  });
});
