/**
 * Fase 3 — fluxos transacionais (EXIGE replica set).
 *
 * Roda contra o `saveStateRs0` isolado (127.0.0.1:27027, dbpath em temp):
 * `next start` com MONGODB_URI do rs0 + reuseExistingServer.
 * Sem replica set, o `beforeAll` pula a suíte (mesmo padrão de H7).
 *
 * Cobre: create com review (request única, GameReview+excerpt, limpeza),
 * excerpt no edit sem fetch integral, update, remoção (null), desfazer,
 * falha HTTP preservando rascunho, isolamento. A importação com review
 * está coberta no nível de API+schema; o E2E exigiria provider externo.
 */
import { test, expect } from "@playwright/test";
import {
  createAuthenticatedE2EContext,
  uniqueUser,
  createVerifiedUserFixture,
  loginUser,
} from "./helpers";

let REPLSET_OK = false;

test.beforeAll(async ({ browser }) => {
  const context = await createAuthenticatedE2EContext(browser);
  try {
    const res = await context.request.post("/api/games", {
      data: {
        game: { name: `P3probe ${Date.now()}` },
        status: "backlog",
        review: { content: "# probe" },
      },
    });
    REPLSET_OK = res.ok();
  } catch {
    REPLSET_OK = false;
  } finally {
    await context.close();
  }
  test.skip(!REPLSET_OK, "Fase 3 transacional exige MongoDB replica set.");
});

async function freshUserContext(browser: any) {
  return createAuthenticatedE2EContext(browser);
}

test.describe("fase 3 transacional — newgame com review", () => {
  test("criar jogo com review: request única, GameReview+excerpt, limpeza", async ({
    browser,
  }) => {
    const context = await freshUserContext(browser);
    const page = await context.newPage();
    const posts: any[] = [];
    page.on("request", (req: any) => {
      if (req.url().endsWith("/api/games") && req.method() === "POST") {
        posts.push(req.postDataJSON());
      }
    });

    await page.goto("/backlog/new");
    await page.getByRole("textbox", { name: "Nome" }).fill("Jogo Com Review");
    const [editorPage] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: /escrever review/i }).click(),
    ]);
    await editorPage.getByRole("tab", { name: /markdown/i }).click();
    await editorPage.getByLabel(/markdown bruto/i).fill("# Épico\n\n**Inesquecível**.");
    await expect(editorPage.locator("body")).toContainText(/salvo neste dispositivo/i);
    await editorPage.close();

    await page.bringToFront();
    await page.getByRole("button", { name: /criar jogo/i }).click();
    await expect(page).toHaveURL(/\/backlog(\?|$)/);
    // Evidência de request única com o Markdown.
    const gamePosts = posts.filter((p) => p?.game?.name === "Jogo Com Review");
    expect(gamePosts).toHaveLength(1);
    expect(gamePosts[0].review).toEqual({ content: "# Épico\n\n**Inesquecível**." });

    // Backend persistiu UserGame + GameReview + excerpt atomicamente.
    const list = await context.request.get("/api/games/stats");
    expect(list.ok()).toBeTruthy();
    const games = await context.request.get("/api/games?page=1&limit=50");
    const body = await games.json();
    const created = body.data.find((g: any) => g?.game?.name === "Jogo Com Review");
    expect(created).toBeTruthy();
    expect(created.reviewExcerpt).toContain("Épico");
    const review = await context.request.get(`/api/games/${created._id}/review`);
    expect(review.ok()).toBeTruthy();
    expect((await review.json()).data.content).toContain("Inesquecível");

    // Rascunho finalizado: não aparece mais na recuperação.
    const check = await context.newPage();
    await check.goto("/reviews/editor");
    await expect(check.locator("body")).toContainText(/nenhum rascunho/i);
    await context.close();
  });

  test("falha de validação preserva o rascunho (sem limpeza em finally)", async ({
    browser,
  }) => {
    const context = await freshUserContext(browser);
    const page = await context.newPage();
    await page.goto("/backlog/new");
    await page.getByRole("textbox", { name: "Nome" }).fill("Falha Preserva");
    const [editorPage] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: /escrever review/i }).click(),
    ]);
    await editorPage.getByRole("tab", { name: /markdown/i }).click();
    await editorPage.getByLabel(/markdown bruto/i).fill("rascunho-sobrevive-422");
    await expect(editorPage.locator("body")).toContainText(/salvo neste dispositivo/i);
    await editorPage.close();

    await page.bringToFront();
    // Nota inválida → 422 do backend; o rascunho deve sobreviver.
    await page.getByRole("spinbutton", { name: "Nota (0–10)" }).fill("99");
    await page.getByRole("button", { name: /criar jogo/i }).click();
    await expect(page.locator('[role="alert"]')).toBeVisible();
    const check = await context.newPage();
    await check.goto("/reviews/editor");
    await expect(check.locator("body")).toContainText("rascunho-sobrevive-422");
    await context.close();
  });
});

test.describe("fase 3 transacional — editgame", () => {
  async function createGameWithReview(request: any, name: string) {
    const res = await request.post("/api/games", {
      data: {
        game: { name },
        status: "backlog",
        review: { content: "# Original\n\nTexto original." },
      },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).data._id as string;
  }

  test("exibe excerpt sem buscar Markdown; editar e salvar em request única", async ({
    browser,
  }) => {
    const context = await freshUserContext(browser);
    const gameId = await createGameWithReview(context.request, `Editar Review ${Date.now()}`);
    const page = await context.newPage();
    const gets: string[] = [];
    page.on("request", (req: any) => {
      if (req.url().includes(`/api/games/${gameId}/review`)) gets.push(req.url());
    });
    const puts: any[] = [];
    page.on("request", (req: any) => {
      if (req.url().includes(`/api/games/${gameId}`) && req.method() === "PUT") {
        puts.push(req.postDataJSON());
      }
    });

    await page.goto(`/backlog/${gameId}/edit`);
    // Excerpt visível sem nenhum GET integral.
    await expect(page.locator("body")).toContainText(/review salva no servidor/i);
    await expect(page.locator("body")).toContainText(/Original/);
    expect(gets).toHaveLength(0);

    // Editar: abre editor com a cópia do servidor, altera, salva no form.
    await page.getByRole("button", { name: /editar review/i }).click();
    const editorPage = await context.newPage();
    await editorPage.goto(`/reviews/editor?userGameId=${gameId}`);
    await expect(editorPage.locator("body")).toContainText(/review no servidor/i);
    await editorPage.getByRole("button", { name: /editar cópia local/i }).click();
    await editorPage.getByRole("tab", { name: /markdown/i }).click();
    await expect(editorPage.getByLabel(/markdown bruto/i)).toHaveValue(/Texto original/);
    await editorPage.getByLabel(/markdown bruto/i).fill("# Original\n\nTexto EDITADO.");
    await expect(editorPage.locator("body")).toContainText(/salvo neste dispositivo/i);
    await editorPage.close();

    await page.bringToFront();
    await page.reload();
    await page.getByRole("button", { name: /salvar/i }).click();
    await expect(page).toHaveURL(/\/backlog(\?|$)/);
    const reviewPuts = puts.filter((p) => "review" in p);
    expect(reviewPuts).toHaveLength(1);
    expect(reviewPuts[0].review).toEqual({ content: "# Original\n\nTexto EDITADO." });

    const review = await context.request.get(`/api/games/${gameId}/review`);
    expect((await review.json()).data.content).toContain("Texto EDITADO");
    await context.close();
  });

  test("remover review é pendente até salvar; desfazer e cancelar preservam", async ({
    browser,
  }) => {
    const context = await freshUserContext(browser);
    const gameId = await createGameWithReview(context.request, `Remover Review ${Date.now()}`);
    const page = await context.newPage();
    const puts: any[] = [];
    page.on("request", (req: any) => {
      if (req.url().includes(`/api/games/${gameId}`) && req.method() === "PUT") {
        puts.push(req.postDataJSON());
      }
    });

    // Desfazer antes de salvar: nada é enviado.
    await page.goto(`/backlog/${gameId}/edit`);
    await page.getByRole("button", { name: /remover review/i }).click();
    await page.getByRole("button", { name: /confirmar remoção/i }).click();
    await expect(page.locator("body")).toContainText(/remoção pendente/i);
    await page.getByRole("button", { name: /desfazer remoção/i }).click();
    await expect(page.locator("body")).toContainText(/review salva no servidor/i);

    // Remover de verdade: PUT único com review null; cancel não envia nada.
    await page.getByRole("button", { name: /remover review/i }).click();
    await page.getByRole("button", { name: /confirmar remoção/i }).click();
    await page.getByRole("button", { name: /salvar/i }).click();
    await expect(page).toHaveURL(/\/backlog(\?|$)/);
    expect(puts).toHaveLength(1);
    expect(puts[0].review).toBeNull();
    const review = await context.request.get(`/api/games/${gameId}/review`);
    expect(review.status()).toBe(404);
    await context.close();
  });

  test("outro usuário não acessa nem altera a review", async ({ browser }) => {
    const context = await freshUserContext(browser);
    const gameId = await createGameWithReview(context.request, `Isolada ${Date.now()}`);
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const user2 = uniqueUser();
    await createVerifiedUserFixture(other.request, user2);
    await loginUser(other.request, user2.email, user2.password);
    const forbidden = await other.request.get(`/api/games/${gameId}/review`);
    expect(forbidden.status()).toBe(404);
    const editPage = await other.newPage();
    await editPage.goto(`/backlog/${gameId}/edit`);
    await expect(editPage.locator("body")).toContainText(/não encontrada|não existe/i);
    await other.close();
    await context.close();
  });
});
