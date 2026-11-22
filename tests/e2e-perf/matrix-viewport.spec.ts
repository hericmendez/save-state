/**
 * E2E — Matriz mobile com touch (projeto `mobile-matrix`, dispositivo Pixel 7).
 *
 * Avalia layout, overflow, renderização, scroll e interações por toque.
 */
import { test, expect } from "@playwright/test";

const ROUTES = ["/login", "/home", "/dashboard", "/backlog", "/search"];

test.describe("matriz mobile touch (Pixel 7)", () => {
  for (const route of ROUTES) {
    test(`mobile: ${route} renderiza sem overflow e sem pageerrors`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1200);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `mobile ${route}: overflow de ${overflow}px`).toBeLessThanOrEqual(1);
      expect(errors, `mobile ${route}: pageerrors`).toEqual([]);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.evaluate(() => window.scrollTo(0, 0));
    });
  }

  test("mobile: navegação e busca funcionam por toque", async ({ page }) => {
    await page.goto("/home");
    const input = page.getByPlaceholder(/buscar no catálogo/i);
    await expect(input).toBeVisible();
    await input.tap();
    await input.fill("mario");
    await expect(input).toHaveValue("mario");
  });

  test("mobile: drawer abre, fecha com Escape e mantém alvos acessíveis", async ({
    page,
  }) => {
    await page.goto("/home");
    const trigger = page.getByRole("button", { name: "Abrir menu de navegação" });
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.height).toBeGreaterThanOrEqual(44);

    await trigger.tap();
    const drawer = page.getByRole("dialog", { name: "Navegação principal" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/Bem-vindo,/)).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Sair" })).toBeVisible();
    const close = drawer.getByRole("button", { name: "Fechar menu" });
    const closeBox = await close.boundingBox();
    expect(closeBox?.width).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("mobile: review editor cria rascunho por toque sem overflow", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e && (e as Error).message ? (e as Error).message : e)));
    await page.goto("/reviews/editor");
    await page.getByRole("button", { name: /novo rascunho/i }).first().tap();
    await expect(page.locator(".tiptap")).toBeVisible();
    await page.getByRole("tab", { name: /markdown/i }).tap();
    await page.getByLabel(/markdown bruto/i).fill("# Mobile\n\ntoque funciona.");
    await expect(page.locator("body")).toContainText(/salvo neste dispositivo/i);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `mobile /reviews/editor: overflow de ${overflow}px`).toBeLessThanOrEqual(1);
    expect(errors, "mobile /reviews/editor: pageerrors").toEqual([]);
  });
});
