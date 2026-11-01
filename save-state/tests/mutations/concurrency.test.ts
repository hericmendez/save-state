import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import { POST as createList } from "@/app/api/game-collections/route";
import { GlobalGame } from "@/db/models/global-game";
import { GameCollection } from "@/db/models/game-collection";
import { UserGame } from "@/db/models/user-game";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { NextRequest } from "next/server";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
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
});
