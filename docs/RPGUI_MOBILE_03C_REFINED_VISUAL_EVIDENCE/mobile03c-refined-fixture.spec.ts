import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const evidence = path.resolve("docs/RPGUI_MOBILE_03C_REFINED_VISUAL_EVIDENCE");
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
            rawWidth: rect.width,
            rawHeight: rect.height,
            zoom: getComputedStyle(element).zoom,
            transform: getComputedStyle(element).transform,
          }]
        : [];
    }),
  );
  expect(undersized, JSON.stringify(undersized)).toEqual([]);
}

test("MOBILE-03C refined fixture: density, viewport matrix, interactions and screenshots", async ({
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
    const shellGap = titleBox!.y - (triggerBox!.y + triggerBox!.height);
    expect(shellGap, `trigger/title gap at ${viewport.width}px`).toBeGreaterThanOrEqual(0);
    const firstContentBox = await page.locator(".ss-shell-mobile-content > :first-child").boundingBox();
    expect(firstContentBox).not.toBeNull();
    const shellClearance = firstContentBox!.y - (triggerBox!.y + triggerBox!.height);
    expect(
      shellClearance,
      `shell content clearance at ${viewport.width}px`,
    ).toBeGreaterThanOrEqual(0);
    expect(shellClearance, `shell clearance at ${viewport.width}px`).toBeLessThanOrEqual(20);

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
      const firstTitle = await page.locator("[data-fixture-title]").boundingBox();
      const mainItems = await drawer.locator(".ss-mobile-nav__primary").evaluateAll(
        (elements) => elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { title: element.textContent?.trim(), height: Math.round(rect.height) };
        }),
      );
      const closeRow = await drawer.locator(".ss-mobile-nav__close-row").boundingBox();
      const scrollArea = await drawer.locator(".ss-mobile-nav__scroll").boundingBox();
      expect(Math.round(closeRow!.y + closeRow!.height)).toBe(Math.round(scrollArea!.y));
      const visiblePrimaryCount = await drawer.locator(".ss-mobile-nav__primary").evaluateAll(
        (elements) => elements.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= window.innerHeight;
        }).length,
      );
      const activeLink = drawer.getByRole("link", { name: "Home" });
      await expect(activeLink).toHaveAttribute("aria-current", "page");
      const activeSprite = await activeLink.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      );
      expect(activeSprite).toContain("button-golden-down.png");
      await activeLink.hover();
      expect(
        await activeLink.evaluate((element) => getComputedStyle(element).backgroundImage),
      ).toContain("button-golden-hover.png");
      await page.mouse.move(0, 0);
      const spriteDimensions = await page.evaluate(async () => {
        const image = new Image();
        image.src = "/rpgui/img/button-golden.png";
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      });
      expect(spriteDimensions).toEqual({ width: 74, height: 24 });
      const metricReport = {
        viewport: "390x844",
        browser: await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          mdMatches: matchMedia("(min-width: 768px)").matches,
          functionalFont: getComputedStyle(document.documentElement).getPropertyValue("--ss-mobile-font-functional").trim(),
          bodyFont: getComputedStyle(document.documentElement).getPropertyValue("--ss-mobile-font-body").trim(),
        })),
        new: {
          shellGapPx: Math.round(firstTitle!.y - (triggerBox!.y + triggerBox!.height)),
          shellClearancePx: Math.round(shellClearance),
          headerRowsPx: Math.round(closeRow!.height + (await drawer.locator(".ss-mobile-nav__identity").boundingBox())!.height),
          closeRowBottomPx: Math.round(closeRow!.y + closeRow!.height),
          scrollStartPx: Math.round(scrollArea!.y),
          primaryButtonHeightsPx: mainItems.map((item) => item.height),
          primaryItemsVisibleWithoutScroll: visiblePrimaryCount,
          primaryLabels: mainItems.map((item) => item.title),
          buttonFont: await drawer.locator(".ss-mobile-nav__primary").first().evaluate(
            (element) => getComputedStyle(element).fontFamily,
          ),
          goldenPlate: await drawer.locator(".ss-mobile-nav__primary").first().evaluate(
            (element) => getComputedStyle(element).backgroundSize,
          ),
        },
      };
      expect(metricReport.new.buttonFont).toContain("JetBrains Mono");
      const fixtureFonts = await page.evaluate(() => ({
        bodyLoaded: document.fonts.check('12px "JetBrains Mono"'),
        displayLoaded: document.fonts.check('12px "Press Start 2P"'),
      }));
      expect(fixtureFonts).toEqual({ bodyLoaded: true, displayLoaded: true });
      console.log("MOBILE-03C-REFINE metrics", JSON.stringify(metricReport));
      console.log(
        "MOBILE-03C-REFINE styles",
        JSON.stringify(await drawer.locator(".ss-mobile-nav__primary").first().evaluate((element) => ({
          className: element.className,
          backgroundImage: getComputedStyle(element).backgroundImage,
          backgroundSize: getComputedStyle(element).backgroundSize,
          minHeight: getComputedStyle(element).minHeight,
          height: getComputedStyle(element).height,
          fontFamily: getComputedStyle(element).fontFamily,
        }))),
      );
      await page.evaluate((metrics) => {
        document.documentElement.dataset.refinementMetrics = JSON.stringify(metrics);
      }, metricReport);
      await page.screenshot({
        path: path.join(evidence, "390-open.png"),
        animations: "disabled",
      });

      const searchGroup = drawer.getByRole("button", { name: /Buscar Jogos/ });
      await searchGroup.click();
      await expect(drawer.getByRole("link", { name: "Busca Geral" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Plataformas" })).toBeVisible();
      const group = drawer.getByRole("button", { name: /Minhas coleções/ });
      await group.click();
      await expect(drawer.getByRole("link", { name: "Todas as coleções" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Jogos sem coleção" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Novo Jogo" })).toHaveCount(0);
      const backlogGroup = drawer.getByRole("button", { name: /Meu Backlog/ });
      await backlogGroup.click();
      await expect(drawer.getByRole("link", { name: "Novo Jogo" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Jogos", exact: true })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Favoritos" })).toBeVisible();
      const longCollection = drawer.getByRole("link", {
        name: /\[3\] The Legend of Zelda: Tears of the Kingdom/,
      });
      await expect(longCollection).toBeVisible();
      for (const sampleName of [
        "Jogos de conforto",
        "caça-conquistas",
        "nintendo_switch_",
        "Final Fantasy Tactics: The War of the Lions — edição comemorativa",
      ]) {
        const sample = drawer.getByRole("link", { name: new RegExp(sampleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
        await expect(sample).toBeVisible();
        const fitsCollection = await sample.evaluate((element) => {
          const item = element.closest("li");
          return !!item && item.scrollWidth <= item.clientWidth + 1;
        });
        expect(fitsCollection, `${sampleName} fits without horizontal overflow`).toBe(true);
      }
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
      const collectionTypography = await longCollection.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          font: style.fontFamily,
          fontSize: style.fontSize,
          wordBreak: style.wordBreak,
          overflowWrap: style.overflowWrap,
          hyphens: style.hyphens,
        };
      });
      expect(collectionTypography.wordBreak).toBe("normal");
      expect(collectionTypography.overflowWrap).toBe("break-word");
      await page.keyboard.press("Tab");
      await expect(drawer.locator(":focus")).toBeVisible();
      await page.keyboard.press("Shift+Tab");
      await longCollection.scrollIntoViewIfNeeded();
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
      const lastNavigationLink = drawer.locator("nav a[href]").last();
      await expect(lastNavigationLink).toBeFocused();
      expect(
        await lastNavigationLink.evaluate((element) => getComputedStyle(element).outlineStyle),
      ).toBe("solid");
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

test("Next real public route: verify locally served next/font without signing in", async ({ page }) => {
  await page.goto("http://localhost:3000/login");
  await expect(page).toHaveURL(/\/login(?:$|[?#])/);
  await page.evaluate(() => document.fonts.ready);
  const fontEvidence = await page.evaluate(() => {
    const bodyFont = getComputedStyle(document.body).fontFamily;
    const displayFont = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-display")
      .trim();
    return {
      bodyFont,
      displayFont,
      bodyFontLoaded: document.fonts.check(`12px ${bodyFont}`),
      fontResources: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /\.woff2?(?:\?|$)/i.test(name)),
    };
  });
  const appStylesheetEvidence = await page.evaluate(async () => {
    const links = Array.from(document.styleSheets)
      .map((stylesheet) => stylesheet.href)
      .filter((href): href is string => !!href);
    const stylesheets = await Promise.all(
      links.map(async (href) => {
        const response = await fetch(href);
        return response.ok ? response.text() : "";
      }),
    );
    return {
      stylesheetCount: stylesheets.length,
      hasMobileRefinement: stylesheets.some((css) =>
        css.includes(".ss-mobile-nav__close-row") &&
        css.includes(".ss-mobile-nav__primary"),
      ),
    };
  });
  console.log("Next login next/font evidence", JSON.stringify(fontEvidence));
  console.log("Next worktree CSS evidence", JSON.stringify(appStylesheetEvidence));
  expect(fontEvidence.bodyFontLoaded).toBe(true);
  expect(fontEvidence.fontResources.length).toBeGreaterThan(0);
  expect(appStylesheetEvidence.hasMobileRefinement).toBe(true);
});
