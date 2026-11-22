import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const evidence = path.resolve("docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE");
const fixtureUrl = "/";
const widths = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
];

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow: ${overflow}px`).toBeLessThanOrEqual(1);
}

async function openDrawer(page: Page) {
  const trigger = page.getByRole("button", { name: "Abrir menu de navegação" });
  await expect(trigger).toBeVisible();
  await trigger.tap();
  const drawer = page.locator("#mobile-navigation");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(page.getByRole("button", { name: "Fechar menu", exact: true })).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).overflow)).toBe("hidden");
  return { trigger, drawer };
}

async function expectTouchTargets(page: Page) {
  const undersized = await page.locator(
    "#mobile-navigation a[href], #mobile-navigation button:not([disabled])",
  ).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44
        ? [{
            label: element.getAttribute("aria-label") || element.textContent?.trim(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }]
        : [];
    }),
  );
  expect(undersized, JSON.stringify(undersized)).toEqual([]);
}

test("MOBILE-03C fixture: viewport matrix, drawer interactions, desktop and screenshots", async ({
  page,
}) => {
  await page.goto(fixtureUrl);

  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole("button", { name: "Abrir menu de navegação" });
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const closedDrawer = page.locator("#mobile-navigation");
    await expect(closedDrawer).toHaveAttribute("aria-hidden", "true");
    await expect(closedDrawer).toHaveAttribute("inert", "");
    await expect(page.getByRole("dialog", { name: "Navegação principal" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const titleBox = await page.locator("[data-fixture-title]").boundingBox();
    expect(titleBox).not.toBeNull();
    expect(
      triggerBox!.x + triggerBox!.width <= titleBox!.x ||
        triggerBox!.y + triggerBox!.height <= titleBox!.y ||
        triggerBox!.x >= titleBox!.x + titleBox!.width ||
        triggerBox!.y >= titleBox!.y + titleBox!.height,
      `trigger overlaps title at ${viewport.width}px`,
    ).toBe(true);

    const { drawer } = await openDrawer(page);
    await expect(drawer.getByText("Bem-vindo, MOBILE 03C REVIEW PLAYER!")).toBeVisible();
    await expect(drawer.getByRole("link", { name: /Sair/ })).toBeVisible();
    await expectTouchTargets(page);
    await expectNoHorizontalOverflow(page);

    if (viewport.width === 320 || viewport.width === 412) {
      await page.screenshot({
        path: path.join(evidence, `${viewport.width}-open.png`),
        animations: "disabled",
      });
    }

    if (viewport.width === 390) {
      await page.screenshot({
        path: path.join(evidence, "390-open.png"),
        animations: "disabled",
      });

      const group = drawer.getByRole("button", { name: /Minhas coleções/ });
      await group.click();
      const longCollection = drawer.getByRole("link", {
        name: /\[3\] The Legend of Zelda: Tears of the Kingdom/,
      });
      await expect(longCollection).toBeVisible();
      await expectTouchTargets(page);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: path.join(evidence, "390-submenu-expanded.png"),
        animations: "disabled",
      });

      const longNameFits = await longCollection.evaluate((element) => {
        const parent = element.closest("li");
        return !!parent && parent.scrollWidth <= parent.clientWidth + 1;
      });
      expect(longNameFits).toBe(true);
      await drawer.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(page.getByRole("button", { name: "Fechar menu", exact: true })).toBeInViewport();
      await expect(longCollection).toBeInViewport();
      await page.screenshot({
        path: path.join(evidence, "390-long-collection-visible.png"),
        animations: "disabled",
      });
      await group.click();

      const backdrop = page.getByRole("button", {
        name: "Fechar menu de navegação",
      });
      await backdrop.click({ position: { x: 380, y: 400 } });
      await expect(drawer).toHaveAttribute("aria-hidden", "true");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toBeFocused();
      expect(await page.locator("body").evaluate((element) => element.style.overflow)).toBe("");

      const closedPanelLinks = drawer.locator("a[href]");
      if (await closedPanelLinks.count()) {
        await closedPanelLinks.first().focus();
        await expect(closedPanelLinks.first()).not.toBeFocused();
      }

      await trigger.tap();
      await expect(page.getByRole("button", { name: "Fechar menu", exact: true })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(drawer.locator("nav a[href] button").last()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Fechar menu", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveAttribute("aria-hidden", "true");
      await expect(trigger).toBeFocused();
      expect(await page.locator("body").evaluate((element) => element.style.overflow)).toBe("");

      await page.screenshot({
        path: path.join(evidence, "390-closed.png"),
        animations: "disabled",
      });
    } else {
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveAttribute("aria-hidden", "true");
      await expect(trigger).toBeFocused();
    }
  }

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: "Abrir menu de navegação" })).toBeHidden();
    await expect(page.locator("aside.rpgui-container.framed")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(evidence, `${viewport.width}-desktop.png`),
      animations: "disabled",
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", { name: "Abrir menu de navegação" });
  const triggerElement = page.locator('button[aria-controls="mobile-navigation"]');
  const drawer = page.locator("#mobile-navigation");
  await trigger.tap();
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(triggerElement).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator("body").evaluate((element) => element.style.overflow)).toBe("");
  await expect(page.locator("aside nav a[href]").first()).toBeFocused();
});
