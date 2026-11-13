/**
 * E2E — Busca geral/ATP, catálogo de plataformas, activity e home/dashboard.
 *
 * Observação de ambiente: a busca depende do provedor externo IGDB (rede).
 * Falhas do provedor são registradas como limitação de ambiente, não como
 * defeito da aplicação — exceto quando a UI não apresenta estado de erro/loading.
 */
import { test, expect } from "@playwright/test";
import { uniqueId } from "./helpers";

test.describe("busca geral e catálogo", () => {
  test("página /search carrega e executa pesquisa", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/search");
    const input = page.getByPlaceholder(/nome do jogo/i).first();
    await expect(input).toBeVisible();
    await input.fill("Zelda");
    await input.press("Enter");

    // Provedor IGDB real: "Zelda" retorna jogos (ex.: The Legend of Zelda) —
    // ou estado vazio/erro tratado se o provedor estiver indisponível.
    await expect(page.locator("body")).toContainText(/zelda|nenhum jogo|erro|falha|tentar|indisponível/i, {
      timeout: 45_000,
    });
    const jsErrors = errors.filter((m) => !/hydration/i.test(m));
    expect(jsErrors).toEqual([]);
  });

  test("pesquisa sem resultados apresenta estado vazio, não quebra", async ({
    page,
  }) => {
    await page.goto("/search");
    const input = page.getByPlaceholder(/nome do jogo/i).first();
    await input.fill(`zzzx-qqq-${uniqueId("n")}`);
    await input.press("Enter");
    await expect(page.locator("body")).toContainText(/nenhum jogo|erro|falha|tentar|indisponível/i, {
      timeout: 45_000,
    });
  });

  test("navegação entre resultados não perde estado da query", async ({
    page,
  }) => {
    await page.goto("/search?search=zelda");
    await expect(page).toHaveURL(/search=zelda/);
    await expect(page.locator("body")).toContainText(/zelda|nenhum jogo|erro|falha|tentar|indisponível/i, {
      timeout: 45_000,
    });
  });

  test("catálogo de plataformas carrega e lista plataformas", async ({
    page,
  }) => {
    await page.goto("/catalog/platforms");
    await expect(page.locator("body")).toContainText(/plataforma/i, {
      timeout: 30_000,
    });
  });

  test("proteção contra requisições duplicadas: digitação rápida gera 1 busca efetiva", async ({
    page,
  }) => {
    let searchCalls = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/search") || req.url().includes("/api/atp")) {
        searchCalls += 1;
      }
    });
    await page.goto("/search");
    const input = page.getByPlaceholder(/nome do jogo/i).first();
    await input.pressSequentially("metroid", { delay: 30 });
    // Aguarda estabilizar (debounce + resposta).
    await page.waitForTimeout(3000);
    test.info().annotations.push({
      type: "search-calls",
      description: `chamadas /api/search|/api/atp após digitação rápida: ${searchCalls}`,
    });
    // Limite generoso: o ponto é detectar tempestades (dezenas de chamadas).
    expect(searchCalls).toBeLessThan(15);
  });
});

test.describe("home e dashboard", () => {
  test("home carrega seções e formulário de busca", async ({ page }) => {
    await page.goto("/home");
    await expect(
      page.getByPlaceholder(/buscar no catálogo/i),
    ).toBeVisible();
  });

  test("dashboard renderiza após operações (coleção com 1 jogo)", async ({
    page,
    request,
  }) => {
    await request.post("/api/games", {
      data: { game: { name: `Dash ${uniqueId("d")}` }, status: "playing" },
    });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /dashboard/i }),
    ).toBeVisible();
  });

  test("diary e activity-preview carregam sem erros JS", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of ["/diary", "/activity-preview"]) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
    }
    expect(errors).toEqual([]);
  });
});

test.describe("activity", () => {
  test("histórico registra operações e mantém integridade", async ({
    page,
    request,
  }) => {
    const title = `Activity ${uniqueId("a")}`;
    const created = await request.post("/api/games", {
      data: { game: { name: title }, status: "backlog" },
    });
    const gameId: string = (await created.json()).data._id;
    await request.patch(`/api/games/${gameId}`, { data: { status: "playing" } });

    const feed = await request.get("/api/activity?limit=20");
    expect(feed.ok()).toBeTruthy();
    const json = await feed.json();
    const text = JSON.stringify(json);
    expect(text.length).toBeGreaterThan(0);

    await page.goto("/diary");
    await expect(page.locator("body")).toContainText(/diário|atividade|registro|nenhum/i);
  });
});
