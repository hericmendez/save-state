/**
 * PERF — Carregamento inicial (Navigation Timing, transferência, waterfall).
 *
 * 5 execuções por rota em build de produção; registra mediana/p95 em
 * `.results/perf-load.json` para o relatório. Falha apenas se limites
 * severos forem violados (regressão grosseira), não nas metas-alvo.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  installVitalsObservers,
  collectWebMetrics,
  median,
} from "./helpers";

const RESULTS = "tests/e2e-perf/.results/perf-load.json";
const RUNS = 5;

// Rotas autenticadas (storageState) + 1 pública.
const ROUTES = [
  "/login",
  "/home",
  "/dashboard",
  "/backlog",
  "/catalog/platforms",
  "/search",
  "/diary",
  "/backlog/lists",
];

interface RequestInfo {
  url: string;
  method: string;
  bytes: number;
  cached: boolean;
  failed: boolean;
  pending: boolean;
  cacheControl: string | null;
  contentType: string | null;
}

test.describe("perf — carregamento inicial", () => {
  test.setTimeout(600_000);
  test("navigation timing + transferência + waterfall por rota", async ({
    page,
  }) => {
    const all: Record<string, any> = {};
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const abortedPrefetchTotal: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    // Prefetch/RSC cancelados pelo router (ERR_ABORTED) são comportamento
    // normal do Next.js, não falhas da aplicação — registrados à parte.
    page.on("requestfailed", (r) => {
      const err = r.failure()?.errorText ?? "";
      const entry = `${r.method()} ${r.url().slice(0, 160)} [${err}]`;
      if (/abort|cancel/i.test(err)) {
        abortedPrefetchTotal.push(entry);
      } else {
        failedRequests.push(entry);
      }
    });

    for (const route of ROUTES) {
      const samples: unknown[] = [];
      const waterfalls: RequestInfo[][] = [];
      const abortBefore = abortedPrefetchTotal.length;
      for (let i = 0; i < RUNS; i++) {
        const reqs: RequestInfo[] = [];
        const seen = new Map<string, RequestInfo>();
        const onResp = async (resp: import("@playwright/test").Response) => {
          try {
            const buf = await resp.body().catch(() => null);
            const headers = resp.headers();
            const url = resp.url();
            const existing = seen.get(url);
            const info: RequestInfo = {
              url: url.length > 220 ? url.slice(0, 220) + "…" : url,
              method: resp.request().method(),
              bytes: buf?.length ?? Number(headers["content-length"] ?? 0),
              cached:
                resp.fromServiceWorker() ||
                headers["x-nextjs-cache"] === "HIT" ||
                resp.status() === 304,
              failed: false,
              pending: false,
              cacheControl: headers["cache-control"] ?? null,
              contentType: headers["content-type"] ?? null,
            };
            if (existing) {
              existing.bytes = info.bytes; // última ocorrência
            } else {
              seen.set(url, info);
              reqs.push(info);
            }
          } catch {
            /* corpo indisponível */
          }
        };
        page.on("response", onResp);
        await installVitalsObservers(page);
        await page.goto(route, { waitUntil: "load", timeout: 60_000 });
        await page.waitForTimeout(2500); // LCP tardio / hidratação
        const metrics = await collectWebMetrics(page);
        page.off("response", onResp);
        // URLs pendentes após load.
        samples.push(metrics);
        waterfalls.push(reqs);
      }
      const ttbs = samples.map((s) => (s as { nav: { ttfbMs: number } | null }).nav?.ttfbMs ?? NaN);
      const loads = samples.map((s) => (s as { nav: { loadMs: number } | null }).nav?.loadMs ?? NaN);
      const transfers = samples.map(
        (s) => (s as { nav: { transferBytes: number } | null }).nav?.transferBytes ?? 0,
      );
      const counts = waterfalls.map((w) => w.length);
      const bytes = waterfalls.map((w) => w.reduce((a, r) => a + r.bytes, 0));

      // Maior payload individual (imagem/fonte/JS excessivo).
      const biggest = waterfalls
        .flat()
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 5);
      // Composição por tipo de recurso (mediana entre runs).
      const byTypeRuns = waterfalls.map((w) => {
        const groups: Record<string, { count: number; bytes: number }> = {};
        for (const r of w) {
          const ct = (r.contentType ?? "").split(";")[0].trim() || "unknown";
          const u = r.url.toLowerCase();
          const kind = ct.includes("javascript") || u.endsWith(".js")
            ? "script"
            : ct.includes("css") || u.endsWith(".css")
              ? "stylesheet"
              : ct.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|svg|ico)(\?|$)/.test(u)
                ? "image"
                : ct.includes("font") || /\.(woff2?|ttf|otf)(\?|$)/.test(u)
                  ? "font"
                  : ct.includes("html") || r.url.includes("localhost:") && !u.includes(".")
                    ? "document"
                    : ct;
          const g = groups[kind] ?? { count: 0, bytes: 0 };
          g.count += 1;
          g.bytes += r.bytes;
          groups[kind] = g;
        }
        return groups;
      });
      const byType: Record<string, { count: number; bytes: number }> = {};
      for (const groups of byTypeRuns) {
        for (const [k, v] of Object.entries(groups)) {
          const cur = byType[k] ?? { count: [] as number[], bytes: [] as number[] };
          (cur.count as unknown as number[]).push(v.count);
          (cur.bytes as unknown as number[]).push(v.bytes);
          byType[k] = cur;
        }
      }
      const byTypeMedian: Record<string, { count: number; bytes: number }> = {};
      for (const [k, v] of Object.entries(byType)) {
        byTypeMedian[k] = {
                count: median((v as any).count),
                bytes: median((v as any).bytes),
        };
      }
      // Duplicadas: mesma URL >1 vez na mesma carga.
      const dupes = waterfalls.map((w) => {
        const seen = new Map<string, number>();
        for (const r of w) seen.set(r.url, (seen.get(r.url) ?? 0) + 1);
        return [...seen.entries()].filter(([, n]) => n > 1).length;
      });

      all[route] = {
        runs: RUNS,
        ttfbMs: { median: median(ttbs.filter(Number.isFinite)) },
        loadMs: { median: median(loads.filter(Number.isFinite)) },
        transferBytesNav: { median: median(transfers) },
        requests: { median: median(counts) },
        totalBytes: { median: median(bytes) },
      duplicateUrlsPerRun: dupes,
      biggestResources: biggest,
      byTypeMedian,
      abortedPrefetchPerRoute: abortedPrefetchTotal.length - abortBefore,
      lastRunMetrics: samples[samples.length - 1],
    };
    }

    fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
    fs.writeFileSync(
      RESULTS,
      JSON.stringify(
        { startedAt: new Date().toISOString(), routes: all },
        null,
        2,
      ),
    );
    test.info().attach("perf-load.json", {
      body: fs.readFileSync(RESULTS),
      contentType: "application/json",
    });

    // Portões severos (regressão grosseira), não as metas-alvo do relatório.
    for (const [route, data] of Object.entries(all)) {
        const d = data as any;
      expect(d.ttfbMs.median, `${route} TTFB mediano`).toBeLessThan(5000);
      expect(d.loadMs.median, `${route} load mediano`).toBeLessThan(30000);
    }
    expect(failedRequests, `requisições falhadas: ${failedRequests.join("; ")}`).toEqual([]);
  });
});
