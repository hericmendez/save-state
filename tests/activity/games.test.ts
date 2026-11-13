import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import {
  DELETE as deleteGame,
  PATCH as patchGame,
} from "@/app/api/games/[gameId]/route";
import { POST as finishGame } from "@/app/api/games/[gameId]/finish/route";
import { POST as addTop10 } from "@/app/api/top10/[userGameId]/route";
import { Activity } from "@/db/models/activity";
import { GlobalGame } from "@/db/models/global-game";
import { User } from "@/db/models/user";
import { UserGame } from "@/db/models/user-game";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

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

function authed(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      cookie: `token=${token}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function createUserGame(
  token: string,
  body: unknown,
): Promise<{ id: string; raw: Record<string, unknown> }> {
  const response = await createGame(
    authed("/api/games", token, { method: "POST", body }),
  );
  expect(response.status).toBe(201);
  const data = (await response.json()).data as Record<string, unknown>;
  return { id: data._id as string, raw: data };
}

async function patchUserGame(
  token: string,
  id: string,
  body: unknown,
): Promise<Awaited<ReturnType<typeof patchGame>>> {
  return patchGame(authed(`/api/games/${id}`, token, { method: "PATCH", body }), {
    params: Promise.resolve({ gameId: id }),
  });
}

async function activityTypes(): Promise<string[]> {
  const docs = await Activity.find({}).sort({ _id: 1 }).lean();
  return docs.map((doc) => doc.type);
}

const MANUAL_GAME = (name: string) => ({ game: { name } });

describe("createGame → game.added", () => {
  it("records manual creation with source snapshot", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(token, MANUAL_GAME("Hollow Knight"));

    const docs = await Activity.find({}).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].type).toBe("game.added");
    expect(String(docs[0].userGameId)).toBe(id);
    expect(docs[0].game).toMatchObject({ name: "Hollow Knight" });
    expect(docs[0].metadata).toMatchObject({ source: "manual" });
  });

  it("records catalog-based creation with source atp", async () => {
    const token = await tokenFor();
    const global = await GlobalGame.create({
      slug: `chrono-trigger-${Date.now()}`,
      name: "Chrono Trigger",
      source: "atp",
      atpDomainId: "atp-chrono",
    });
    await createUserGame(token, { gameId: String(global._id) });

    const docs = await Activity.find({}).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata).toMatchObject({ source: "atp" });
    expect(docs[0].game).toMatchObject({ name: "Chrono Trigger" });
  });
});

describe("incrementTimesFinished → game.finished (single event)", () => {
  it("records each finish with the new counter and nothing else", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(token, MANUAL_GAME("RE4"));
    // Creation event only.
    expect(await activityTypes()).toEqual(["game.added"]);

    const first = await finishGame(authed(`/api/games/${id}/finish`, token, {
      method: "POST",
    }), { params: Promise.resolve({ gameId: id }) });
    expect(first.status).toBe(200);
    const second = await finishGame(authed(`/api/games/${id}/finish`, token, {
      method: "POST",
    }), { params: Promise.resolve({ gameId: id }) });
    expect(second.status).toBe(200);

    expect(await activityTypes()).toEqual([
      "game.added",
      "game.finished",
      "game.finished",
    ]);
    const finished = await Activity.find({ type: "game.finished" })
      .sort({ _id: 1 })
      .lean();
    expect(finished[0].metadata).toMatchObject({ timesFinished: 1 });
    expect(finished[1].metadata).toMatchObject({ timesFinished: 2 });
  });
});

describe("updateGame diff", () => {
  it("records one event per supported field", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(token, MANUAL_GAME("Zelda"));

    const cases: Array<{ body: unknown; type: string; metadata: Record<string, unknown> }> = [
      {
        body: { status: "playing" },
        type: "game.status_changed",
        metadata: { from: "backlog", to: "playing" },
      },
      {
        body: { favorite: true },
        type: "game.favorited",
        metadata: {},
      },
      {
        body: { fullyCompleted: true },
        type: "game.completed",
        metadata: {},
      },
      {
        body: { rating: 9 },
        type: "game.rating_changed",
        metadata: { from: null, to: 9 },
      },
      {
        body: { hoursPlayed: 30 },
        type: "game.hours_changed",
        metadata: { from: 0, to: 30 },
      },
      {
        body: { achievements: true, achievementProgress: 50 },
        type: "game.achievements_changed",
        metadata: {
          from: { enabled: false, progress: null },
          to: { enabled: true, progress: 50 },
        },
      },
    ];
    for (const { body } of cases) {
      expect((await patchUserGame(token, id, body)).status).toBe(200);
    }
    expect(await activityTypes()).toEqual([
      "game.added",
      ...cases.map(({ type }) => type),
    ]);
    const rated = await Activity.findOne({ type: "game.rating_changed" }).lean();
    expect(rated?.metadata).toMatchObject(cases[3].metadata);
  });

  it("emits no activity on same-value rewrites, review-only or metadata-only updates", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(
      token,
      { ...MANUAL_GAME("Legaia"), status: "playing", favorite: true },
    );
    expect(await Activity.countDocuments()).toBe(1);

    for (const body of [
      { status: "playing" },
      { favorite: true },
      { review: { content: "Great game" } },
      { game: { name: "Legend of Legaia Remaster" } },
    ]) {
      expect((await patchUserGame(token, id, body)).status).toBe(200);
    }
    expect(await Activity.countDocuments()).toBe(1);
  });

  it("direct counter edit 0 → positive emits only game.finished", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(token, MANUAL_GAME("Legaia"));
    expect((await patchUserGame(token, id, { timesFinished: 3 })).status).toBe(200);
    expect(await activityTypes()).toEqual(["game.added", "game.finished"]);
    const finished = await Activity.findOne({ type: "game.finished" }).lean();
    expect(finished?.metadata).toMatchObject({ timesFinished: 3 });
  });

  it("direct counter edits without finish flip emit only times_finished_changed", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(
      token,
      { ...MANUAL_GAME("Legaia"), timesFinished: 3 },
    );
    expect((await patchUserGame(token, id, { timesFinished: 5 })).status).toBe(200);
    expect((await patchUserGame(token, id, { timesFinished: 0 })).status).toBe(200);
    const types = await activityTypes();
    expect(types.filter((type) => type === "game.finished")).toHaveLength(0);
    const changed = await Activity.find({ type: "game.times_finished_changed" })
      .sort({ _id: 1 })
      .lean();
    expect(changed.map((doc) => doc.metadata)).toEqual([
      { from: 3, to: 5 },
      { from: 5, to: 0 },
    ]);
  });

  it("rating removal emits rating_changed with to: null", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(
      token,
      { ...MANUAL_GAME("Rated"), rating: 7 },
    );
    expect((await patchUserGame(token, id, { rating: null })).status).toBe(200);
    const rated = await Activity.findOne({ type: "game.rating_changed" }).lean();
    expect(rated?.metadata).toMatchObject({ from: 7, to: null });
  });

  it("multiple changes in one mutation respect the deterministic order", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(token, MANUAL_GAME("Multi"));
    const response = await patchUserGame(token, id, {
      status: "finished",
      timesFinished: 2,
      favorite: true,
      fullyCompleted: true,
      rating: 9,
      hoursPlayed: 40,
      achievements: true,
      achievementProgress: 100,
    });
    expect(response.status).toBe(200);
    expect(await activityTypes()).toEqual([
      "game.added",
      "game.status_changed",
      "game.finished",
      "game.favorited",
      "game.completed",
      "game.rating_changed",
      "game.hours_changed",
      "game.achievements_changed",
    ]);
  });

  it("unfavorite records game.unfavorited plus one top10.removed via the Top 10 mutation", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(
      token,
      { ...MANUAL_GAME("Ranked"), favorite: true },
    );
    const added = await addTop10(
      authed(`/api/top10/${id}`, token, { method: "POST" }),
      { params: Promise.resolve({ userGameId: id }) },
    );
    expect(added.status).toBe(201);

    expect((await patchUserGame(token, id, { favorite: false })).status).toBe(200);
    // Phase B owns `game.unfavorited`; Phase D owns the single
    // `top10.removed` with reason "unfavorited" (no duplication).
    // Note: `top10.removed` is recorded before `game.unfavorited` because
    // the pull runs mid-mutation while game events emit at its end.
    expect(await activityTypes()).toEqual([
      "game.added",
      "top10.added",
      "top10.removed",
      "game.unfavorited",
    ]);
    const top10Events = await Activity.find({ type: /^top10\./ })
      .sort({ _id: 1 })
      .lean();
    expect(top10Events.map((doc) => doc.type)).toEqual([
      "top10.added",
      "top10.removed",
    ]);
    const removed = top10Events[1];
    expect(removed.metadata).toMatchObject({
      position: 1,
      reason: "unfavorited",
    });
    const user = await User.findOne({}).lean();
    expect(user?.top10 ?? []).toHaveLength(0);
  });
});

describe("deleteGame → game.removed", () => {
  it("keeps the game snapshot after the UserGame is gone", async () => {
    const token = await tokenFor();
    const { id } = await createUserGame(token, MANUAL_GAME("Doomed"));

    const response = await deleteGame(
      authed(`/api/games/${id}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(response.status).toBe(204);
    expect(await UserGame.findById(id)).toBeNull();

    const docs = await Activity.find({}).sort({ _id: 1 }).lean();
    expect(docs.map((doc) => doc.type)).toEqual(["game.added", "game.removed"]);
    expect(docs[1].game).toMatchObject({ name: "Doomed" });
    expect(String(docs[1].userGameId)).toBe(id);
  });
});

describe("consistency: best effort without touching the mutation", () => {
  it("a persistence failure does not fail the mutation", async () => {
    const token = await tokenFor();
    const createSpy = vi
      .spyOn(Activity, "create")
      .mockRejectedValueOnce(new Error("db down"));
    try {
      const response = await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: MANUAL_GAME("Resilient"),
        }),
      );
      expect(response.status).toBe(201);
      expect(await UserGame.countDocuments()).toBe(1);
      expect(await Activity.countDocuments()).toBe(0);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("creates no activity when the primary mutation fails", async () => {
    const token = await tokenFor();
    const payload = { method: "POST", body: MANUAL_GAME("Dup") } as const;
    expect(
      (await createGame(authed("/api/games", token, payload))).status,
    ).toBe(201);
    const duplicate = await createGame(authed("/api/games", token, payload));
    expect(duplicate.status).toBe(400);

    const missing = await patchUserGame(token, "000000000000000000000000", {
      rating: 1,
    });
    expect(missing.status).toBe(404);

    // Only the single successful creation was recorded.
    expect(await activityTypes()).toEqual(["game.added"]);
  });
});
