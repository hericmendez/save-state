/**
 * Fase 5 — propagação de cancelamento.
 *
 * Behavioral coverage for the layers that can honor a caller signal:
 * IGDB provider → igdbRequest → physical fetch, and Route Handler →
 * service → provider. Frontend wiring is asserted with the repo's
 * source-contract convention (no DOM infra in vitest).
 *
 * These are mock/controlled-signal tests. They do NOT prove that
 * Next.js/Vercel aborts request.signal on a real client disconnect.
 */

import { readFileSync } from "fs";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as neutralSearch } from "@/app/api/search/route";
import { __resetServerEnvCache } from "@/lib/env";
import { handleRoute } from "@/server/shared/route-handler";
import { __resetIgdbThrottle } from "@/server/search/igdb-client";
import {
  IgdbSearchProvider,
  __resetIgdbFilterCaches,
} from "@/server/search/igdb-provider";
import { __resetTwitchTokenCache } from "@/server/search/twitch-token";
import {
  TEST_USER,
  clearDatabase,
  markTestUserVerified,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

const SOURCE: Record<string, string | undefined> = {
  MONGODB_URI: "mongodb://localhost:27017/save-state",
  JWT_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:1337",
  SEARCH_METHOD: "IGDB",
  TWITCH_CLIENT_ID: "cid",
  TWITCH_CLIENT_SECRET: "secret",
};

const IGDB_GAME = {
  id: 1234,
  name: "Chrono Trigger",
  first_release_date: 798595200,
  genres: [],
  platforms: [{ id: 19, name: "Super Nintendo Entertainment System" }],
  involved_companies: [],
  cover: { id: 1, image_id: "abc" },
  game_type: 0,
};

function abortableResponse(signal: AbortSignal | undefined | null): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener(
      "abort",
      () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
}

afterEach(() => {
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  __resetIgdbThrottle();
  __resetIgdbFilterCaches();
  vi.unstubAllGlobals();
});

describe("IgdbSearchProvider signal propagation", () => {
  it("aborts the physical IGDB fetch when the caller cancels", async () => {
    let physicalSignal: AbortSignal | undefined;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        if (String(input).includes("oauth2/token")) {
          return Promise.resolve(
            Response.json({ access_token: "tok", expires_in: 3600 }),
          );
        }
        physicalSignal = init?.signal ?? undefined;
        signalStarted();
        return abortableResponse(init?.signal);
      }),
    );

    const controller = new AbortController();
    const pending = new IgdbSearchProvider().searchGames(
      { q: "chrono", page: 1, limit: 20 },
      SOURCE,
      controller.signal,
    );
    await started;
    controller.abort(new DOMException("Aborted", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(physicalSignal?.aborted).toBe(true);
  });

  it("does not degrade a cancelled count lookup into fallback pagination", async () => {
    let countSignal: AbortSignal | undefined;
    let countStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      countStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("oauth2/token")) {
          return Promise.resolve(
            Response.json({ access_token: "tok", expires_in: 3600 }),
          );
        }
        if (url.endsWith("/games/count")) {
          countSignal = init?.signal ?? undefined;
          countStarted();
          return abortableResponse(init?.signal);
        }
        return Promise.resolve(Response.json([IGDB_GAME]));
      }),
    );

    const controller = new AbortController();
    const pending = new IgdbSearchProvider().searchGames(
      { q: "", page: 1, limit: 20 },
      SOURCE,
      controller.signal,
    );
    await started;
    controller.abort(new DOMException("Aborted", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(countSignal?.aborted).toBe(true);
  });
});

describe("Route Handler signal propagation (controlled signal, not a real disconnect)", () => {
  beforeAll(async () => {
    await startTestDatabase();
  });
  afterAll(stopTestDatabase);
  beforeEach(async () => {
    await clearDatabase();
    __resetServerEnvCache();
    __resetTwitchTokenCache();
    __resetIgdbThrottle();
    __resetIgdbFilterCaches();
    process.env.SEARCH_METHOD = "IGDB";
    process.env.TWITCH_CLIENT_ID = "cid";
    process.env.TWITCH_CLIENT_SECRET = "secret";
    process.env.ATP_BASE_URL = "http://atp.test";
    __resetServerEnvCache();
  });
  afterEach(() => {
    __resetServerEnvCache();
    __resetTwitchTokenCache();
    delete process.env.SEARCH_METHOD;
  });

  async function tokenFor(): Promise<string> {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const response = await login(
      postRequest("/api/auth/login", {
        email: TEST_USER.email,
        password: TEST_USER.password,
      }),
    );
    const token = response.cookies.get("token")?.value;
    if (!token) throw new Error("login did not issue a token");
    return token;
  }

  function requestWithSignal(token: string, signal: AbortSignal): NextRequest {
    return new NextRequest("http://localhost/api/search?q=chrono", {
      headers: { cookie: `token=${token}` },
      signal,
    });
  }

  it("passes request.signal down to the physical IGDB fetch", async () => {
    const token = await tokenFor();
    let physicalSignal: AbortSignal | undefined;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        if (String(input).includes("oauth2/token")) {
          return Promise.resolve(
            Response.json({ access_token: "tok", expires_in: 3600 }),
          );
        }
        physicalSignal = init?.signal ?? undefined;
        signalStarted();
        return abortableResponse(init?.signal);
      }),
    );

    const controller = new AbortController();
    const pending = neutralSearch(requestWithSignal(token, controller.signal));
    await started;
    controller.abort(new DOMException("Aborted", "AbortError"));
    const response = await pending;

    // The contract is unchanged; the client is gone, so the status is moot.
    expect(response.status).toBe(500);
    expect(physicalSignal?.aborted).toBe(true);
  });

  it("starts no IGDB fetch when the request is already aborted", async () => {
    const token = await tokenFor();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    controller.abort(new DOMException("Aborted", "AbortError"));
    const response = await neutralSearch(
      requestWithSignal(token, controller.signal),
    );

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("handleRoute cancellation logging", () => {
  it("does not log an intentional AbortError as an unhandled failure", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const cancellation = new Error("Request cancelled");
    cancellation.name = "AbortError";

    const response = await handleRoute(() => {
      throw cancellation;
    });

    expect(response.status).toBe(500);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("frontend abort wiring (source contract)", () => {
  it.each([
    "features/games/game-metadata-search.tsx",
    "features/games/game-cover-search.tsx",
  ])("%s aborts obsolete lookups and silences AbortError", (file) => {
    const content = readFileSync(file, "utf8");
    for (const pattern of [
      "abortRef = useRef<AbortController | null>(null)",
      "abortRef.current?.abort()",
      "new AbortController()",
      "{ signal: controller.signal }",
      'err.name === "AbortError"',
      "useEffect(() => () => abortRef.current?.abort(), [])",
      "requestIdRef",
    ]) {
      expect(content.includes(pattern), pattern).toBe(true);
    }
  });

  it("cover previews and the external detail load abort on cleanup", () => {
    for (const file of [
      "features/atp/use-atp-cover.ts",
      "features/games/game-form-container.tsx",
    ]) {
      const content = readFileSync(file, "utf8");
      expect(content.includes("new AbortController()"), file).toBe(true);
      expect(content.includes("signal: controller.signal"), file).toBe(true);
      expect(content.includes("controller.abort()"), file).toBe(true);
    }
  });
});
