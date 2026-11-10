/**
 * Fase 3 — integração formulário↔editor SEM escrita transacional.
 *
 * Roda contra qualquer MongoDB (standalone OK): nenhum teste aqui cria
 * review no servidor. Cobre seção vazia, abertura em nova guia,
 * atualização de prévia entre guias, cancelamento e payload sem review.
 */
import { test, expect } from "@playwright/test";
import { uniqueUser, registerUser, loginUser, createGame } from "./helpers";

async function freshUserContext(browser: any) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const user = uniqueUser();
  await registerUser(context.request, user);
  await loginUser(context.request, user.email, user.password);
  const page = await context.newPage();
  return { context, page };
}

test.describe("fase 3 — newgame sem review persistida", () => {
  test("seção vazia, abre editor em nova guia e prévia atualiza", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    await page.goto("/backlog/new");
    await expect(page.getByRole("heading", { name: /minha review/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/opcional/i);
    await page.getByRole("textbox", { name: "Nome" }).fill("Jogo Fase 3");

    const [editorPage] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: /escrever review/i }).click(),
    ]);
    await editorPage.waitForLoadState("domcontentloaded");
    expect(editorPage.url()).toContain("/reviews/editor?draftId=");
    // O formulário original permanece intacto na primeira guia.
    expect(await page.getByRole("textbox", { name: "Nome" }).inputValue()).toBe("Jogo Fase 3");

    // Escrever no editor → autosave → a seção do formulário atualiza.
    await editorPage.getByRole("tab", { name: /markdown/i }).click();
    await editorPage.getByLabel(/markdown bruto/i).fill("# Review Fase 3\n\nMuito bom.");
    await expect(editorPage.locator("body")).toContainText(/salvo neste dispositivo/i);
    await page.bringToFront();
    await expect(page.locator("body")).toContainText(/rascunho local/i);
    await expect(page.locator("body")).toContainText(/Review Fase 3/);
    await context.close();
  });

  test("salvar sem review usa request única sem chave review", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    const posts: any[] = [];
    page.on("request", (req: { url(): string; method(): string; postDataJSON(): unknown }) => {
      if (req.url().includes("/api/games") && req.method() === "POST") {
        posts.push(req.postDataJSON());
      }
    });
    await page.goto("/backlog/new");
    await page.getByRole("textbox", { name: "Nome" }).fill("Sem Review");
    await page.getByRole("button", { name: /criar jogo/i }).click();
    await expect(page).toHaveURL(/\/backlog(\?|$)/);
    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toHaveProperty("review");
    await context.close();
  });

  test("cancelar preserva a review persistida (nada é enviado)", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    const created = await createGame(context.request, {
      game: { name: "Cancelar Preserva" },
      status: "backlog",
    });
    const gameId: string = created._id;
    const puts: any[] = [];
    page.on("request", (req: { url(): string; method(): string; postDataJSON(): unknown }) => {
      if (req.url().includes(`/api/games/${gameId}`) && req.method() === "PUT") {
        puts.push(req.postDataJSON());
      }
    });
    await page.goto(`/backlog/${gameId}/edit`);
    await expect(page.getByRole("heading", { name: /minha review/i })).toBeVisible();
    // Histórico com /backlog antes: Cancelar volta sem enviar nada.
    await page.goto("/backlog");
    await page.goto(`/backlog/${gameId}/edit`);
    await page.getByRole("button", { name: /cancelar/i }).click();
    await expect(page).toHaveURL(/\/backlog(\?|$)/);
    expect(puts).toHaveLength(0);
    await context.close();
  });

  test("editar só a nota não reenvia review (payload sem a chave)", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    const created = await createGame(context.request, {
      game: { name: "Só Nota" },
      status: "backlog",
    });
    const gameId: string = created._id;
    const puts: any[] = [];
    page.on("request", (req: { url(): string; method(): string; postDataJSON(): unknown }) => {
      if (req.url().includes(`/api/games/${gameId}`) && req.method() === "PUT") {
        puts.push(req.postDataJSON());
      }
    });
    await page.goto(`/backlog/${gameId}/edit`);
    await page.getByRole("spinbutton", { name: "Nota (0–10)" }).fill("8");
    await page.getByRole("button", { name: /salvar/i }).click();
    await expect(page).toHaveURL(/\/backlog(\?|$)/);
    expect(puts).toHaveLength(1);
    expect(puts[0]).not.toHaveProperty("review");
    expect(puts[0].rating).toBe(8);
    await context.close();
  });
});
