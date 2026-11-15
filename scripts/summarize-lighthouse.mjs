/**
 * Resume os JSONs do Lighthouse em uma tabela Markdown no stdout e em
 * `lighthouse-report/summary.json`. Uso: node scripts/summarize-lighthouse.mjs <dir>
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "lighthouse-report";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "summary.json");

const pick = (audits, id) =>
  audits[id]
    ? { value: audits[id].numericValue ?? null, display: audits[id].displayValue ?? "" }
    : { value: null, display: "" };

const rows = [];
for (const file of files.sort()) {
  const json = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const audits = json.audits ?? {};
  const cats = json.categories ?? {};
  rows.push({
    page: file.replace(".json", ""),
    performance: cats.performance?.score != null ? Math.round(cats.performance.score * 100) : null,
    accessibility: cats.accessibility?.score != null ? Math.round(cats.accessibility.score * 100) : null,
    bestPractices: cats["best-practices"]?.score != null ? Math.round(cats["best-practices"].score * 100) : null,
    seo: cats.seo?.score != null ? Math.round(cats.seo.score * 100) : null,
    fcp: pick(audits, "first-contentful-paint"),
    lcp: pick(audits, "largest-contentful-paint"),
    tbt: pick(audits, "total-blocking-time"),
    cls: pick(audits, "cumulative-layout-shift"),
    speedIndex: pick(audits, "speed-index"),
    transfer: pick(audits, "total-byte-weight"),
    requests: pick(audits, "network-requests"),
  });
}

fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));

const fmt = (v, digits = 0) => (v === null || v === undefined || Number.isNaN(v) ? "n/d" : Number(v).toFixed(digits));
console.log("| Página | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | SpeedIndex | Transfer | Req |");
console.log("|---|---:|---:|---:|---:|---|----|----|-----|-----------|----------|-----:|");
for (const r of rows) {
  console.log(
    `| ${r.page} | ${r.performance ?? "n/d"} | ${r.accessibility ?? "n/d"} | ${r.bestPractices ?? "n/d"} | ${r.seo ?? "n/d"} ` +
      `| ${r.fcp.display || fmt(r.fcp.value)} | ${r.lcp.display || fmt(r.lcp.value)} | ${r.tbt.display || fmt(r.tbt.value)} ` +
      `| ${r.cls.display || fmt(r.cls.value, 3)} | ${r.speedIndex.display || fmt(r.speedIndex.value)} ` +
      `| ${r.transfer.display || fmt(r.transfer.value)} | ${r.requests.display || "?"} |`,
  );
}
