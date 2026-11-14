import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import { POST as finishGame } from "@/app/api/games/[gameId]/finish/route";
import { PATCH as patchGame } from "@/app/api/games/[gameId]/route";
import { GET as searchGames } from "@/app/api/games/route";
import { UserGame } from "@/db/models/user-game";
import {
  TEST_USER,
  clearDatabase,
  markTestUserVerified,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./auth/helpers";
import { NextRequest } from "next/server";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const res = await login(postRequest("/api/auth/login", { email: TEST_USER.email, password: TEST_USER.password }));
  const t = res.cookies.get("token")?.value;
  if (!t) throw new Error("no token");
  return t;
}
function authed(path: string, token: string, init?: { method?: string; body?: unknown }): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json", cookie: `token=${token}` },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("finished / timesFinished invariant", () => {
  it("timesFinished 0 -> finished false", async () => {
    const token = await tokenFor();
    const res = await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "A" }, timesFinished: 0 } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.finished).toBe(false);
    expect(body.data.timesFinished).toBe(0);
  });
  it("timesFinished >0 -> finished true", async () => {
    const token = await tokenFor();
    const res = await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "B" }, timesFinished: 3 } }));
    const body = await res.json();
    expect(body.data.finished).toBe(true);
    expect(body.data.timesFinished).toBe(3);
  });
  it("initial timesFinished can be set via create", async () => {
    const token = await tokenFor();
    const res = await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "C" }, timesFinished: 10 } }));
    expect((await res.json()).data.timesFinished).toBe(10);
  });
  it("fullyCompleted independent of finished", async () => {
    const token = await tokenFor();
    const res = await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "FIFA" }, timesFinished: 0, fullyCompleted: true } }));
    const body = await res.json();
    expect(body.data.finished).toBe(false);
    expect(body.data.fullyCompleted).toBe(true);
  });
});

describe("Zerei +1", () => {
  it("increments exactly once", async () => {
    const token = await tokenFor();
    const created = await (await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "Z1" }, timesFinished: 10 } }))).json();
    const id = created.data._id;
    const res = await finishGame(authed(`/api/games/${id}/finish`, token, { method: "POST" }), { params: Promise.resolve({ gameId: id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.timesFinished).toBe(11);
    expect(body.data.finished).toBe(true);
  });
  it("repeated increments", async () => {
    const token = await tokenFor();
    const created = await (await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "Z2" } } }))).json();
    const id = created.data._id;
    for (let i = 1; i <= 3; i++) {
      const r = await finishGame(authed(`/api/games/${id}/finish`, token, { method: "POST" }), { params: Promise.resolve({ gameId: id }) });
      expect((await r.json()).data.timesFinished).toBe(i);
    }
  });
  it("unauthorized cannot increment another user's game", async () => {
    const token = await tokenFor();
    const created = await (await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "Z3" } } }))).json();
    const id = created.data._id;
    await register(postRequest("/api/auth/register", { name: "Other", email: "other@test.com", password: "password123" }));
    await markTestUserVerified("other@test.com");
    const otherLogin = await login(postRequest("/api/auth/login", { email: "other@test.com", password: "password123" }));
    const otherToken = otherLogin.cookies.get("token")!.value;
    const res = await finishGame(authed(`/api/games/${id}/finish`, otherToken, { method: "POST" }), { params: Promise.resolve({ gameId: id }) });
    expect(res.status).toBe(404);
  });
  it("concurrent increments are atomic", async () => {
    const token = await tokenFor();
    const created = await (await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "ZConc" } } }))).json();
    const id = created.data._id;
    const results = await Promise.all([
      finishGame(authed(`/api/games/${id}/finish`, token, { method: "POST" }), { params: Promise.resolve({ gameId: id }) }),
      finishGame(authed(`/api/games/${id}/finish`, token, { method: "POST" }), { params: Promise.resolve({ gameId: id }) }),
      finishGame(authed(`/api/games/${id}/finish`, token, { method: "POST" }), { params: Promise.resolve({ gameId: id }) }),
    ]);
    // All should succeed, final count should be 3
    const final = await UserGame.findById(id).lean();
    expect(final?.timesFinished).toBe(3);
    expect(final?.finished).toBe(true);
  });
});

describe("achievements", () => {
  it("game without achievements distinct from 0%", async () => {
    const token = await tokenFor();
    const res = await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "NoAch" }, achievements: false } }));
    const body = await res.json();
    expect(body.data.achievements).toBe(false);
    expect(body.data.achievementProgress).toBeUndefined();
    expect(body.data.achievementsCompleted).toBe(false);
  });
  it("100% implies completed", async () => {
    const token = await tokenFor();
    const res = await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "Plat" }, achievements: true, achievementProgress: 100 } }));
    const body = await res.json();
    expect(body.data.achievementsCompleted).toBe(true);
  });
  it("completed requires 100", async () => {
    const token = await tokenFor();
    const res = await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "Ach84" }, achievements: true, achievementProgress: 84 } }));
    const body = await res.json();
    expect(body.data.achievementsCompleted).toBe(false);
    expect(body.data.achievementProgress).toBe(84);
  });
  it("achievements false with progress is rejected", async () => {
    const token = await tokenFor();
    const res = await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "Bad" }, achievements: false, achievementProgress: 50 } }));
    expect(res.status).toBe(400);
  });
});

describe("favorites", () => {
  it("favorite filter only returns owned", async () => {
    const token = await tokenFor();
    await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "Fav1" }, favorite: true } }));
    await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "NotFav" }, favorite: false } }));
    const favRes = await searchGames(authed("/api/games?favorite=true", token));
    const body = await favRes.json();
    expect(body.data.every((g: { favorite: boolean }) => g.favorite === true)).toBe(true);
    expect(body.pagination.total).toBe(1);
  });
});

describe("exports", () => {
  it("JSON export contains only own data and no secrets", async () => {
    const token = await tokenFor();
    await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "ExpGame" } } }));
    const { GET: exportJson } = await import("@/app/api/auth/export/route");
    const res = await exportJson(authed("/api/auth/export", token));
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text());
    expect(body.user.email).toBe(TEST_USER.email);
    expect(body.games.length).toBe(1);
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain("JWT_SECRET");
  });
  it("CSV export is owned and requires auth", async () => {
    const { GET: exportCsv } = await import("@/app/api/auth/export/csv/route");
    const unauth = await exportCsv(new NextRequest("http://localhost/api/auth/export/csv"));
    expect(unauth.status).toBe(401);
    const token = await tokenFor();
    await createGame(authed("/api/games", token, { method: "POST", body: { game: { name: "CsvGame" } } }));
    const res = await exportCsv(authed("/api/auth/export/csv", token));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("CsvGame");
    expect(text).toContain(TEST_USER.email);
  });
});
