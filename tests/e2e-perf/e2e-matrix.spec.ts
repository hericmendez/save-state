/**
 * E2E — Matriz de dispositivos mobile (Pixel 7, touch) + viewports desktop/tablet.
 *
 * Este arquivo roda no projeto `e2e` (Desktop Chrome): cobre os viewports
 * 1920×1080, 1366×768, 768×1024, 390×844 e 360×800 via `test.use`.
 * Interações touch ficam em `matrix-viewport.spec.ts` (projeto mobile-matrix).
 */
import { test, expect } from "@playwright/test";

const ROUTES = ["/home", "/dashboard", "/backlog", "/search"];

const VIEWPORTS = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
];

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`${route} renderiza sem overflow horizontal nem pageerrors`, async ({
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
        expect(
          overflow,
          `${vp.name} ${route}: overflow horizontal de ${overflow}px`,
        ).toBeLessThanOrEqual(1);
        expect(errors, `${vp.name} ${route}: pageerrors`).toEqual([]);

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.evaluate(() => window.scrollTo(0, 0));
      });
    }
  });
}
