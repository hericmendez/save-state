/**
 * E2E — Review Editor Markdown (Fase 2).
 *
 * Cobre a página independente `/reviews/editor`: estado vazio, criação de
 * rascunho, edição Markdown com autosave em IndexedDB, recuperação após
 * reload, modos visual/prévia e isolamento por conta. Não toca no MongoDB
 * para escrita (somente leitura do fluxo `?userGameId=`).
 */
import { test, expect } from "@playwright/test";
import {
  uniqueId,
  uniqueUser,
  createVerifiedUserFixture,
  loginUser,
  createAuthenticatedE2EContext,
  createGame,
} from "./helpers";

async function sharedUserContext(browser: any) {
  const context = await createAuthenticatedE2EContext(browser);
  const page = await context.newPage();
  return { context, page };
}

async function freshUserContext(browser: any) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const user = uniqueUser();
  await createVerifiedUserFixture(context.request, user);
  await loginUser(context.request, user.email, user.password);
  const page = await context.newPage();
  return { context, page, user };
}

test.describe("review editor — página independente", () => {
  test("estado vazio oferece criação explícita de rascunho", async ({ browser }) => {
    const { context, page } = await sharedUserContext(browser);
    await page.goto("/reviews/editor");
    await expect(page.getByRole("heading", { name: /review editor/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/nenhum rascunho/i);
    await expect(page.getByRole("button", { name: /novo rascunho/i }).first()).toBeVisible();
    await context.close();
  });

  test("criar rascunho, editar Markdown e recuperar após reload", async ({ browser }) => {
    const { context, page } = await sharedUserContext(browser);
    await page.goto("/reviews/editor");
    await page.getByRole("button", { name: /novo rascunho/i }).first().click();

    // O modo inicial é visual (Tiptap); alternar para Markdown bruto.
    await expect(page.locator(".tiptap")).toBeVisible();
    await page.getByRole("tab", { name: /markdown/i }).click();
    const source = page.getByLabel(/markdown bruto/i);
    await expect(source).toBeVisible();
    await source.fill("# E2E Review\n\nTexto **persistente**.");
    // Autosave (debounce 500ms) + status local.
    await expect(page.locator("body")).toContainText(/salvo neste dispositivo/i);

    await page.reload();
    // Sem parâmetros, a tela abre na recuperação: continuar pelo link.
    await page.getByRole("link", { name: /continuar escrevendo/i }).click();
    await page.getByRole("tab", { name: /markdown/i }).click();
    await expect(page.getByLabel(/markdown bruto/i)).toHaveValue(/# E2E Review/);
    await context.close();
  });

  test("modos visual e prévia renderizam sem perder conteúdo", async ({ browser }) => {
    const { context, page } = await sharedUserContext(browser);
    await page.goto("/reviews/editor");
    await page.getByRole("button", { name: /novo rascunho/i }).first().click();
    await page.getByRole("tab", { name: /markdown/i }).click();
    await page.getByLabel(/markdown bruto/i).fill("# Título E2E\n\n- item um\n- item dois");

    await page.getByRole("tab", { name: /prévia/i }).click();
    await expect(page.locator("body")).toContainText("Título E2E");
    await expect(page.locator("body")).toContainText("item um");

    await page.getByRole("tab", { name: /visual/i }).click();
    await expect(page.locator(".tiptap")).toContainText("Título E2E");
    // Digitar no visual propaga para o Markdown (docChanged real).
    await page.locator(".tiptap").click();
    await page.keyboard.type(" ADENDO");
    // Voltar ao Markdown: conteúdo preservado (normalização é aceitável).
    await page.getByRole("tab", { name: /markdown/i }).click();
    await expect(page.getByLabel(/markdown bruto/i)).toHaveValue(/ADENDO/);
    await context.close();
  });

  test("parâmetros ambíguos são rejeitados com escolha explícita", async ({ browser }) => {
    const { context, page } = await sharedUserContext(browser);
    await page.goto("/reviews/editor?draftId=abc&userGameId=def");
    await expect(page.locator("body")).toContainText(/conflitantes/i);
    await expect(page.getByRole("link", { name: /rascunhos/i })).toBeVisible();
    await context.close();
  });

  test("draftId desconhecido não cria documento silencioso", async ({ browser }) => {
    const { context, page } = await sharedUserContext(browser);
    await page.goto("/reviews/editor?draftId=00000000-0000-4000-8000-000000000000");
    await expect(page.locator("body")).toContainText(/não encontrado/i);
    await expect(page.getByRole("button", { name: /novo rascunho/i }).first()).toBeVisible();
    await context.close();
  });

  test("modo userGameId lê a cópia do servidor e cria rascunho explicitamente", async ({
    browser,
  }) => {
    const { context, page } = await sharedUserContext(browser);
    const marker = uniqueId("ReviewE2E");
    // Sem review persistida: cobre o ramo `missing` do contrato real
    // (escritas com review exigem replica set — indisponível neste mongod
    // standalone; o ramo `found` está coberto em Vitest via fetchServerReview).
    const game = await createGame(context.request, {
      game: { name: marker },
      status: "backlog",
    });
    const gameId: string = game._id;
    expect(gameId).toBeTruthy();

    await page.goto(`/reviews/editor?userGameId=${gameId}`);
    await expect(page.locator("body")).toContainText(/review no servidor/i);
    await expect(page.locator("body")).toContainText(/nenhuma review persistida/i);
    // Nada é criado automaticamente: o editor só abre após ação explícita.
    await expect(page.getByLabel(/markdown bruto/i)).toHaveCount(0);
    await page.getByRole("button", { name: /criar rascunho local/i }).click();
    await expect(page.getByRole("tab", { name: /markdown/i })).toBeVisible();
    await expect(page.locator(".tiptap")).toBeVisible();
    await context.close();
  });

  test("rascunhos são isolados por conta no mesmo navegador", async ({ browser }) => {
    const first = await freshUserContext(browser);
    await first.page.goto("/reviews/editor");
    await first.page.getByRole("button", { name: /novo rascunho/i }).first().click();
    await first.page.getByRole("tab", { name: /markdown/i }).click();
    await first.page.getByLabel(/markdown bruto/i).fill("rascunho-conta-1");
    await expect(first.page.locator("body")).toContainText(/salvo neste dispositivo/i);

    const second = await freshUserContext(browser);
    await second.page.goto("/reviews/editor");
    await expect(second.page.locator("body")).toContainText(/nenhum rascunho/i);
    await expect(second.page.locator("body")).not.toContainText("rascunho-conta-1");
    await first.context.close();
    await second.context.close();
  });
});
