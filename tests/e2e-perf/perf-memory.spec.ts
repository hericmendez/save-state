/**
 * PERF — Memória e estabilidade em navegação repetida.
 *
 * 10 ciclos entre /home, /dashboard, /backlog e /diary medindo heap JS
 * (precise-memory-info), contagem de DOM nodes. Crescimento persistente e
 * reproduzível = indício de leak; aumento isolado não é prova.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const RESULTS = "tests/e2e-perf/.results/perf-memory.json";
const CYCLES = 10;
const ROUTES = ["/home", "/dashboard", "/backlog", "/diary"];

test.describe("perf — memória em navegação repetida", () => {
  test.setTimeout(600_000);
  test("heap e DOM estáveis após 10 ciclos", async ({ page }) => {
    const heap: (number | null)[] = [];
    const dom: number[] = [];
    const listeners: (number | null)[] = [];

    await page.goto("/home");
    await page.waitForLoadState("load");

    for (let i = 0; i < CYCLES; i++) {
      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(800);
      }
      const snapshot = await page.evaluate(() => {
            const mem = (performance as any).memory;
        return {
          heap: mem ? (mem.usedJSHeapSize as number) : null,
          dom: document.getElementsByTagName("*").length,
        };
      });
      heap.push(snapshot.heap);
      dom.push(snapshot.dom);
      // Listeners via CDP seriam ideais; aproximação indisponível no DOM puro.
      listeners.push(null);
    }

    const heapNums = heap.filter((h): h is number => h !== null);
    const growth =
      heapNums.length >= 2
        ? heapNums[heapNums.length - 1] - heapNums[0]
        : null;
    const domGrowth = dom[dom.length - 1] - dom[0];
    const summary = {
      cycles: CYCLES,
      heapBytesPerCycle: heap,
      domNodesPerCycle: dom,
      heapGrowthBytes: growth,
      heapGrowthMiB:
        growth !== null ? Math.round((growth / 1048576) * 100) / 100 : null,
      domGrowth,
      heapAvailable: heapNums.length > 0,
      note: "Aumento isolado não é prova de leak; apenas crescimento persistente e reproduzível indica vazamento.",
    };
    fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
    fs.writeFileSync(RESULTS, JSON.stringify(summary, null, 2));
    test.info().attach("perf-memory.json", {
      body: fs.readFileSync(RESULTS),
      contentType: "application/json",
    });

    // Portões severos: crescimento absurdo (>100MiB em 10 ciclos) ou DOM explodindo.
    if (summary.heapGrowthMiB !== null) {
      expect(summary.heapGrowthMiB, "crescimento de heap em 10 ciclos").toBeLessThan(100);
    }
    expect(Math.abs(domGrowth), "variação de DOM nodes").toBeLessThan(5000);
  });
});
