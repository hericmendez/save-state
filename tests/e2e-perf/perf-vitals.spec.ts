/**
 * PERF — Core Web Vitals (laboratório) + interação.
 *
 * LCP / CLS / FCP / TBT (via LongTasks) coletados em build de produção.
 * INP real exige dados de campo (RUM); aqui medimos a duração de uma
 * interação laboratorial (filtro da coleção) via Event Timing — registrada
 * como "interação laboratorial", NÃO como INP.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  installVitalsObservers,
  collectWebMetrics,
  median,
  percentile,
} from "./helpers";

const RESULTS = "tests/e2e-perf/.results/perf-vitals.json";
const RUNS = 5;

test.describe("perf — web vitals de laboratório", () => {
  test.setTimeout(600_000);
  test("FCP/LCP/CLS/LongTasks nas páginas principais", async ({ page }) => {
    const all: Record<string, any> = {};
    for (const route of ["/login", "/home", "/dashboard", "/backlog", "/search"]) {
      const fcp: number[] = [];
      const lcp: number[] = [];
      const cls: number[] = [];
      const longTotal: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        await installVitalsObservers(page);
        await page.goto(route, { waitUntil: "load", timeout: 60_000 });
        await page.waitForTimeout(3000);
        const m = await collectWebMetrics(page);
        if (m.paint.fcpMs !== null) fcp.push(m.paint.fcpMs);
        if (m.paint.lcpMs !== null) lcp.push(m.paint.lcpMs);
        if (m.paint.cls !== null) cls.push(m.paint.cls);
        longTotal.push(m.paint.longTasksTotalMs);
      }
      all[route] = {
        runs: RUNS,
        fcpMs: { median: median(fcp), p75: percentile(fcp, 75) },
        lcpMs: { median: median(lcp), p75: percentile(lcp, 75) },
        cls: { median: median(cls), p75: percentile(cls, 75) },
        longTasksTotalMs: { median: median(longTotal) },
      };
    }
    fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
    fs.writeFileSync(RESULTS, JSON.stringify({ startedAt: new Date().toISOString(), routes: all }, null, 2));
    test.info().attach("perf-vitals.json", {
      body: fs.readFileSync(RESULTS),
      contentType: "application/json",
    });

    // Portões severos (não as metas do relatório).
    for (const [route, d] of Object.entries(all)) {
        const v = (d as any).lcpMs.median as number;
      expect(v, `${route} LCP mediano < 15s`).toBeLessThan(15000);
    }
  });

  test("interação laboratorial: filtro da coleção (diagnóstico, não INP)", async ({
    page,
  }) => {
    await installVitalsObservers(page);
    await page.goto("/backlog");
    const search = page.getByPlaceholder(/buscar jogo/i);
    await expect(search).toBeVisible();

    // Latência de commit do filtro: do fim da digitação até a URL refletir
    // a query (debounce + fetch + render). Medição laboratorial honesta —
    // NÃO equivale ao INP de campo (RUM).
    const commitMs: number[] = [];
    const longDuring: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const text = i % 2 === 0 ? "zelda" : "mario";
      await search.fill("");
      await page.waitForTimeout(400);
      const longBefore: number = await page.evaluate(
            () => ((performance as any).__auditLongTasks ?? []).length,
      );
      const t0 = Date.now();
      await search.pressSequentially(text, { delay: 50 });
      // Debounce (ver useDebouncedValue) + fetch + render comitem na URL.
      await page.waitForFunction(
        (t) => window.location.href.includes(encodeURIComponent(t)),
        text,
        { timeout: 15000 },
      );
      commitMs.push(Date.now() - t0);
      const longAfter: number = await page.evaluate(
            () => ((performance as any).__auditLongTasks ?? []).length,
      );
      longDuring.push(longAfter - longBefore);
    }
    const summary = {
      runs: RUNS,
      filterCommitLatencyMs: {
        median: median(commitMs),
        p95: percentile(commitMs, 95),
      },
      longTasksDuringInteraction: {
        median: median(longDuring),
        max: Math.max(...longDuring),
      },
      note: "Latência fim-a-fim do commit do filtro (digitação + debounce + fetch + render, medida até a URL refletir a query). Medição laboratorial — NÃO equivale ao INP de campo (RUM).",
    };
    fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
    const prev = JSON.parse(fs.readFileSync(RESULTS, "utf8"));
    prev.interactionLab = summary;
    fs.writeFileSync(RESULTS, JSON.stringify(prev, null, 2));
    test.info().attach("interaction-lab.json", {
      body: Buffer.from(JSON.stringify(summary, null, 2)),
      contentType: "application/json",
    });
    // Sem portão rígido: resultado é diagnóstico para o relatório.
    expect(true).toBeTruthy();
  });

  test("CPU 4x limitada: backlog permanece utilizável", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await installVitalsObservers(page);
    const t0 = Date.now();
    await page.goto("/backlog", { waitUntil: "load", timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /jogos/i })).toBeVisible({ timeout: 60_000 });
    const elapsed = Date.now() - t0;
    const m = await collectWebMetrics(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    test.info().annotations.push({
      type: "cpu-throttle",
      description: `CPU 4x: heading visível em ${elapsed}ms; longTasks=${m.paint.longTasks} total=${Math.round(m.paint.longTasksTotalMs)}ms`,
    });
    expect(elapsed).toBeLessThan(90000);
  });
});
