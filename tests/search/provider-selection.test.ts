import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetServerEnvCache, loadServerEnv } from "@/lib/env";
import {
  getSearchProvider,
  getSearchProviderName,
} from "@/server/search/service";
import { AtpSearchProvider } from "@/server/search/atp-provider";
import { IgdbSearchProvider } from "@/server/search/igdb-provider";
import {
  __resetTwitchTokenCache,
  getTwitchToken,
} from "@/server/search/twitch-token";
import { searchImportSchema, searchQuerySchema } from "@/schemas/search";
import { atpSearchQuerySchema } from "@/schemas/atp";

const VALID = {
  MONGODB_URI: "mongodb://localhost:27017/save-state",
  JWT_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:1337",
} as const;

afterEach(() => {
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  vi.unstubAllGlobals();
});

describe("Etapa 2 — provider selection", () => {
  it("defaults SEARCH_METHOD to IGDB", () => {
    expect(loadServerEnv({ ...VALID }).SEARCH_METHOD).toBe("IGDB");
    expect(getSearchProviderName({ ...VALID })).toBe("IGDB");
  });

  it("selects the ATP provider when SEARCH_METHOD=ATP", () => {
    expect(getSearchProviderName({ ...VALID, SEARCH_METHOD: "ATP" })).toBe(
      "ATP",
    );
    expect(getSearchProvider({ ...VALID, SEARCH_METHOD: "ATP" })).toBeInstanceOf(
      AtpSearchProvider,
    );
  });

  it("selects the IGDB provider by default", () => {
    expect(getSearchProvider({ ...VALID })).toBeInstanceOf(IgdbSearchProvider);
  });

  it("rejects an unknown SEARCH_METHOD", () => {
    expect(() =>
      loadServerEnv({ ...VALID, SEARCH_METHOD: "STEAM" }),
    ).toThrow(/SEARCH_METHOD/);
  });

  it("keeps Twitch credentials optional at boot (validated on use)", () => {
    const env = loadServerEnv({ ...VALID });
    expect(env.TWITCH_CLIENT_ID).toBeUndefined();
    expect(env.TWITCH_CLIENT_SECRET).toBeUndefined();
  });

  it("fails fast with a clear error when IGDB is used without credentials", async () => {
    await expect(getTwitchToken({ ...VALID })).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("shares one in-flight Twitch refresh between concurrent callers", async () => {
    const payload = { access_token: "tok", expires_in: 3600 };
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return {
          ok: true,
          status: 200,
          json: async () => payload,
        } as Response;
      }),
    );
    const [a, b] = await Promise.all([
      getTwitchToken({
        ...VALID,
        TWITCH_CLIENT_ID: "cid",
        TWITCH_CLIENT_SECRET: "secret",
      }),
      getTwitchToken({
        ...VALID,
        TWITCH_CLIENT_ID: "cid",
        TWITCH_CLIENT_SECRET: "secret",
      }),
    ]);
    expect(a).toBe("tok");
    expect(b).toBe("tok");
    expect(calls).toBe(1);
  });
});

describe("Etapa 2 — neutral BFF contract parity", () => {
  it("accepts the same queries as the legacy ATP schema", () => {
    const valid = {
      q: "chrono",
      page: "1",
      limit: "20",
      platform: "SNES",
      family: "Nintendo",
    };
    expect(searchQuerySchema.safeParse(valid).success).toBe(true);
    expect(atpSearchQuerySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty queries on both contracts", () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(false);
    expect(atpSearchQuerySchema.safeParse({}).success).toBe(false);
  });

  it("accepts the neutral import body", () => {
    expect(
      searchImportSchema.safeParse({ externalId: "abc-123" }).success,
    ).toBe(true);
  });

  it("rejects an import without externalId", () => {
    expect(searchImportSchema.safeParse({}).success).toBe(false);
  });
});
