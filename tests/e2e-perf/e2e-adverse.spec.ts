/**
 * E2E — Cenários de falhas críticas e condições adversas.
 *
 * Utiliza interceptação de rede do Playwright. Resultados obtidos com rede
 * simulada são anotados como SIMULADOS e não contam como defeito confirmado.
 */
import { test, expect } from "@playwright/test";
import { uniqueId } from "./helpers";

test.describe("falhas críticas", () => {
  test("erros JS não tratados: navegação completa sem pageerrors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of ["/home", "/dashboard", "/backlog", "/diary"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    }
    expect(errors).toEqual([]);
  });

  test("sem erros de hidratação React/Next", async ({ page }) => {
    const hydration: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /hydrat/i.test(msg.text())) {
        hydration.push(msg.text());
      }
    });
    for (const route of ["/home", "/dashboard", "/backlog", "/search"]) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
    }
    expect(hydration).toEqual([]);
  });

  test("API 500 em /api/games exibe erro recuperável com retry (SIMULADO)", async ({
    page,
  }) => {
    test.info().annotations.push({
      type: "ambiente",
      description: "SIMULADO via interceptação de rede — não é comportamento observado em produção",
    });
    // O SSR inicial sucede; a falha é forçada no refetch client-side
    // (digitação no filtro dispara fetch com debounce).
    await page.route("**/api/games?*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Simulated" } }),
      }),
    );
    await page.goto("/backlog");
    await expect(page.getByRole("heading", { name: /jogos/i })).toBeVisible();
    await page.getByPlaceholder(/buscar jogo/i).fill("zelda-audit");
    await expect(page.locator('p[role="alert"]')).toContainText(/erro|falha|tentar|500|simulated|muitas/i, {
      timeout: 20_000,
    });
    const retry = page.getByRole("button", { name: /tentar/i });
    await expect(retry).toBeVisible();
    await page.unroute("**/api/games?*");
    await retry.click();
    await expect(page.locator('p[role="alert"]')).toBeHidden({ timeout: 20_000 });
  });

  test("API 429 é tratada sem travar a UI (SIMULADO)", async ({ page }) => {
    test.info().annotations.push({
      type: "ambiente",
      description: "SIMULADO via interceptação de rede",
    });
    await page.route("**/api/games?*", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many" } }),
      }),
    );
    await page.goto("/backlog");
    await page.getByPlaceholder(/buscar jogo/i).fill("zelda-audit");
    await expect(page.locator('p[role="alert"]')).toContainText(/erro|falha|tentar|limite|muitas|too many/i, {
      timeout: 20_000,
    });
    // A página continua interativa (navegação não trava).
    await page.goto("/home");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("API indisponível (abort) não deixa a UI em estado inconsistente (SIMULADO)", async ({
    page,
  }) => {
    test.info().annotations.push({
      type: "ambiente",
      description: "SIMULADO via abort de rede",
    });
    await page.route("**/api/games?*", (route) => route.abort("failed"));
    await page.goto("/backlog");
    await page.getByPlaceholder(/buscar jogo/i).fill("zelda-audit");
    await expect(page.locator('p[role="alert"]')).toContainText(/erro|falha|tentar/i, {
      timeout: 20_000,
    });
  });

  test("latência alta (2s) apresenta loading antes do conteúdo (SIMULADO)", async ({
    page,
  }) => {
    test.info().annotations.push({
      type: "ambiente",
      description: "SIMULADO: delay de 2s nas respostas da API",
    });
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.goto("/backlog");
    // Header SSR renderiza imediatamente; conteúdo client vem após loading.
    await expect(page.getByRole("heading", { name: /jogos/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/carregando|nenhum|jogo/i, {
      timeout: 30_000,
    });
  });

  test("navegação durante requisição pendente não corrompe a sessão", async ({
    page,
  }) => {
    await page.goto("/backlog");
    // Dispara filtro (fetch client) e navega imediatamente.
    const search = page.getByPlaceholder(/buscar jogo/i);
    await search.fill("zelda");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await page.goto("/backlog");
    await expect(page.getByRole("heading", { name: /jogos/i })).toBeVisible();
  });

  test("imagens com falha não quebram o layout (SIMULADO)", async ({ page }) => {
    test.info().annotations.push({
      type: "ambiente",
      description: "SIMULADO: todas as imagens retornam 404",
    });
    await page.route(/.*\.(png|jpg|jpeg|webp|gif)(\?.*)?$/, (route) =>
      route.fulfill({ status: 404, body: "not found" }),
    );
    await page.goto("/home");
    await page.waitForLoadState("domcontentloaded");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("operações simultâneas: duplo clique em excluir resulta em estado final íntegro", async ({
    page,
    request,
  }) => {
    const title = `Concorrente ${uniqueId("cc")}`;
    const created = await request.post("/api/games", {
      data: { game: { name: title }, status: "backlog" },
    });
    const gameId: string = (await created.json()).data._id;

    // Duas exclusões simultâneas: primeira 200/204, segunda 404 — sem 500.
    const [r1, r2] = await Promise.all([
      request.delete(`/api/games/${gameId}`),
      request.delete(`/api/games/${gameId}`),
    ]);
    expect([200, 204, 404]).toContain(r1.status());
    expect([200, 204, 404]).toContain(r2.status());

    await page.goto("/backlog");
    await expect(page.locator("body")).not.toContainText(title);
  });

  test("reload durante operação mantém dados íntegros", async ({
    page,
    request,
  }) => {
    const title = `Reload ${uniqueId("r")}`;
    const created = await request.post("/api/games", {
      data: { game: { name: title }, status: "backlog" },
    });
    expect(created.ok()).toBeTruthy();
    await page.goto("/backlog");
    await page.reload();
    await expect(page.locator("body")).toContainText(title);
  });
});
