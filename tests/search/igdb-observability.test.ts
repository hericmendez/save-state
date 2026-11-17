import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetServerEnvCache } from "@/lib/env";
import {
  __resetIgdbThrottle,
  igdbRequest,
} from "@/server/search/igdb-client";
import {
  __resetTwitchTokenCache,
  getTwitchToken,
} from "@/server/search/twitch-token";

const SOURCE: Record<string, string | undefined> = {
  MONGODB_URI: "mongodb://localhost:27017/save-state",
  JWT_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:1337",
  SEARCH_METHOD: "IGDB",
  TWITCH_CLIENT_ID: "test-client-id",
  TWITCH_CLIENT_SECRET: "test-client-secret",
};

let logOutput: string[];
let consoleSpies: ReturnType<typeof vi.spyOn>[];

function installFetch(
  igdb: (url: string, init?: RequestInit) => Promise<Response>,
  oauth = () =>
    Promise.resolve(
      Response.json({ access_token: "fake-access-token", expires_in: 3600 }),
    ),
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      return url.includes("oauth2/token") ? oauth() : igdb(url, init);
    }),
  );
}

function loggedEvents() {
  return logOutput.map((line) => JSON.parse(line) as {
    message: string;
    details?: Record<string, unknown>;
  });
}

beforeEach(() => {
  logOutput = [];
  consoleSpies = (["info", "warn", "error"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logOutput.push(String(args[0]));
    }),
  );
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  __resetIgdbThrottle();
});

afterEach(() => {
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  __resetIgdbThrottle();
  vi.unstubAllGlobals();
  consoleSpies.forEach((spy) => spy.mockRestore());
});

describe("IGDB/Twitch structured observability", () => {
  it("records successful external requests without changing returned payload", async () => {
    installFetch(async () => Response.json([{ id: 42 }]));

    await expect(
      igdbRequest(
        "/games",
        'search "private search phrase"; fields id;',
        {
          timeoutMs: 1000,
          route: "POST /games",
          operation: "catalog_search",
        },
        SOURCE,
      ),
    ).resolves.toEqual([{ id: 42 }]);

    const event = loggedEvents().find((entry) => entry.message === "IGDB external request");
    expect(event?.details).toMatchObject({
      endpoint: "POST /games",
      operation: "catalog_search",
      status: 200,
      statusClass: "2xx",
      attempt: 1,
      throttleWaitMs: expect.any(Number),
      latencyMs: expect.any(Number),
      inFlight: 0,
    });
  });

  it.each([2, 10])(
    "shares one physical IGDB request between %s identical concurrent callers",
    async (callerCount) => {
      let igdbCalls = 0;
      let resolveExternal!: (response: Response) => void;
      let signalStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      installFetch(async () => {
        igdbCalls += 1;
        signalStarted();
        return new Promise<Response>((resolve) => {
          resolveExternal = resolve;
        });
      });

      const callers = Array.from({ length: callerCount }, () =>
        igdbRequest(
          "/games",
          "where id = 42; fields id;",
          {
            timeoutMs: 1000,
            route: "POST /games",
            operation: "game_detail",
          },
          SOURCE,
        ),
      );
      await started;
      expect(igdbCalls).toBe(1);
      resolveExternal(Response.json([{ id: 42 }]));
      await expect(Promise.all(callers)).resolves.toEqual(
        Array.from({ length: callerCount }, () => [{ id: 42 }]),
      );
      expect(igdbCalls).toBe(1);

      const sharingEvents = loggedEvents().filter(
        (entry) => entry.message === "IGDB single-flight",
      );
      expect(sharingEvents).toHaveLength(callerCount - 1);
      expect(
        sharingEvents.reduce(
          (total, entry) =>
            total + Number(entry.details?.avoidedExternalCalls ?? 0),
          0,
        ),
      ).toBe(callerCount - 1);
      expect(
        loggedEvents().filter(
          (entry) =>
            entry.message === "IGDB external request" &&
            entry.details?.execution === "external",
        ),
      ).toHaveLength(1);
    },
  );

  it("does not share requests with different bodies, endpoints, or logical operations", async () => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      return Response.json([{ id: igdbCalls }]);
    });
    const calls = [
      igdbRequest(
        "/games",
        "where id = 1; fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
      igdbRequest(
        "/games",
        "where id = 2; fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
      igdbRequest(
        "/platforms",
        "where id = 1; fields id;",
        { timeoutMs: 1000, route: "POST /platforms", operation: "game_detail" },
        SOURCE,
      ),
      igdbRequest(
        "/games",
        "where id = 1; fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "catalog_search" },
        SOURCE,
      ),
    ];
    await Promise.all(calls);
    expect(igdbCalls).toBe(4);
    expect(
      loggedEvents().filter((entry) => entry.message === "IGDB single-flight"),
    ).toHaveLength(0);
  });

  it("does not reuse a completed response for a later sequential call", async () => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      return Response.json([{ id: igdbCalls }]);
    });
    const invoke = () =>
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      );

    await expect(invoke()).resolves.toEqual([{ id: 1 }]);
    await expect(invoke()).resolves.toEqual([{ id: 2 }]);
    expect(igdbCalls).toBe(2);
  });

  it("does not share equivalent requests under different credentials", async () => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      return Response.json([]);
    });
    await Promise.all([
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        { ...SOURCE, TWITCH_CLIENT_SECRET: "different-secret" },
      ),
    ]);
    expect(igdbCalls).toBe(2);
  });

  it("lets one consumer cancel without aborting shared work for another", async () => {
    let resolveExternal!: (response: Response) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    installFetch(async () => {
      signalStarted();
      return new Promise<Response>((resolve) => {
        resolveExternal = resolve;
      });
    });
    const controller = new AbortController();
    const cancelledCaller = igdbRequest(
      "/games",
      "fields id;",
      {
        timeoutMs: 1000,
        route: "POST /games",
        operation: "game_detail",
        signal: controller.signal,
      },
      SOURCE,
    );
    const remainingCaller = igdbRequest(
      "/games",
      "fields id;",
      { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
      SOURCE,
    );
    await started;
    controller.abort(new Error("consumer cancelled"));
    await expect(cancelledCaller).rejects.toThrow("consumer cancelled");
    resolveExternal(Response.json([{ id: 9 }]));
    await expect(remainingCaller).resolves.toEqual([{ id: 9 }]);
  });

  it("aborts the shared HTTP request only after every consumer leaves and releases its permit", async () => {
    let igdbCalls = 0;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    installFetch(async (_url, init) => {
      igdbCalls += 1;
      if (igdbCalls > 1) return Response.json([{ id: 10 }]);
      signalStarted();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    });
    const controller = new AbortController();
    const cancelled = igdbRequest(
      "/games",
      "fields id;",
      {
        timeoutMs: 2000,
        route: "POST /games",
        operation: "game_detail",
        signal: controller.signal,
      },
      SOURCE,
    );
    await started;
    controller.abort(new Error("last consumer left"));
    await expect(cancelled).rejects.toThrow("last consumer left");

    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 2000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    ).resolves.toEqual([{ id: 10 }]);
    expect(igdbCalls).toBe(2);
    expect(
      loggedEvents().some(
        (event) =>
          event.message === "IGDB external request" &&
          event.details?.statusClass === "cancelled" &&
          event.details?.failure === "cancelled",
      ),
    ).toBe(true);
  });

  it("caps distinct open IGDB requests at eight and preserves 250 ms start spacing", async () => {
    let openRequests = 0;
    let maxOpenRequests = 0;
    const startedAt: number[] = [];
    const resolvers: Array<(response: Response) => void> = [];
    const startSignals = new Map<number, () => void>();
    const startedEight = new Promise<void>((resolve) => startSignals.set(8, resolve));
    const startedNine = new Promise<void>((resolve) => startSignals.set(9, resolve));
    installFetch(async () => {
      openRequests += 1;
      maxOpenRequests = Math.max(maxOpenRequests, openRequests);
      startedAt.push(Date.now());
      startSignals.get(startedAt.length)?.();
      return new Promise<Response>((resolve) => {
        resolvers.push((response) => {
          openRequests -= 1;
          resolve(response);
        });
      });
    });

    const requests = Array.from({ length: 9 }, (_, index) =>
      igdbRequest(
        "/games",
        `where id = ${index + 1}; fields id;`,
        { timeoutMs: 10_000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    );
    await startedEight;
    const maxAtEight = maxOpenRequests;
    resolvers[0](Response.json([]));
    await startedNine;
    const maxAtNine = maxOpenRequests;
    const observedStarts = [...startedAt];
    resolvers.slice(1).forEach((resolve) => resolve(Response.json([])));
    await Promise.all(requests);
    expect(maxAtEight).toBe(8);
    expect(maxAtNine).toBe(8);
    expect(observedStarts).toHaveLength(9);
    for (let index = 1; index < observedStarts.length; index += 1) {
      expect(observedStarts[index] - observedStarts[index - 1]).toBeGreaterThanOrEqual(250);
    }
    expect(openRequests).toBe(0);
  });

  it("cancels an operation waiting for throttle without affecting the open request", async () => {
    let resolveExternal!: (response: Response) => void;
    let externalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      externalStarted = resolve;
    });
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      externalStarted();
      return new Promise<Response>((resolve) => {
        resolveExternal = resolve;
      });
    });
    const first = igdbRequest(
      "/games",
      "where id = 1;",
      { timeoutMs: 3000, route: "POST /games", operation: "game_detail" },
      SOURCE,
    );
    await started;
    const controller = new AbortController();
    const queued = igdbRequest(
      "/games",
      "where id = 2;",
      {
        timeoutMs: 3000,
        route: "POST /games",
        operation: "game_detail",
        signal: controller.signal,
      },
      SOURCE,
    );
    for (let checks = 0; checks < 50; checks += 1) {
      if (
        loggedEvents().some(
          (entry) =>
            entry.message === "IGDB admission waiting" &&
            entry.details?.phase === "throttle",
        )
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    controller.abort(new Error("cancel while queued"));
    await expect(queued).rejects.toThrow("cancel while queued");
    resolveExternal(Response.json([]));
    await first;
    expect(igdbCalls).toBe(1);
    expect(
      loggedEvents().some(
        (entry) => entry.message === "IGDB admission cancelled",
      ),
    ).toBe(true);
  });

  it("expires an operation queued behind eight open requests without starting its fetch", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    let startedCount = 0;
    let signalEight!: () => void;
    const startedEight = new Promise<void>((resolve) => {
      signalEight = resolve;
    });
    installFetch(async () => {
      startedCount += 1;
      if (startedCount === 8) signalEight();
      return new Promise<Response>((resolve) => resolvers.push(resolve));
    });

    const firstEight = Array.from({ length: 8 }, (_, index) =>
      igdbRequest(
        "/games",
        `where id = ${index + 1};`,
        { timeoutMs: 10_000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    );
    const ninth = igdbRequest(
      "/games",
      "where id = 9;",
      { timeoutMs: 1, route: "POST /games", operation: "game_detail" },
      SOURCE,
    );
    await startedEight;
    const ninthError = expect(ninth).rejects.toMatchObject({ status: 503 });
    await ninthError;
    const observedStartedCount = startedCount;
    resolvers.forEach((resolve) => resolve(Response.json([])));
    await Promise.all(firstEight);
    expect(observedStartedCount).toBe(8);
    expect(
      loggedEvents().some(
        (entry) =>
          entry.message === "IGDB admission cancelled" &&
          entry.details?.reason === "deadline",
      ),
    ).toBe(true);
  });

  it.each([
    ["seconds", "1"],
    ["HTTP date", () => new Date(Date.now() + 1_000).toUTCString()],
    ["invalid header", "not-a-date"],
    ["negative header", "-1"],
    ["missing header", null],
  ])("retries 429 once using Retry-After (%s) or bounded jitter fallback", async (_kind, header) => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      if (igdbCalls === 1) {
        const retryAfter = typeof header === "function" ? header() : header;
        return new Response("{}", {
          status: 429,
          headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
        });
      }
      return Response.json([{ id: 7 }]);
    });

    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 2000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    ).resolves.toEqual([{ id: 7 }]);
    const retryEvent = loggedEvents().find(
      (event) => event.message === "IGDB retry",
    )?.details;
    expect(igdbCalls).toBe(2);
    expect(retryEvent).toMatchObject({
      reason: "rate_limit",
      attempt: 1,
      delaySource:
        _kind === "seconds" || _kind === "HTTP date"
          ? "retry_after"
          : "fallback",
      waitMs: expect.any(Number),
    });
    if (_kind === "seconds") expect(retryEvent?.waitMs).toBe(1000);
    if (_kind === "HTTP date") {
      expect(Number(retryEvent?.waitMs)).toBeGreaterThan(0);
      expect(Number(retryEvent?.waitMs)).toBeLessThanOrEqual(1000);
    }
    if (
      _kind === "invalid header" ||
      _kind === "negative header" ||
      _kind === "missing header"
    ) {
      expect(Number(retryEvent?.waitMs)).toBeGreaterThanOrEqual(125);
      expect(Number(retryEvent?.waitMs)).toBeLessThanOrEqual(250);
    }
  });

  it("does not retry a Retry-After value beyond the configured wait budget", async () => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      return new Response("{}", {
        status: 429,
        headers: { "Retry-After": "3" },
      });
    });
    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED", status: 429 });
    expect(igdbCalls).toBe(1);
    expect(
      loggedEvents().some(
        (entry) =>
          entry.message === "IGDB retry budget exhausted" &&
          entry.details?.reason === "retry_after_exceeds_budget",
      ),
    ).toBe(true);
  });

  it("propagates the second 429 after exactly one automatic retry", async () => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      return new Response("{}", {
        status: 429,
        headers: { "Retry-After": "0" },
      });
    });
    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 2000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED", status: 429 });
    expect(igdbCalls).toBe(2);
    expect(
      loggedEvents().some(
        (entry) =>
          entry.message === "IGDB retry budget exhausted" &&
          entry.details?.reason === "max_429_retries",
      ),
    ).toBe(true);
  });

  it.each([
    [400, 500],
    [403, 500],
    [404, 500],
    [500, 503],
  ])("does not automatically retry non-recoverable HTTP %s", async (status, appStatus) => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      return new Response("{}", { status });
    });
    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    ).rejects.toMatchObject({ status: appStatus });
    expect(igdbCalls).toBe(1);
  });

  it.each([
    [401, "4xx"],
    [429, "4xx"],
    [503, "5xx"],
  ])("records HTTP %s and preserves the existing API error", async (status, statusClass) => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      return new Response("{}", { status });
    });

    const result = igdbRequest(
      "/games",
      'search "private search phrase";',
      { timeoutMs: 1000, route: "POST /games", operation: "catalog_search" },
      SOURCE,
    );
    await expect(result).rejects.toMatchObject({
      status: status === 401 ? 500 : status,
    });
    const event = loggedEvents().find((entry) => entry.message === "IGDB external request");
    expect(event?.details).toMatchObject({ status, statusClass });
    expect(igdbCalls).toBe(status === 401 || status === 429 ? 2 : 1);
  });

  it("does not log Apicalypse content for upstream 4xx responses", async () => {
    installFetch(async () => new Response("bad query", { status: 400 }));
    await expect(
      igdbRequest(
        "/games",
        'search "private search phrase"; fields id;',
        { timeoutMs: 1000, route: "POST /games", operation: "catalog_search" },
        SOURCE,
      ),
    ).rejects.toMatchObject({ status: 500 });
    expect(JSON.stringify(loggedEvents())).not.toContain("private search phrase");
  });

  it("removes failed operations so 429 and timeout retries execute externally again", async () => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      if (igdbCalls === 1) {
        return new Response("{}", {
          status: 429,
          headers: { "Retry-After": "3" },
        });
      }
      if (igdbCalls === 2) {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      }
      return Response.json([{ id: 42 }]);
    });
    const invoke = () =>
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      );

    await expect(invoke()).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED" });
    await expect(invoke()).rejects.toMatchObject({ code: "IGDB_UNAVAILABLE" });
    await expect(invoke()).resolves.toEqual([{ id: 42 }]);
    expect(igdbCalls).toBe(3);
    expect(
      loggedEvents().filter(
        (entry) =>
          entry.message === "IGDB external request" &&
          entry.details?.execution === "external",
      ),
    ).toHaveLength(3);
  });

  it("records one 401 retry attempt and keeps successful response semantics", async () => {
    let igdbCalls = 0;
    let oauthCalls = 0;
    installFetch(
      async () => {
        igdbCalls += 1;
        return igdbCalls === 1
          ? new Response("{}", { status: 401 })
          : Response.json({ ok: true });
      },
      async () => {
        oauthCalls += 1;
        return Response.json({
          access_token: `fake-token-${oauthCalls}`,
          expires_in: 3600,
        });
      },
    );

    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    ).resolves.toEqual({ ok: true });
    const events = loggedEvents().filter(
      (entry) => entry.message === "IGDB external request",
    );
    expect(events.map((entry) => entry.details?.attempt)).toEqual([1, 2]);
    expect(igdbCalls).toBe(2);
  });

  it("does not invalidate a refreshed Twitch token when a delayed 401 refers to the old token", async () => {
    let oauthCalls = 0;
    const tokenValues = ["token-A", "token-B", "token-C"];
    installFetch(
      async (_url, init) => {
        const requestBody = String(init?.body);
        const requestNumber = callsByBody.get(requestBody) ?? 0;
        callsByBody.set(requestBody, requestNumber + 1);
        authorizationByBody.set(requestBody, [
          ...(authorizationByBody.get(requestBody) ?? []),
          new Headers(init?.headers).get("Authorization"),
        ]);

        if (requestNumber === 0) {
          return new Promise<Response>((resolve) => {
            initialResponses.set(requestBody, resolve);
            if (initialResponses.size === 2) signalBothInitialRequests();
          });
        }
        return Response.json([{ ok: true, body: requestBody }]);
      },
      async () => {
        const accessToken = tokenValues[oauthCalls] ?? "unexpected-token";
        oauthCalls += 1;
        return Response.json({ access_token: accessToken, expires_in: 3600 });
      },
    );

    const callsByBody = new Map<string, number>();
    const initialResponses = new Map<string, (response: Response) => void>();
    const authorizationByBody = new Map<string, Array<string | null>>();
    let signalBothInitialRequests!: () => void;
    const bothInitialRequestsStarted = new Promise<void>((resolve) => {
      signalBothInitialRequests = resolve;
    });

    await expect(getTwitchToken(SOURCE)).resolves.toBe("token-A");
    const firstBody = "query-one";
    const secondBody = "query-two";
    const firstRequest = igdbRequest(
      "/games",
      firstBody,
      { timeoutMs: 3000, route: "POST /games", operation: "game_detail" },
      SOURCE,
    );
    const secondRequest = igdbRequest(
      "/games",
      secondBody,
      { timeoutMs: 3000, route: "POST /games", operation: "game_detail" },
      SOURCE,
    );

    await bothInitialRequestsStarted;
    expect(authorizationByBody.get(firstBody)).toEqual(["Bearer token-A"]);
    expect(authorizationByBody.get(secondBody)).toEqual(["Bearer token-A"]);

    initialResponses.get(firstBody)?.(new Response("{}", { status: 401 }));
    await expect(firstRequest).resolves.toEqual([{ ok: true, body: firstBody }]);
    expect(oauthCalls).toBe(2);
    expect(authorizationByBody.get(firstBody)).toEqual([
      "Bearer token-A",
      "Bearer token-B",
    ]);

    // Deliver the second 401 only after the first request has completed its
    // refresh and retry. This stale 401 still refers to token-A.
    initialResponses.get(secondBody)?.(new Response("{}", { status: 401 }));
    await expect(secondRequest).resolves.toEqual([{ ok: true, body: secondBody }]);

    expect(oauthCalls).toBe(2);
    expect(authorizationByBody.get(secondBody)).toEqual([
      "Bearer token-A",
      "Bearer token-B",
    ]);
    const invalidations = loggedEvents().filter(
      (event) => event.message === "Twitch token invalidation",
    );
    expect(invalidations.map((event) => event.details?.outcome)).toEqual([
      "invalidated",
      "ignored_replaced",
    ]);
    expect(JSON.stringify(loggedEvents())).not.toContain("token-A");
    expect(JSON.stringify(loggedEvents())).not.toContain("token-B");
    expect(JSON.stringify(loggedEvents())).not.toContain("token-C");
    expect(JSON.stringify(loggedEvents())).not.toContain("test-client-secret");
  });

  it("shares one Twitch refresh when two requests invalidate the same rejected token concurrently", async () => {
    let oauthCalls = 0;
    let resolveRefresh!: (response: Response) => void;
    let signalRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      signalRefreshStarted = resolve;
    });
    const callsByBody = new Map<string, number>();
    const initialResponses = new Map<string, (response: Response) => void>();
    const authorizationByBody = new Map<string, Array<string | null>>();
    let signalBothInitialRequests!: () => void;
    const bothInitialRequestsStarted = new Promise<void>((resolve) => {
      signalBothInitialRequests = resolve;
    });

    installFetch(
      async (_url, init) => {
        const requestBody = String(init?.body);
        const requestNumber = callsByBody.get(requestBody) ?? 0;
        callsByBody.set(requestBody, requestNumber + 1);
        authorizationByBody.set(requestBody, [
          ...(authorizationByBody.get(requestBody) ?? []),
          new Headers(init?.headers).get("Authorization"),
        ]);
        if (requestNumber === 0) {
          return new Promise<Response>((resolve) => {
            initialResponses.set(requestBody, resolve);
            if (initialResponses.size === 2) signalBothInitialRequests();
          });
        }
        return Response.json([{ ok: true, body: requestBody }]);
      },
      () => {
        oauthCalls += 1;
        if (oauthCalls === 1) {
          return Promise.resolve(
            Response.json({ access_token: "token-A", expires_in: 3600 }),
          );
        }
        signalRefreshStarted();
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      },
    );

    await expect(getTwitchToken(SOURCE)).resolves.toBe("token-A");
    const firstBody = "simultaneous-one";
    const secondBody = "simultaneous-two";
    const firstRequest = igdbRequest(
      "/games",
      firstBody,
      { timeoutMs: 3000, route: "POST /games", operation: "game_detail" },
      SOURCE,
    );
    const secondRequest = igdbRequest(
      "/games",
      secondBody,
      { timeoutMs: 3000, route: "POST /games", operation: "game_detail" },
      SOURCE,
    );
    await bothInitialRequestsStarted;

    // Release both old-token 401s before allowing the shared OAuth refresh
    // to complete. Both IGDB operations must join the same in-flight refresh.
    initialResponses.get(firstBody)?.(new Response("{}", { status: 401 }));
    initialResponses.get(secondBody)?.(new Response("{}", { status: 401 }));
    await refreshStarted;
    expect(oauthCalls).toBe(2);
    resolveRefresh(
      Response.json({ access_token: "token-B", expires_in: 3600 }),
    );

    await expect(
      Promise.all([firstRequest, secondRequest]),
    ).resolves.toEqual([
      [{ ok: true, body: firstBody }],
      [{ ok: true, body: secondBody }],
    ]);
    expect(oauthCalls).toBe(2);
    expect(authorizationByBody.get(firstBody)).toEqual([
      "Bearer token-A",
      "Bearer token-B",
    ]);
    expect(authorizationByBody.get(secondBody)).toEqual([
      "Bearer token-A",
      "Bearer token-B",
    ]);
    expect(
      loggedEvents()
        .filter((event) => event.message === "Twitch token invalidation")
        .map((event) => event.details?.outcome)
        .sort(),
    ).toEqual(["already_empty", "invalidated"]);
    const serialized = JSON.stringify(loggedEvents());
    expect(serialized).not.toContain("token-A");
    expect(serialized).not.toContain("token-B");
    expect(serialized).not.toContain("test-client-secret");
  });

  it.each([
    [401, 429, 200],
    [429, 401, 200],
  ])("combines one 401 retry and one 429 retry without loops (%s → %s → %s)", async (...statuses) => {
    let igdbCalls = 0;
    let oauthCalls = 0;
    installFetch(
      async () => {
        const status = statuses[igdbCalls] ?? 200;
        igdbCalls += 1;
        if (status === 200) return Response.json([{ id: 3 }]);
        return new Response("{}", {
          status,
          headers: status === 429 ? { "Retry-After": "0" } : undefined,
        });
      },
      async () => {
        oauthCalls += 1;
        return Response.json({
          access_token: `fake-token-${oauthCalls}`,
          expires_in: 3600,
        });
      },
    );
    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 2000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    ).resolves.toEqual([{ id: 3 }]);
    expect(igdbCalls).toBe(3);
    expect(
      loggedEvents().filter((event) => event.message === "IGDB external request"),
    ).toHaveLength(3);
  });

  it("cancels one consumer during Retry-After backoff while another completes", async () => {
    let igdbCalls = 0;
    installFetch(async () => {
      igdbCalls += 1;
      if (igdbCalls === 1) {
        return new Response("{}", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      return Response.json([{ id: 11 }]);
    });
    const controller = new AbortController();
    const firstConsumer = igdbRequest(
      "/games",
      "fields id;",
      {
        timeoutMs: 2000,
        route: "POST /games",
        operation: "game_detail",
        signal: controller.signal,
      },
      SOURCE,
    );
    const remainingConsumer = igdbRequest(
      "/games",
      "fields id;",
      { timeoutMs: 2000, route: "POST /games", operation: "game_detail" },
      SOURCE,
    );

    // The retry event is emitted synchronously after the mocked 429 response.
    for (let checks = 0; checks < 50; checks += 1) {
      if (loggedEvents().some((event) => event.message === "IGDB retry")) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    controller.abort(new Error("consumer left during backoff"));
    await expect(firstConsumer).rejects.toThrow("consumer left during backoff");
    await expect(remainingConsumer).resolves.toEqual([{ id: 11 }]);
    expect(igdbCalls).toBe(2);
    expect(
      loggedEvents().some(
        (event) =>
          event.message === "IGDB consumer cancelled" &&
          event.details?.phase === "backoff" &&
          event.details?.cancelsSharedOperation === false,
      ),
    ).toBe(true);
  });

  it.each([
    ["timeout", Object.assign(new Error("timed out"), { name: "TimeoutError" })],
    ["connection", new Error("network unavailable")],
  ])("records %s failures and preserves 503 behavior", async (failure, error) => {
    installFetch(async () => {
      throw error;
    });
    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1, route: "POST /games", operation: "catalog_search" },
        SOURCE,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(loggedEvents().some((entry) =>
      entry.message === "IGDB external request" &&
      entry.details?.failure === failure &&
      entry.details?.statusClass === "network_error",
    )).toBe(true);
  });

  it("records token cache miss, refresh, hit, and single-flight without secrets", async () => {
    let resolveOauth!: (response: Response) => void;
    let oauthCalls = 0;
    installFetch(
      async () => Response.json({}),
      () => {
        oauthCalls += 1;
        return new Promise<Response>((resolve) => {
          resolveOauth = resolve;
        });
      },
    );

    const first = getTwitchToken(SOURCE);
    const second = getTwitchToken(SOURCE);
    resolveOauth(
      Response.json({ access_token: "fake-access-token", expires_in: 3600 }),
    );
    await expect(Promise.all([first, second])).resolves.toEqual([
      "fake-access-token",
      "fake-access-token",
    ]);
    await expect(getTwitchToken(SOURCE)).resolves.toBe("fake-access-token");

    expect(oauthCalls).toBe(1);
    const tokenEvents = loggedEvents().filter((entry) =>
      entry.message.startsWith("Twitch token"),
    );
    expect(tokenEvents.map((entry) => entry.details?.outcome)).toEqual(
      expect.arrayContaining(["miss", "single_flight", "hit", "success"]),
    );
    const serialized = JSON.stringify(tokenEvents);
    expect(serialized).not.toContain("fake-access-token");
    expect(serialized).not.toContain("test-client-secret");
    expect(serialized).not.toContain("test-client-id");
  });

  it("records sanitized Twitch OAuth failures", async () => {
    installFetch(
      async () => Response.json({}),
      async () => new Response("rejected", { status: 401 }),
    );
    await expect(getTwitchToken(SOURCE)).rejects.toMatchObject({ status: 500 });
    const failure = loggedEvents().find(
      (entry) =>
        entry.message === "Twitch token refresh" &&
        entry.details?.outcome === "failure",
    );
    expect(failure?.details).toMatchObject({
      endpoint: "POST id.twitch.tv/oauth2/token",
      status: 401,
      statusClass: "4xx",
      latencyMs: expect.any(Number),
    });
    const serialized = JSON.stringify(loggedEvents());
    expect(serialized).not.toContain("test-client-secret");
    expect(serialized).not.toContain("test-client-id");
  });

  it("classifies a mocked Twitch OAuth fetch timeout without exposing credentials", async () => {
    const timeout = Object.assign(new Error("request timed out"), {
      name: "TimeoutError",
    });
    installFetch(async () => Response.json({}), () => Promise.reject(timeout));

    await expect(getTwitchToken(SOURCE)).rejects.toMatchObject({ status: 503 });
    expect(loggedEvents().find(
      (entry) => entry.message === "Twitch token refresh",
    )?.details).toMatchObject({
      endpoint: "POST id.twitch.tv/oauth2/token",
      outcome: "failure",
      failure: "timeout",
      latencyMs: expect.any(Number),
    });
    const serialized = JSON.stringify(loggedEvents());
    expect(serialized).not.toContain("test-client-secret");
    expect(serialized).not.toContain("test-client-id");
    expect(serialized).not.toContain("request timed out");
  });

  it("tracks simultaneous requests and never logs the Apicalypse search text", async () => {
    let finish!: () => void;
    let started = 0;
    installFetch(async () => {
      started += 1;
      if (started === 2) finish();
      await new Promise<void>((resolve) => {
        if (started === 2) resolve();
        else finish = resolve;
      });
      return Response.json([]);
    });

    await Promise.all([
      igdbRequest(
        "/games",
        'search "private search phrase one";',
        { timeoutMs: 1000, route: "POST /games", operation: "catalog_search" },
        SOURCE,
      ),
      igdbRequest(
        "/games",
        'search "private search phrase two";',
        { timeoutMs: 1000, route: "POST /games", operation: "catalog_search" },
        SOURCE,
      ),
    ]);

    const events = loggedEvents();
    expect(events.some((entry) =>
      entry.message === "IGDB external request" &&
      Number(entry.details?.maxInFlight) >= 2,
    )).toBe(true);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("private search phrase");
    expect(serialized).not.toContain("fake-access-token");
    expect(serialized).not.toContain("test-client-secret");
  });

  it("logging failures do not change successful operation results", async () => {
    installFetch(async () => Response.json({ safe: true }));
    consoleSpies.push(vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("logger unavailable");
    }));
    await expect(
      igdbRequest(
        "/games",
        "fields id;",
        { timeoutMs: 1000, route: "POST /games", operation: "game_detail" },
        SOURCE,
      ),
    ).resolves.toEqual({ safe: true });
  });
});
