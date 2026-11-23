import { expect, test } from "@playwright/test";
import { normalizeFontFamilyList } from "./hydration-font-family";

const widths = [390, 768, 1366];

for (const width of widths) {
  test(`hydrates /login at ${width}px without changing server root markup`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
    });
    await context.addInitScript(() => {
      if (!localStorage.getItem("save-state-ui")) {
        localStorage.setItem(
          "save-state-ui",
          JSON.stringify({
          state: {
            layoutMode: "pixel-perfect",
            fontDisplay: "roboto",
            fontBody: "roboto",
            gridDensity: 12,
          },
          }),
        );
      }

      const audit = {
        bootstrap: null as null | {
          time: number;
          layoutZoom: string;
          displayFont: string;
          bodyFont: string;
          ruleCount: number;
          styleText: string | null;
        },
        paints: [] as Array<{ name: string; time: number }>,
        rootMutations: [] as string[],
      };
      Object.assign(window, { __hydrationPreferenceAudit: audit });

      if (document.documentElement) {
        new MutationObserver((records) => {
          audit.rootMutations.push(
            ...records.map(
              (record) =>
                `${record.type}:${(record.target as Element).nodeName}:${record.attributeName ?? ""}`,
            ),
          );
        }).observe(document.documentElement, {
          attributes: true,
          attributeOldValue: true,
        });
      }

      const paintObserver = new PerformanceObserver((list) => {
        audit.paints.push(
          ...list.getEntries().map((entry) => ({
            name: entry.name,
            time: entry.startTime,
          })),
        );
      });
      paintObserver.observe({
        type: "paint",
        buffered: true,
      } as PerformanceObserverInit);

      const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
      CSSStyleDeclaration.prototype.setProperty = function (
        property,
        value,
        priority,
      ) {
        originalSetProperty.call(this, property, value, priority);
        if (property !== "--ss-pref-grid-columns-1476") return;

        const styleElement = document.getElementById(
          "save-state-preference-styles",
        ) as HTMLStyleElement | null;
        if (!styleElement) return;
        const rootStyle = getComputedStyle(document.documentElement);
        audit.bootstrap = {
          time: performance.now(),
          layoutZoom: rootStyle.getPropertyValue("--ss-pref-layout-zoom").trim(),
          displayFont: rootStyle.getPropertyValue("--font-display-name").trim(),
          bodyFont: rootStyle.getPropertyValue("--font-body-name").trim(),
          ruleCount: styleElement.sheet?.cssRules.length ?? 0,
          styleText: styleElement.textContent,
        };
      };
    });

    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
    const html = await response!.text();
    const serverRoot = html.match(/<html[^>]*>/)?.[0] ?? "";
    expect(serverRoot).not.toMatch(/data-(layout-mode|font-display|font-body|grid-density)/);
    expect(html.indexOf('id="save-state-preference-styles"')).toBeLessThan(
      html.indexOf("localStorage.getItem"),
    );

    await expect
      .poll(() =>
        page.locator("#save-state-preference-styles").evaluate((element) => {
          const style = element as HTMLStyleElement;
          return style.sheet?.cssRules.length ?? 0;
        }),
      )
      .toBeGreaterThan(0);

    // Wait for the real Paint Timing entry instead of assuming two animation
    // frames are enough for every headless/headful browser scheduling cycle.
    // The finite timeout still fails the test if the browser never paints.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            performance
              .getEntriesByType("paint")
              .some((entry) => entry.name === "first-paint"),
          ),
        { timeout: 5_000 },
      )
      .toBe(true);

    // Let the browser deliver Paint Timing and MutationObserver records. The
    // preference snapshot was captured inside the parser-blocking bootstrap.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve()),
          ),
        ),
    );

    const hydrated = await page.evaluate(() => {
      const audit = (
        window as unknown as Window & {
          __hydrationPreferenceAudit: {
            bootstrap: {
              time: number;
              layoutZoom: string;
              displayFont: string;
              bodyFont: string;
              ruleCount: number;
              styleText: string | null;
            } | null;
            paints: Array<{ name: string; time: number }>;
            rootMutations: string[];
          };
        }
      ).__hydrationPreferenceAudit;
      const styleElement = document.getElementById(
        "save-state-preference-styles",
      ) as HTMLStyleElement;
      return {
      attrs: Array.from(document.documentElement.attributes).map(
        ({ name, value }) => [name, value],
      ),
      styleElementCount: document.querySelectorAll(
        "#save-state-preference-styles",
      ).length,
      preferenceRules: styleElement.sheet?.cssRules.length,
      styleText: styleElement.textContent,
      displayFont: getComputedStyle(document.querySelector(".font-display")!).fontFamily,
      bodyFont: getComputedStyle(document.body).fontFamily,
      titleSize: getComputedStyle(
        document.querySelector(".font-display")!,
      ).fontSize,
      layoutZoom: getComputedStyle(document.documentElement).getPropertyValue(
        "--ss-pref-layout-zoom",
      ).trim(),
      geometry: (() => {
        const fixture = document.createElement("div");
        fixture.innerHTML = `
          <main class="layout-shell">
            <div class="layout-shell-inner">
              <section class="layout-frame"><div class="layout-zoom"></div></section>
            </div>
          </main>
          <div class="game-grid-container" style="width: 1500px">
            <div class="game-card-grid">${"<i></i>".repeat(12)}</div>
          </div>`;
        document.body.append(fixture);
        const shell = fixture.querySelector(".layout-shell")!;
        const frame = fixture.querySelector(".layout-frame")!;
        const grid = fixture.querySelector(".game-card-grid")!;
        const result = {
          maxWidth: getComputedStyle(shell).maxWidth,
          aspectRatio: getComputedStyle(shell).aspectRatio,
          frameHeight: getComputedStyle(frame).height,
          frameMarginTop: getComputedStyle(frame).marginTop,
          zoom: getComputedStyle(fixture.querySelector(".layout-zoom")!).zoom,
          gridColumns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        };
        fixture.remove();
        return result;
      })(),
      bootstrap: audit.bootstrap,
      paints: audit.paints.length
        ? audit.paints
        : performance.getEntriesByType("paint").map((entry) => ({
            name: entry.name,
            time: entry.startTime,
          })),
      rootMutations: audit.rootMutations,
      nextOverlayText: Array.from(
        document.querySelectorAll("nextjs-portal"),
      )
        .map((portal) => {
          const shadow = portal.shadowRoot;
          return [
            shadow?.querySelector("[data-issues-open]")?.textContent ?? "",
            shadow?.querySelector("[data-nextjs-container-errors]")
              ?.textContent ?? "",
          ].join("\n");
        })
        .join("\n"),
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth ||
        document.body.scrollWidth > document.documentElement.clientWidth,
      inlineBootstrapIsParserBlocking: (() => {
        const script = Array.from(document.scripts).find((candidate) =>
          candidate.textContent?.includes("insertRule"),
        );
        return Boolean(
          script &&
            !script.async &&
            !script.defer &&
            styleElement.compareDocumentPosition(script) &
              Node.DOCUMENT_POSITION_FOLLOWING,
        );
      })(),
      };
    });

    for (const forbiddenAttribute of [
      "data-layout-mode",
      "data-font-display",
      "data-font-display-explicit",
      "data-font-body",
      "data-grid-density",
    ]) {
      expect(hydrated.attrs.map(([name]) => name)).not.toContain(
        forbiddenAttribute,
      );
    }
    expect(hydrated.preferenceRules).toBeGreaterThan(0);
    expect(hydrated.styleElementCount).toBe(1);
    expect(hydrated.styleText).toBe("");
    expect(hydrated.bootstrap).not.toBeNull();
    expect(hydrated.bootstrap?.layoutZoom).toBe(width < 768 ? "100%" : "80%");
    expect(hydrated.bootstrap?.displayFont).toContain("Roboto");
    expect(hydrated.bootstrap?.bodyFont).toContain("Roboto");
    expect(hydrated.bootstrap?.ruleCount).toBeGreaterThan(0);
    expect(
      normalizeFontFamilyList(hydrated.bootstrap!.displayFont),
    ).toEqual(normalizeFontFamilyList(hydrated.displayFont));
    expect(
      normalizeFontFamilyList(hydrated.bootstrap!.bodyFont),
    ).toEqual(normalizeFontFamilyList(hydrated.bodyFont));
    expect(hydrated.bootstrap?.layoutZoom).toBe(hydrated.layoutZoom);
    expect(hydrated.bootstrap?.ruleCount).toBe(1);
    expect(hydrated.inlineBootstrapIsParserBlocking).toBe(true);
    expect(hydrated.rootMutations).toEqual([]);
    expect(hydrated.horizontalOverflow).toBe(false);
    const firstPaint = hydrated.paints
      .filter((entry) => entry.name === "first-paint")
      .sort((left, right) => left.time - right.time)[0];
    expect(firstPaint).toBeDefined();
    expect(hydrated.bootstrap!.time).toBeLessThan(firstPaint!.time);
    expect(hydrated.displayFont).toContain("Roboto");
    expect(hydrated.bodyFont).toContain("Roboto");
    expect(hydrated.titleSize).toBe("17.6px");
    expect(hydrated.layoutZoom).toBe(width < 768 ? "100%" : "80%");
    if (width < 768) {
      expect(hydrated.geometry.zoom).toBe("1");
      expect(hydrated.geometry.gridColumns).toBe(2);
    } else {
      expect(hydrated.geometry.maxWidth).not.toBe("none");
      expect(hydrated.geometry.aspectRatio).toBe("4 / 3");
      expect(hydrated.geometry.frameMarginTop).toBe("30px");
      expect(hydrated.geometry.zoom).toBe("0.8");
      expect(hydrated.geometry.gridColumns).toBe(12);
    }
    expect(errors.join("\n")).not.toMatch(
      /hydration|did not match|server rendered HTML|text content does not match/i,
    );
    expect(hydrated.nextOverlayText).not.toMatch(/1 Issue|hydration/i);

    await page.evaluate(() => {
      localStorage.setItem(
        "save-state-ui",
        JSON.stringify({
          state: {
            layoutMode: "fullscreen",
            fontDisplay: "jetbrains-mono",
            fontBody: "roboto",
            gridDensity: 8,
          },
        }),
      );
      const bootstrap = Array.from(document.scripts).find((script) =>
        script.textContent?.includes("insertRule"),
      );
      if (!bootstrap?.textContent) throw new Error("Preference bootstrap missing");
      window.eval(bootstrap.textContent);
    });
    await expect
      .poll(() =>
        page.locator("#save-state-preference-styles").evaluate((element) => {
          const style = element as HTMLStyleElement;
          return style.sheet?.cssRules.length ?? 0;
        }),
      )
      .toBe(1);
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--font-display-name")
          .trim(),
      ),
    ).toContain("JetBrains Mono");

    await page.reload();
    await expect
      .poll(() =>
        page.locator("#save-state-preference-styles").evaluate((element) => {
          const style = element as HTMLStyleElement;
          return style.sheet?.cssRules.length ?? 0;
        }),
      )
      .toBe(1);
    expect(
      await page.evaluate(() => ({
        layout: getComputedStyle(document.documentElement)
          .getPropertyValue("--ss-pref-layout-zoom")
          .trim(),
        display: getComputedStyle(document.documentElement)
          .getPropertyValue("--font-display-name")
          .trim(),
        body: getComputedStyle(document.documentElement)
          .getPropertyValue("--font-body-name")
          .trim(),
        columns: getComputedStyle(document.documentElement)
          .getPropertyValue("--ss-pref-grid-columns-1476")
          .trim(),
        styleElementCount: document.querySelectorAll(
          "#save-state-preference-styles",
        ).length,
        styleText: document.getElementById(
          "save-state-preference-styles",
        )?.textContent,
        hasPreferenceAttributes: Array.from(
          document.documentElement.attributes,
        ).some(({ name }) =>
          [
            "data-layout-mode",
            "data-font-display",
            "data-font-display-explicit",
            "data-font-body",
            "data-grid-density",
          ].includes(name),
        ),
        rootMutations: (
          window as unknown as Window & {
            __hydrationPreferenceAudit: {
              rootMutations: string[];
            };
          }
        ).__hydrationPreferenceAudit.rootMutations,
      })),
    ).toEqual({
      layout: "100%",
      display: expect.stringContaining("JetBrains Mono"),
      body: expect.stringContaining("Roboto"),
      columns: "8",
      styleElementCount: 1,
      styleText: "",
      hasPreferenceAttributes: false,
      rootMutations: [],
    });

    await context.close();
  });
}
