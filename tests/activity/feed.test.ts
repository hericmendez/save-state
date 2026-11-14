import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as getFeed } from "@/app/api/activity/route";
import { Activity } from "@/db/models/activity";
import { User } from "@/db/models/user";
import {
  decodeCursor,
  encodeCursor,
} from "@/server/activity/cursor";
import {
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

const PASSWORD = "password-123";

async function registerUser(name: string, email: string): Promise<{ id: string; token: string }> {
  await register(postRequest("/api/auth/register", { name, email, password: PASSWORD }));
  await markTestUserVerified(email);
  const response = await login(postRequest("/api/auth/login", { email, password: PASSWORD }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  const user = await User.findOne({ email }).lean();
  if (!user) throw new Error("user was not created");
  return { id: String(user._id), token };
}

function getRequest(token: string | null, query = ""): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `token=${token}`;
  return new NextRequest(`http://localhost/api/activity${query}`, { headers });
}

async function getJson(token: string | null, query = "") {
  const response = await getFeed(getRequest(token, query));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

let gameSeq = 0;
function gameId(): string {
  gameSeq += 1;
  return `1000000000000000000000${String(gameSeq).padStart(2, "0")}`;
}

async function seed(
  userId: string,
  events: Array<{
    type: string;
    createdAt: string;
    name?: string;
    noGame?: boolean;
    metadata?: Record<string, unknown>;
    userGameId?: string;
    list?: { listId?: string; name: string };
  }>,
): Promise<void> {
  for (const event of events) {
    await Activity.create({
      userId: new Types.ObjectId(userId),
      type: event.type,
      ...(event.userGameId ? { userGameId: new Types.ObjectId(event.userGameId) } : {}),
      ...(event.noGame ? {} : { game: { name: event.name ?? "Seed Game" } }),
      ...(event.list ? { list: event.list } : {}),
      metadata: event.metadata ?? {},
      createdAt: new Date(event.createdAt),
    });
  }
}

function at(day: number, hour: number, minute: number, second = 0): string {
  return new Date(Date.UTC(2026, 8, day, hour, minute, second)).toISOString();
}

function memberIds(page: Record<string, unknown>): string[] {
  const data = page.data as Array<{ members: Array<{ _id: string }> }>;
  return data.flatMap((item) => item.members.map((member) => member._id));
}

describe("cursor unit", () => {
  it("round-trips through opaque transport", () => {
    const cursor = encodeCursor({
      createdAt: "2026-09-21T12:00:00.000Z",
      _id: "000000000000000000000001",
    });
    expect(cursor).not.toContain("{");
    expect(decodeCursor(cursor)).toEqual({
      createdAt: "2026-09-21T12:00:00.000Z",
      _id: "000000000000000000000001",
    });
  });

  it.each([
    ["not-base64!!!", "garbage"],
    [Buffer.from("null", "utf8").toString("base64url"), "null payload"],
    [
      Buffer.from(JSON.stringify({ createdAt: "nope", _id: "x" }), "utf8").toString("base64url"),
      "bad fields",
    ],
  ])("rejects malformed cursor (%s)", (raw) => {
    expect(() => decodeCursor(raw)).toThrowError(/Invalid pagination cursor/);
  });
});

describe("pagination", () => {
  it("returns the default page of 10 visual items", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    await seed(
      id,
      Array.from({ length: 12 }, (_, index) =>
        index % 2 === 0
          ? {
              type: "game.status_changed",
              createdAt: at(21, 12, index),
              name: `Game ${index}`,
              metadata: { from: "backlog", to: "playing" },
            }
          : {
              type: "game.rating_changed",
              createdAt: at(21, 12, index),
              name: `Game ${index}`,
              metadata: { from: null, to: 8 },
            },
      ),
    );
    const { status, body } = await getJson(token, "");
    expect(status).toBe(200);
    const data = body.data as unknown[];
    expect(data).toHaveLength(10);
    const pagination = body.pagination as Record<string, unknown>;
    expect(pagination).toMatchObject({ limit: 10, hasMore: true });
    expect(typeof pagination.nextCursor).toBe("string");
  });

  it("walks pages without overlap or gaps, ending cleanly", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    await seed(
      id,
      Array.from({ length: 12 }, (_, index) => ({
        type: "game.status_changed",
        createdAt: at(21, 12, index),
        name: `Game ${index}`,
        metadata: { from: "backlog", to: "playing" },
      })),
    );
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    while (true) {
      const { body } = await getJson(
        token,
        cursor ? `?limit=5&cursor=${encodeURIComponent(cursor)}` : "?limit=5",
      );
      const pagination = body.pagination as { hasMore: boolean; nextCursor: string | null };
      seen.push(...memberIds(body));
      pages += 1;
      if (!pagination.hasMore) {
        expect(pagination.nextCursor).toBeNull();
        break;
      }
      cursor = pagination.nextCursor;
      expect(pages).toBeLessThan(10);
    }
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
    expect(pages).toBe(3);
  });

  it("is deterministic across identical requests", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    await seed(id, [
      { type: "game.favorited", createdAt: at(21, 12, 0), name: "A" },
      { type: "game.favorited", createdAt: at(21, 12, 1), name: "B" },
    ]);
    const first = await getJson(token, "?limit=5");
    const second = await getJson(token, "?limit=5");
    expect(second.body).toEqual(first.body);
  });

  it("breaks createdAt ties by _id descending", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    await seed(id, [
      { type: "game.status_changed", createdAt: at(21, 12, 0), name: "First", metadata: { from: "backlog", to: "playing" } },
      { type: "game.status_changed", createdAt: at(21, 12, 0), name: "Second", metadata: { from: "backlog", to: "playing" } },
    ]);
    const { body } = await getJson(token, "?limit=5");
    const data = body.data as Array<{ title: string }>;
    // Later _id sorts first under DESC tiebreak.
    expect(data[0].title).toContain("Second");
    expect(data[1].title).toContain("First");
  });

  it("returns an empty page for users without activities", async () => {
    const { token } = await registerUser("A", "a@test.local");
    const { status, body } = await getJson(token, "");
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });
});

describe("grouping-aware boundaries", () => {
  it("never splits a group across pages (overfetch closes it)", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    await seed(id, [
      ...[0, 1, 2, 3].map((minute) => ({
        type: "game.favorited",
        createdAt: at(21, 12, minute),
        name: `Fav ${minute}`,
      })),
      { type: "game.status_changed", createdAt: at(21, 11, 0), name: "Older", metadata: { from: "backlog", to: "playing" } },
    ]);
    const first = await getJson(token, "?limit=1");
    const data = first.body.data as Array<{ count: number; title: string }>;
    expect(data).toHaveLength(1);
    expect(data[0].count).toBe(4);
    const pagination = first.body.pagination as { hasMore: boolean; nextCursor: string };
    expect(pagination.hasMore).toBe(true);

    const second = await getJson(token, `?limit=1&cursor=${encodeURIComponent(pagination.nextCursor)}`);
    const data2 = second.body.data as Array<{ title: string }>;
    expect(data2).toHaveLength(1);
    expect(data2[0].title).toContain("Older");
    expect(second.body.pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("merges a trailing singleton when the peek extends it", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    await seed(id, [
      { type: "game.favorited", createdAt: at(21, 12, 1), name: "New" },
      { type: "game.favorited", createdAt: at(21, 12, 0), name: "Old" },
    ]);
    const { body } = await getJson(token, "?limit=1");
    const data = body.data as Array<{ count: number }>;
    expect(data).toHaveLength(1);
    expect(data[0].count).toBe(2);
    expect(body.pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("closes a trailing singleton the peek cannot extend", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    await seed(id, [
      { type: "game.favorited", createdAt: at(21, 12, 1), name: "New" },
      { type: "game.status_changed", createdAt: at(21, 12, 0), name: "Old", metadata: { from: "backlog", to: "playing" } },
    ]);
    const first = await getJson(token, "?limit=1");
    expect((first.body.data as unknown[])).toHaveLength(1);
    expect(first.body.pagination).toMatchObject({ hasMore: true });
    const cursor = (first.body.pagination as { nextCursor: string }).nextCursor;
    const second = await getJson(token, `?limit=1&cursor=${encodeURIComponent(cursor)}`);
    expect((second.body.data as unknown[])).toHaveLength(1);
    expect(second.body.pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("returns giant groups whole", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    const base = Date.UTC(2026, 8, 21, 12, 0, 0);
    await seed(
      id,
      Array.from({ length: 60 }, (_, index) => ({
        type: "game.favorited",
        createdAt: new Date(base + index * 60_000).toISOString(),
        name: `Fav ${index}`,
      })),
    );
    const { body } = await getJson(token, "?limit=10");
    const data = body.data as Array<{ count: number }>;
    expect(data).toHaveLength(1);
    expect(data[0].count).toBe(60);
    expect(body.pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("respects interleaving, gaps, midnight and semantic keys", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    await seed(id, [
      { type: "game.favorited", createdAt: at(21, 12, 6), name: "C" },
      { type: "game.status_changed", createdAt: at(21, 12, 4), name: "B", metadata: { from: "backlog", to: "playing" } },
      { type: "game.favorited", createdAt: at(21, 12, 2), name: "B2" },
      { type: "game.favorited", createdAt: at(21, 12, 0), name: "A" },
      // Previous day in SP (2026-09-21T02:00Z == Sep 20 23:00 SP).
      { type: "game.favorited", createdAt: "2026-09-21T02:00:00.000Z", name: "Night" },
    ]);
    const { body } = await getJson(token, "?limit=10&timeZone=America%2FSao_Paulo");
    const data = body.data as Array<{ kind: string; count: number; title: string }>;
    // Newest-first: C single, status single, A+B2 group, Night single.
    expect(data.map((item) => `${item.kind}:${item.count}`)).toEqual([
      "single:1",
      "single:1",
      "group:2",
      "single:1",
    ]);
  });
});

describe("filters", () => {
  it("filters by type, gameId, from/to and combinations", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    const target = gameId();
    await seed(id, [
      { type: "game.favorited", createdAt: at(21, 12, 0), name: "A", userGameId: target },
      { type: "game.status_changed", createdAt: at(21, 12, 1), name: "B", metadata: { from: "backlog", to: "playing" } },
      { type: "game.favorited", createdAt: at(20, 12, 0), name: "C" },
    ]);
    const byType = await getJson(token, "?type=game.favorited&limit=50");
    expect((byType.body.data as unknown[])).toHaveLength(2);

    const byGame = await getJson(token, `?gameId=${target}&limit=50`);
    expect((byGame.body.data as unknown[])).toHaveLength(1);

    const byDate = await getJson(token, "?from=2026-09-21T00:00:00.000Z&limit=50");
    expect((byDate.body.data as unknown[])).toHaveLength(2);

    const combined = await getJson(
      token,
      `?type=game.favorited&from=2026-09-21T00:00:00.000Z&to=2026-09-21T23:59:59.000Z&limit=50`,
    );
    expect((combined.body.data as unknown[])).toHaveLength(1);
  });
});

describe("feed content", () => {
  it("renders Top10 history from snapshots, immune to catalog renames", async () => {
    const { id, token } = await registerUser("A", "a@test.local");
    const gid = gameId();
    await seed(id, [
      {
        type: "top10.reordered",
        createdAt: at(21, 12, 0),
        noGame: true,
        metadata: {
          count: 2,
          moves: [
            { userGameId: gid, from: 2, to: 1, game: { name: "Frozen Name" } },
          ],
        },
      },
    ]);
    const { body } = await getJson(token, "?limit=5");
    const data = body.data as Array<{
      title: string;
      expanded: Array<{ text: string }>;
      members: Array<{ game?: { name: string } }>;
    }>;
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Frozen Name é seu Top 1 favorito!");
    expect(data[0].expanded[0].text).toBe("Frozen Name #2 → #1");
    // Reordered events carry no top-level game snapshot.
    expect(data[0].members[0].game).toBeUndefined();
    // No userId leaks into the DTO.
    expect(data[0].members[0]).not.toHaveProperty("userId");
  });
});

describe("security", () => {
  it("isolates users and neutralizes foreign cursors", async () => {
    const a = await registerUser("A", "a@test.local");
    const b = await registerUser("B", "b@test.local");
    await seed(a.id, [
      { type: "game.favorited", createdAt: at(21, 12, 0), name: "Mine" },
    ]);
    await seed(b.id, [
      { type: "game.favorited", createdAt: at(21, 12, 1), name: "Theirs" },
      { type: "game.status_changed", createdAt: at(21, 12, 2), name: "Theirs2", metadata: { from: "backlog", to: "playing" } },
    ]);

    const seen = await getJson(a.token, "?limit=50");
    const titles = (seen.body.data as Array<{ title: string }>).map((item) => item.title);
    expect(titles.some((title) => title.includes("Theirs"))).toBe(false);

    // B's cursor used by A: only A's own events after that position.
    const bFeed = await getJson(b.token, "?limit=1");
    const bCursor = (bFeed.body.pagination as { nextCursor: string }).nextCursor;
    const forged = await getJson(a.token, `?limit=50&cursor=${encodeURIComponent(bCursor)}`);
    const forgedTitles = (forged.body.data as Array<{ title: string }>).map((item) => item.title);
    expect(forgedTitles.some((title) => title.includes("Theirs"))).toBe(false);
  });

  it("rejects malformed cursors and requires authentication", async () => {
    const { token } = await registerUser("A", "a@test.local");
    const bad = await getJson(token, "?cursor=not-a-cursor!!!");
    expect(bad.status).toBe(400);
    expect((bad.body.error as { code: string }).code).toBe("VALIDATION_ERROR");

    const unauth = await getJson(null, "");
    expect(unauth.status).toBe(401);
  });
});

describe("contract", () => {
  it("validates limit boundaries and envelope", async () => {
    const { token } = await registerUser("A", "a@test.local");
    expect((await getJson(token, "?limit=0")).status).toBe(400);
    expect((await getJson(token, "?limit=51")).status).toBe(400);
    expect((await getJson(token, "?limit=1")).status).toBe(200);
    expect((await getJson(token, "?limit=50")).status).toBe(200);

    const badTz = await getJson(token, "?timeZone=Moon%2FOlympus");
    expect(badTz.status).toBe(400);

    const { body } = await getJson(token, "?limit=1");
    expect(Object.keys(body).sort()).toEqual(["data", "pagination"]);
    expect(Object.keys(body.pagination as object).sort()).toEqual([
      "hasMore",
      "limit",
      "nextCursor",
    ]);
  });
});
