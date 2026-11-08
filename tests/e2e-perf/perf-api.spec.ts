/**
 * PERF — Latência da API em operações comuns (p50/p95).
 *
 * Mede no servidor de produção local com dados realistas (30 jogos).
 * Ambiente: localhost + MongoDB local — valores representam piso de
 * latência, não latência de rede real. Resultado em `.results/perf-api.json`.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { median, percentile, uniqueId } from "./helpers";

const RESULTS = "tests/e2e-perf/.results/perf-api.json";
const N = 31;

async function measure(
    request: any,
  method: "get" | "post" | "patch" | "delete",
  url: string,
    data?: any,
): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    const res =
      method === "get"
        ? await request.get(url)
        : method === "post"
          ? await request.post(url, { data })
          : method === "patch"
            ? await request.patch(url, { data })
            : await request.delete(url);
    samples.push(Date.now() - t0);
    if (!res.ok()) {
      throw new Error(`${method.toUpperCase()} ${url} -> ${res.status()}: ${await res.text()}`);
    }
  }
  return samples;
}

test.describe("perf — latência da API (operações comuns)", () => {
  test.setTimeout(600_000);

  test("p50/p95 das operações comuns", async ({ request }) => {
    // Seed realista: 30 jogos + 1 coleção.
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await request.post("/api/games", {
        data: { game: { name: `Seed API ${uniqueId("s")}` }, status: "backlog" },
      });
    expect(res.ok()).toBeTruthy();
      ids.push((await res.json()).data._id);
    }
    const colRes = await request.post("/api/game-collections", {
      data: { name: `Seed Col ${uniqueId("c")}` },
    });
    expect(colRes.ok()).toBeTruthy();

    const ops: Record<string, number[]> = {};
    ops["GET /api/auth/me"] = await measure(request, "get", "/api/auth/me");
    ops["GET /api/games"] = await measure(request, "get", "/api/games?limit=20");
    ops["GET /api/games?search"] = await measure(
      request,
      "get",
      "/api/games?limit=20&search=seed",
    );
    ops["GET /api/game-collections"] = await measure(
      request,
      "get",
      "/api/game-collections",
    );
    ops["GET /api/activity"] = await measure(
      request,
      "get",
      "/api/activity?limit=20",
    );
    ops["PATCH /api/games/:id"] = await measure(
      request,
      "patch",
      `/api/games/${ids[0]}`,
      { hoursPlayed: 5 },
    );

    const summary: Record<string, { n: number; p50: number; p95: number; max: number }> = {};
    for (const [op, samples] of Object.entries(ops)) {
      summary[op] = {
        n: samples.length,
        p50: median(samples),
        p95: percentile(samples, 95),
        max: Math.max(...samples),
      };
    }
    fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
    fs.writeFileSync(
      RESULTS,
      JSON.stringify({ startedAt: new Date().toISOString(), ops: summary }, null, 2),
    );
    test.info().attach("perf-api.json", {
      body: fs.readFileSync(RESULTS),
      contentType: "application/json",
    });

    // Portão severo: nenhuma operação comum acima de 5s em localhost.
    for (const [op, s] of Object.entries(summary)) {
      expect(s.p95, `${op} p95`).toBeLessThan(5000);
    }
  });
});
