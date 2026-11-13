/**
 * Helpers compartilhados da auditoria E2E + performance.
 *
 * - Contas e dados exclusivos por execução (sufixo único).
 * - Sincronização por assertions web-first; sem sleeps arbitrários.
 * - Métricas coletadas via Performance API / PerformanceObserver.
 */
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import mongoose from "mongoose";

export const E2E_PASSWORD = "e2e-Password-123";
export const E2E_AUTH_STORAGE_STATE = "tests/e2e-perf/.auth/user.json";

/** Reuses the real auth.setup session for domain specs to avoid redundant logins. */
export async function createAuthenticatedE2EContext(browser: Browser) {
  return browser.newContext({ storageState: E2E_AUTH_STORAGE_STATE });
}

export function uniqueId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

export function uniqueUser(): { name: string; email: string; password: string } {
  const id = uniqueId("audit");
  return {
    name: `Audit ${id}`,
    email: `${id}@e2e.local`,
    password: E2E_PASSWORD,
  };
}

function isolatedE2EDatabaseUri(): string {
  const uri = process.env.E2E_MONGODB_URI;
  if (process.env.E2E_DATABASE_EPHEMERAL !== "1" || process.env.E2E_ALLOW_FIXTURES !== "1" || !uri) {
    throw new Error("E2E fixtures require explicit ephemeral database opt-in");
  }
  const parsed = new URL(uri);
  const dbName = parsed.pathname.replace(/^\//u, "");
  if (
    !/^mongodb(?:\+srv)?:$/u.test(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    dbName !== "save-state-e2e" ||
    !parsed.searchParams.has("replicaSet")
  ) {
    throw new Error("E2E fixtures refuse non-local, non-test, or non-replica-set MongoDB URIs");
  }
  return uri;
}

async function connectE2EDatabase() {
  const uri = isolatedE2EDatabaseUri();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
  }
  return mongoose.connection.db!;
}

/**
 * Creates a verified user fixture in an opted-in ephemeral E2E replica set.
 * Domain E2Es exercise login through the real HTTP API afterward.
 */
export async function createVerifiedUserFixture(
  _request: APIRequestContext,
  user: { name: string; email: string; password: string },
): Promise<{ data: { id: string } }> {
  const db = await connectE2EDatabase();
  const _id = new mongoose.Types.ObjectId();
  await db.collection("users").insertOne({
    _id,
    name: user.name,
    email: user.email.toLowerCase(),
    passwordHash: await bcrypt.hash(user.password, 10),
    sessionVersion: 0,
    emailVerifiedAt: new Date(),
    top10: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { data: { id: _id.toString() } };
}

/** Create a pending account and a token consumed by the real verify endpoint. */
export async function createPendingUser(
  user: { name: string; email: string; password: string },
): Promise<string> {
  const db = await connectE2EDatabase();
  const _id = new mongoose.Types.ObjectId();
  const rawToken = crypto.randomBytes(32).toString("hex");
  await db.collection("users").insertOne({
    _id,
    name: user.name,
    email: user.email.toLowerCase(),
    passwordHash: await bcrypt.hash(user.password, 10),
    sessionVersion: 0,
    emailVerifiedAt: null,
    top10: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.collection("emailverificationtokens").insertOne({
    tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
    userId: _id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return rawToken;
}

export async function createPasswordResetToken(email: string): Promise<string> {
  const db = await connectE2EDatabase();
  const user = await db.collection("users").findOne({ email: email.toLowerCase() });
  if (!user) throw new Error("E2E password-reset fixture user does not exist");
  const rawToken = crypto.randomBytes(32).toString("hex");
  await db.collection("passwordresettokens").insertOne({
    tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
    userId: user._id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    used: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return rawToken;
}

export async function getE2EVerificationState(email: string): Promise<{
  exists: boolean;
  verified: boolean;
}> {
  const db = await connectE2EDatabase();
  const user = await db.collection("users").findOne(
    { email: email.toLowerCase() },
    { projection: { _id: 1, emailVerifiedAt: 1 } },
  );
  return { exists: user !== null, verified: user?.emailVerifiedAt instanceof Date };
}

/** Login via API (estabelece o cookie httpOnly `token` no contexto). */
export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const res = await request.post("/api/auth/login", {
    data: { email, password },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`login falhou (${res.status()}): ${body}`);
  }
}

/** Cria um UserGame via API. */
export async function createGame(
  request: APIRequestContext,
    payload: Record<string, any>,
  ): Promise<any> {
  const res = await request.post("/api/games", { data: payload });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createGame falhou (${res.status()}): ${body}`);
  }
  const json = await res.json();
    return (json as any).data ?? json;
}

export interface NavigationMetrics {
  dnsMs: number;
  tcpTlsMs: number;
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  transferBytes: number;
  decodedBytes: number;
  requestCount: number;
}

export interface PaintMetrics {
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  longTasks: number;
  longTasksTotalMs: number;
}

/** Coleta Navigation Timing + Paint + LayoutShift + LongTasks da página atual. */
export async function collectWebMetrics(page: Page): Promise<{
  nav: NavigationMetrics | null;
  paint: PaintMetrics;
  heapBytes: number | null;
  domNodes: number;
  jsListeners: number | null;
}> {
    return page.evaluate((): any => {
    const navEntries = performance.getEntriesByType(
      "navigation",
      ) as any[];
    const nav = navEntries[0] as
      | {
          domainLookupStart: number;
          domainLookupEnd: number;
          connectStart: number;
          secureConnectionStart: number;
          connectEnd: number;
          requestStart: number;
          responseStart: number;
          domContentLoadedEventEnd: number;
          loadEventEnd: number;
          startTime: number;
          transferSize: number;
          decodedBodySize: number;
        }
      | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint");
    const lcpEntries = (performance as any).__auditLCP as number[] | undefined;
    const clsValue = (performance as any).__auditCLS as number | undefined;
    const longTasks = (performance as any).__auditLongTasks as
      | { duration: number }[]
      | undefined;
    const heap = (performance as any).memory?.usedJSHeapSize ?? null;
    const domNodes = document.getElementsByTagName("*").length;
    return {
      nav: nav
        ? {
            dnsMs: nav.domainLookupEnd - nav.domainLookupStart,
            tcpTlsMs: nav.connectEnd - nav.connectStart,
            ttfbMs: nav.responseStart - nav.requestStart,
            domContentLoadedMs: nav.domContentLoadedEventEnd - nav.startTime,
            loadMs: nav.loadEventEnd - nav.startTime,
            transferBytes: nav.transferSize,
            decodedBytes: nav.decodedBodySize,
            requestCount: performance.getEntriesByType("resource").length,
          }
        : null,
      paint: {
        fcpMs: fcp ? fcp.startTime : null,
        lcpMs:
          lcpEntries && lcpEntries.length > 0
            ? lcpEntries[lcpEntries.length - 1]
            : null,
        cls: clsValue ?? null,
        longTasks: longTasks?.length ?? 0,
        longTasksTotalMs:
          longTasks?.reduce((a, t) => a + t.duration, 0) ?? 0,
      },
      heapBytes: heap,
      domNodes,
      jsListeners: null,
    };
  });
}

/**
 * Instala observers (LCP / CLS / LongTasks) ANTES da navegação.
 * Deve ser chamado antes de `page.goto`.
 */
export async function installVitalsObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const perf = performance as any;
    perf.__auditLCP = [];
    perf.__auditCLS = 0;
    perf.__auditLongTasks = [];
    try {
      const lcp = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          perf.__auditLCP.push(entry.startTime);
        }
      });
      lcp.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* PerformanceObserver indisponível */
    }
    try {
      const cls = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
                const e = entry as any;
          if (!e.hadRecentInput) perf.__auditCLS += e.value;
        }
      });
      cls.observe({ type: "layout-shift", buffered: true });
    } catch {
      /* layout-shift indisponível */
    }
    try {
      const lt = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          perf.__auditLongTasks.push({ duration: entry.duration });
        }
      });
      lt.observe({ type: "longtask", buffered: true });
    } catch {
      /* longtask indisponível */
    }
  });
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}
