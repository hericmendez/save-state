import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import { POST as createList } from "@/app/api/game-collections/route";
import { GlobalGame } from "@/db/models/global-game";
import { GameCollection } from "@/db/models/game-collection";
import { User } from "@/db/models/user";
import { EmailVerificationToken } from "@/db/models/email-verification-token";
import { UserGame } from "@/db/models/user-game";
import { __resetConnectionCache, connectDatabase } from "@/db/connection";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { NextRequest } from "next/server";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const response = await login(postRequest("/api/auth/login", {
    email: TEST_USER.email,
    password: TEST_USER.password,
  }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

function authedPost(path: string, token: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `token=${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("concurrent creation races", () => {
  it("concurrent manual-game creation yields one GlobalGame and one 400 duplicate", async () => {
    const token = await tokenFor();
    const payload = { game: { name: "Race Game" }, status: "backlog" };

    const [first, second] = await Promise.all([
      createGame(authedPost("/api/games", token, payload)),
      createGame(authedPost("/api/games", token, payload)),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 400]);

    const failed = first.status === 400 ? first : second;
    expect((await failed.json()).error.code).toBe("GAME_ALREADY_IN_LIBRARY");
    expect(await GlobalGame.countDocuments({ name: "Race Game" })).toBe(1);
    expect(await UserGame.countDocuments()).toBe(1);
  });

  it("concurrent list creation yields one list and one 400 duplicate", async () => {
    const token = await tokenFor();
    const payload = { name: "Race List" };

    const [first, second] = await Promise.all([
      createList(authedPost("/api/game-collections", token, payload)),
      createList(authedPost("/api/game-collections", token, payload)),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 400]);

    const failed = first.status === 400 ? first : second;
    expect((await failed.json()).error.code).toBe("LIST_ALREADY_EXISTS");
    expect(await GameCollection.countDocuments({ name: "Race List" })).toBe(1);
  });

  it("recovers the unique UserGame index after an admin drop", async () => {
    const token = await tokenFor();
    const payload = { game: { name: "Recovery Game" }, status: "backlog" };

    // Simulate an index outage: drop the enforcement, then reconnect.
    // connectDatabase re-ensures indexes before serving the next write.
    await UserGame.collection.dropIndex("userId_1_gameId_1");
    __resetConnectionCache();

    const [first, second] = await Promise.all([
      createGame(authedPost("/api/games", token, payload)),
      createGame(authedPost("/api/games", token, payload)),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);
    expect(await UserGame.countDocuments({})).toBe(1);
    expect(await GlobalGame.countDocuments({ name: "Recovery Game" })).toBe(1);
  });

  it("refuses a unique index over duplicate data without deleting anything", async () => {
    const user = await User.create({
      name: "Dupe User",
      email: "dupe@test.com",
      passwordHash: "x".repeat(60),
    });
    const game = await GlobalGame.create({
      slug: `dupe-game-${Date.now()}`,
      name: "Dupe Game",
      source: "manual",
    });
    const key = { userId: user._id, gameId: game._id };

    await UserGame.collection.dropIndex("userId_1_gameId_1");
    await UserGame.create([
      { userId: key.userId, gameId: key.gameId, status: "backlog" },
      { userId: key.userId, gameId: key.gameId, status: "playing" },
    ]);
    expect(await UserGame.countDocuments({ userId: key.userId })).toBe(2);

    // The unique build must fail loudly instead of silently dropping data.
    await expect(UserGame.ensureIndexes()).rejects.toThrow(/duplicate/i);
    expect(await UserGame.countDocuments({ userId: key.userId })).toBe(2);

    // Cleanup restores the invariant for a clean slate (test DB only).
    await UserGame.deleteMany({ userId: key.userId });
    await UserGame.ensureIndexes();
    const indexes = await UserGame.collection.listIndexes().toArray();
    expect(indexes.some((ix) => JSON.stringify(ix.key) === JSON.stringify({ userId: 1, gameId: 1 }))).toBe(true);
  });

  it("concurrent registration yields one user and a uniform public response", async () => {
    const payload = {
      name: "Race User",
      email: "race-user@test.com",
      password: "password-123",
    };
    const [first, second] = await Promise.all([
      register(postRequest("/api/auth/register", payload)),
      register(postRequest("/api/auth/register", payload)),
    ]);
    const bodies = await Promise.all([first.json(), second.json()]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(await User.countDocuments({ email: payload.email })).toBe(1);
    const user = await User.findOne({ email: payload.email }).lean();
    const tokens = await EmailVerificationToken.find({}).lean();
    expect(tokens).toHaveLength(1);
    expect(String(tokens[0].userId)).toBe(String(user?._id));
  });

  it("accepts production traffic once declared indexes exist", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: "production" });
    __resetConnectionCache();
    try {
      await expect(connectDatabase()).resolves.toBeDefined();
    } finally {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
      __resetConnectionCache();
      await connectDatabase();
    }
  });

  it("refuses production traffic when an enforced index is missing", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    mongoose.set("autoIndex", false);
    Object.assign(process.env, { NODE_ENV: "production" });
    __resetConnectionCache();
    await UserGame.collection.dropIndex("userId_1_gameId_1");
    try {
      await expect(connectDatabase()).rejects.toThrow(/missing enforced index/);
      // Nothing was written by the refused connection.
      expect(await UserGame.countDocuments({})).toBe(0);
    } finally {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
      mongoose.set("autoIndex", true);
      __resetConnectionCache();
      // Recovery: the next connection rebuilds the missing enforcement.
      await connectDatabase();
      const indexes = await UserGame.collection.listIndexes().toArray();
      expect(indexes.some((ix) => JSON.stringify(ix.key) === JSON.stringify({ userId: 1, gameId: 1 }))).toBe(true);
    }
  });

  it("refuses production traffic when an enforced index is incompatible", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    mongoose.set("autoIndex", false);
    Object.assign(process.env, { NODE_ENV: "production" });
    __resetConnectionCache();
    await UserGame.collection.dropIndex("userId_1_gameId_1");
    await UserGame.collection.createIndex({ userId: 1, gameId: 1 }, { name: "plain_pair_probe" });
    try {
      await expect(connectDatabase()).rejects.toThrow(/incompatible enforced index/);
    } finally {
      await UserGame.collection.dropIndex("plain_pair_probe").catch(() => undefined);
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
      mongoose.set("autoIndex", true);
      __resetConnectionCache();
      await connectDatabase();
    }
  });
});
