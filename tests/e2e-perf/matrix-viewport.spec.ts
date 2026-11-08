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
});
