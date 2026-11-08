/**
 * Atlas seed tests.
 *
 * Unit coverage: URI classification, provider match selection, seed-table
 * invariants (30 titles, stable unique slugs, status distribution).
 *
 * Integration coverage (isolated mongodb-memory-server, fake provider —
 * never Atlas, never destructive): user creation/reuse without password
 * changes, catalog insert + reuse, library linkage, rerun idempotency,
 * preservation of manual edits, metadata backfill, partial-failure
 * isolation, and required-credential failures.
 */

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { __resetConnectionCache, connectDatabase } from "@/db/connection";
import { __resetServerEnvCache } from "@/lib/env";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { User } from "@/db/models/user";
import { registerUser } from "@/server/auth/service";
import { GAME_STATUSES } from "@/schemas/games";
import type { SearchCard } from "@/server/search/types";
import {
  ATLAS_SEED_GAMES,
  classifyMongoUri,
  pickProviderMatch,
  runAtlasSeed,
  type AtlasSeedProvider,
  type ProviderDetail,
} from "@/server/seeds/atlas-seed";

const TEST_EMAIL = "atlas-seed@test.local";
const TEST_PASSWORD = "seed-password-01";

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.APP_URL = "http://test.local";
  await connectDatabase();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  __resetConnectionCache();
  __resetServerEnvCache();
  delete process.env.MONGODB_URI;
  await mongoServer?.stop();
  mongoServer = undefined;
});

afterEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
});

function card(overrides: Partial<SearchCard> & { name: string }): SearchCard {
  return {
    id: "1",
    year: 2000,
    platforms: [],
    genres: [],
    ...overrides,
  };
}

/** Fake provider: deterministic IGDB-style detail per seeded title. */
function fakeProvider(opts?: {
  failSearchFor?: string[];
  corruptDetailFor?: string[];
  noResults?: boolean;
}): AtlasSeedProvider {
  const detailForTitle = (title: string): ProviderDetail => {
    const entry = ATLAS_SEED_GAMES.find((e) => e.title === title)!;
    const corrupt = opts?.corruptDetailFor?.includes(title) === true;
    return {
      id: `9000${ATLAS_SEED_GAMES.indexOf(entry)}`,
      name: entry.title,
      year: corrupt ? Number.NaN : 1998,
      platforms: [entry.platform],
      developers: ["Seed Dev"],
      publishers: ["Seed Pub"],
      genres: ["Adventure"],
      summary: "Seed summary.",
      releases: [],
      externalIdentifiers: [{ source: "igdb", id: `9000${ATLAS_SEED_GAMES.indexOf(entry)}` }],
      coverUrl: "https://example.com/cover.jpg",
    };
  };
  return {
    searchGames: async ({ q, platform }) => {
      if (opts?.noResults) return { data: [] };
      if (opts?.failSearchFor?.some((part) => q.includes(part))) {
        throw new Error("provider down");
      }
      const entry = ATLAS_SEED_GAMES.find((e) => e.title === q);
      if (!entry) return { data: [] };
      const id = `9000${ATLAS_SEED_GAMES.indexOf(entry)}`;
      const data: SearchCard[] = [
        card({ id: `${id}-remaster`, name: `${entry.title} Remaster`, year: 2020, platforms: ["PC (Microsoft Windows)"] }),
        card({ id, name: entry.title, year: 1998, platforms: [platform ?? entry.platform] }),
      ];
      return { data };
    },
    getGameDetail: async (id): Promise<ProviderDetail> => {
      const match = id.match(/^9000(\d+)/);
      const entry = match ? ATLAS_SEED_GAMES[Number(match[1])] : undefined;
      if (!entry) throw new Error("not found");
      return detailForTitle(entry.title);
    },
  };
}

describe("classifyMongoUri", () => {
  it("classifies mongodb+srv as atlas without needing credentials", () => {
    expect(classifyMongoUri("mongodb+srv://u:p@cluster0.example.mongodb.net")).toBe("atlas");
  });

  it("classifies standard URIs on mongodb.net hosts as atlas", () => {
    expect(
      classifyMongoUri("mongodb://u:p@host.example.mongodb.net:27017/db?tls=true"),
    ).toBe("atlas");
  });

  it("classifies localhost as local", () => {
    expect(classifyMongoUri("mongodb://localhost:27017/save-state")).toBe("local");
    expect(classifyMongoUri("mongodb://127.0.0.1:27017/save-state")).toBe("local");
  });

  it("classifies garbage and foreign hosts as other", () => {
    expect(classifyMongoUri("not-a-uri")).toBe("other");
    expect(classifyMongoUri("mongodb://db.internal:27017/app")).toBe("other");
  });
});

describe("pickProviderMatch", () => {
  it("returns undefined for empty results", () => {
    expect(pickProviderMatch("Elden Ring", "PC (Microsoft Windows)", [])).toBeUndefined();
  });

  it("prefers the exact title on the reference platform over remasters", () => {
    const cards = [
      card({ id: "remake", name: "Resident Evil 2", year: 2019, platforms: ["PlayStation 4"] }),
      card({ id: "orig", name: "Resident Evil 2", year: 1998, platforms: ["PlayStation"] }),
    ];
    expect(pickProviderMatch("Resident Evil 2", "PlayStation", cards)?.id).toBe("orig");
  });

  it("prefers the earliest year when the platform cannot disambiguate", () => {
    const cards = [
      card({ id: "new", name: "Dark Souls", year: 2011, platforms: ["PlayStation 3"] }),
      card({ id: "old", name: "Dark Souls", year: 2011, platforms: ["Xbox 360"] }),
      card({ id: "remaster", name: "Dark Souls Remastered", year: 2018, platforms: ["PlayStation 4"] }),
    ];
    expect(pickProviderMatch("Dark Souls", "PlayStation 3", cards)?.id).toBe("new");
  });

  it("prefers the canonical entry when year and platform tie", () => {
    const cards = [
      card({ id: "edition", name: "Final Fantasy VII", year: 1997, platforms: ["PlayStation"] }),
      card({ id: "canon", name: "Final Fantasy VII", year: 1997, platforms: ["PlayStation 3", "PlayStation", "PlayStation Portable"] }),
    ];
    expect(pickProviderMatch("Final Fantasy VII", "PlayStation", cards)?.id).toBe("canon");
  });

  it("falls back to prefix then any result instead of failing", () => {
    const cards = [card({ id: "x", name: "Unrelated Game", year: null, platforms: [] })];
    expect(pickProviderMatch("Devil May Cry 3", "PlayStation 2", cards)?.id).toBe("x");
  });
});

describe("ATLAS_SEED_GAMES table", () => {
  it("contains exactly the 30 required titles", () => {
    expect(ATLAS_SEED_GAMES).toHaveLength(30);
    const titles = ATLAS_SEED_GAMES.map((g) => g.title);
    for (const required of [
      "The Legend of Zelda: Ocarina of Time",
      "Chrono Trigger",
      "Pokémon Emerald",
      "Baldur's Gate 3",
    ]) {
      expect(titles).toContain(required);
    }
  });

  it("uses stable unique slugs and valid statuses", () => {
    const slugs = ATLAS_SEED_GAMES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(30);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug).not.toMatch(/\d{10,}/);
    }
    for (const game of ATLAS_SEED_GAMES) {
      expect(GAME_STATUSES).toContain(game.status);
    }
  });

  it("distributes every status exactly three times", () => {
    for (const status of GAME_STATUSES) {
      expect(ATLAS_SEED_GAMES.filter((g) => g.status === status)).toHaveLength(3);
    }
  });
});

describe("runAtlasSeed", () => {
  it("creates the user, catalog, and library on first run", async () => {
    const summary = await runAtlasSeed({
      provider: fakeProvider(),
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(summary.userReused).toBe(false);
    expect(summary.globalCreated).toBe(30);
    expect(summary.globalReused).toBe(0);
    expect(summary.libraryCreated).toBe(30);
    expect(summary.libraryKept).toBe(0);
    expect(summary.failures).toEqual([]);

    const user = await User.findOne({ email: TEST_EMAIL }).lean();
    expect(user).not.toBeNull();
    expect(await bcrypt.compare(TEST_PASSWORD, user!.passwordHash)).toBe(true);
    expect(await GlobalGame.countDocuments()).toBe(30);
    expect(await UserGame.countDocuments({ userId: user!._id })).toBe(30);
  });

  it("is idempotent: a second run reuses everything without duplicates", async () => {
    await runAtlasSeed({ provider: fakeProvider(), email: TEST_EMAIL, password: TEST_PASSWORD });
    const summary = await runAtlasSeed({
      provider: fakeProvider(),
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(summary.userReused).toBe(true);
    expect(summary.globalCreated).toBe(0);
    expect(summary.globalReused).toBe(30);
    expect(summary.libraryCreated).toBe(0);
    expect(summary.libraryKept).toBe(30);
    expect(await GlobalGame.countDocuments()).toBe(30);
    const user = await User.findOne({ email: TEST_EMAIL }).lean();
    expect(await UserGame.countDocuments({ userId: user!._id })).toBe(30);
  });

  it("reuses an existing user without changing its password", async () => {
    await registerUser({ name: "Existing", email: TEST_EMAIL, password: "original-password" });
    const before = (await User.findOne({ email: TEST_EMAIL }).lean())!;

    const summary = await runAtlasSeed({
      provider: fakeProvider(),
      email: TEST_EMAIL,
      password: "different-password",
    });

    expect(summary.userReused).toBe(true);
    const after = (await User.findOne({ email: TEST_EMAIL }).lean())!;
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await bcrypt.compare("original-password", after.passwordHash)).toBe(true);
    expect(await bcrypt.compare("different-password", after.passwordHash)).toBe(false);
  });

  it("preserves manual edits made after the first seed", async () => {
    await runAtlasSeed({ provider: fakeProvider(), email: TEST_EMAIL, password: TEST_PASSWORD });
    const target = ATLAS_SEED_GAMES[0];
    const global = (await GlobalGame.findOne({ slug: target.slug }).lean())!;
    await GlobalGame.updateOne({ _id: global._id }, { summary: "Hand-written note." });
    const user = (await User.findOne({ email: TEST_EMAIL }).lean())!;
    const userGame = (await UserGame.findOne({ userId: user._id, gameId: global._id }).lean())!;
    await UserGame.updateOne({ _id: userGame._id }, { rating: 7, review: "Mine." });

    await runAtlasSeed({ provider: fakeProvider(), email: TEST_EMAIL, password: TEST_PASSWORD });

    expect((await GlobalGame.findById(global._id).lean())!.summary).toBe("Hand-written note.");
    const kept = (await UserGame.findById(userGame._id).lean())!;
    expect(kept.rating).toBe(7);
    expect(kept.review).toBe("Mine.");
  });

  it("falls back to minimal records and reports incomplete when the provider is down", async () => {
    const summary = await runAtlasSeed({
      provider: fakeProvider({ noResults: true }),
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(summary.globalCreated).toBe(30);
    expect(summary.incomplete).toHaveLength(30);
    expect(summary.failures).toEqual([]);
    const sample = await GlobalGame.findOne({ slug: ATLAS_SEED_GAMES[0].slug }).lean();
    expect(sample!.source).toBe("manual");
    expect(sample!.platforms).toEqual([ATLAS_SEED_GAMES[0].platform]);
  });

  it("backfills missing metadata on rerun without overwriting stored values", async () => {
    await runAtlasSeed({
      provider: fakeProvider({ noResults: true }),
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    const slug = ATLAS_SEED_GAMES[1].slug;
    await GlobalGame.updateOne({ slug }, { developers: ["Hand-kept Studio"] });

    const summary = await runAtlasSeed({
      provider: fakeProvider(),
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(summary.globalCreated).toBe(0);
    expect(summary.globalBackfilled).toBeGreaterThan(0);
    const upgraded = (await GlobalGame.findOne({ slug }).lean())!;
    expect(upgraded.source).toBe("igdb");
    expect(upgraded.igdbId).toBe(90001);
    expect(upgraded.developers).toEqual(["Hand-kept Studio"]);
    expect(summary.failures).toEqual([]);
  });

  it("isolates per-title failures and keeps seeding the rest", async () => {
    // One corrupt provider datum (invalid release year) fails its insert;
    // the other 29 titles must still seed, and the failure is reported.
    const badTitle = ATLAS_SEED_GAMES[2].title;
    const summary = await runAtlasSeed({
      provider: fakeProvider({ corruptDetailFor: [badTitle] }),
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].slug).toBe(ATLAS_SEED_GAMES[2].slug);
    expect(summary.globalCreated).toBe(29);
    expect(summary.libraryCreated).toBe(29);
    expect(await GlobalGame.countDocuments()).toBe(29);
    const user = await User.findOne({ email: TEST_EMAIL }).lean();
    expect(await UserGame.countDocuments({ userId: user!._id })).toBe(29);
  });

  it("fails closed without credentials", async () => {
    await expect(
      runAtlasSeed({ provider: fakeProvider(), email: "", password: TEST_PASSWORD }),
    ).rejects.toThrow(/email/);
    await expect(
      runAtlasSeed({ provider: fakeProvider(), email: TEST_EMAIL, password: "" }),
    ).rejects.toThrow(/password/);
    expect(await User.countDocuments()).toBe(0);
    expect(await GlobalGame.countDocuments()).toBe(0);
  });
});
