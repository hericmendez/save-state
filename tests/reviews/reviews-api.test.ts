import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import {
  GET as getGame,
  PATCH as patchGame,
  DELETE as deleteGame,
} from "@/app/api/games/[gameId]/route";
import { POST as createNote } from "@/app/api/games/[gameId]/notes/route";
import { GET as getReview } from "@/app/api/games/[gameId]/review/route";
import { GameReview } from "@/db/models/game-review";
import { UserGame } from "@/db/models/user-game";
import { UserGameNote } from "@/db/models/user-game-note";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

const OTHER_USER = {
  name: "Other User",
  email: "other@test.com",
  password: "password-123",
};

async function tokenFor(
  user: { name: string; email: string; password: string } = { ...TEST_USER },
): Promise<string> {
  await register(postRequest("/api/auth/register", user));
  const response = await login(
    postRequest("/api/auth/login", {
      email: user.email,
      password: user.password,
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
  return authedRequest(path, token, init);
}

const MANUAL_GAME = {
  game: { name: "Review Game" },
  status: "playing",
};

describe("reviews API (definitive: GameReview is the single source)", () => {
  it("creates a game with rich review object and derives excerpt", async () => {
    const token = await tokenFor();
    const response = await createGame(
      authed("/api/games", token, {
        method: "POST",
        body: { ...MANUAL_GAME, review: { content: "# Great\n\nLoved it." } },
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    // No legacy mirror in responses: excerpt only, full text via /review.
    expect(body.data.review).toBeUndefined();
    expect(typeof body.data.reviewExcerpt).toBe("string");
    expect(body.data.reviewExcerpt).toContain("Great");
    const id = body.data._id as string;
    const stored = await GameReview.findOne({ userGameId: id }).lean();
    expect(stored?.content).toBe("# Great\n\nLoved it.");
  });

  it("rejects plain-string review with 400 (legacy contract removed)", async () => {
    const token = await tokenFor();
    const response = await createGame(
      authed("/api/games", token, {
        method: "POST",
        body: { ...MANUAL_GAME, review: "Legacy text" },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(await UserGame.countDocuments()).toBe(0);
    expect(await GameReview.countDocuments()).toBe(0);
  });

  it("rolls back the whole creation when review sync fails (C1)", async () => {
    const token = await tokenFor();
    const spy = vi
      .spyOn(GameReview, "updateOne")
      .mockRejectedValueOnce(new Error("review sync boom"));
    try {
      const response = await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { ...MANUAL_GAME, review: { content: "# Doomed" } },
        }),
      );
      expect(response.status).toBe(500);
      expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    } finally {
      spy.mockRestore();
    }
    // No half-created library entry may survive.
    expect(await UserGame.countDocuments()).toBe(0);
    expect(await GameReview.countDocuments()).toBe(0);
  });

  it("preserves GAME_ALREADY_IN_LIBRARY for duplicate creates with review", async () => {
    const token = await tokenFor();
    const payload = {
      method: "POST",
      body: { ...MANUAL_GAME, review: { content: "# First" } },
    } as const;
    expect(
      (await createGame(authed("/api/games", token, payload))).status,
    ).toBe(201);
    const duplicate = await createGame(authed("/api/games", token, payload));
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error.code).toBe(
      "GAME_ALREADY_IN_LIBRARY",
    );
    expect(await UserGame.countDocuments()).toBe(1);
    expect(await GameReview.countDocuments()).toBe(1);
  });

  it("leaves review untouched when absent, clears on null", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { ...MANUAL_GAME, review: { content: "# Keep me" } },
        }),
      )
    ).json();
    const id = created.data._id as string;

    const patched = await patchGame(
      authed(`/api/games/${id}`, token, {
        method: "PATCH",
        body: { status: "finished" },
      }),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json();
    expect(patchedBody.data.review).toBeUndefined();
    expect(patchedBody.data.reviewExcerpt).toContain("Keep me");
    expect(
      await GameReview.countDocuments({ userGameId: id }),
    ).toBe(1);

    const cleared = await patchGame(
      authed(`/api/games/${id}`, token, {
        method: "PATCH",
        body: { review: null },
      }),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(cleared.status).toBe(200);
    const clearedBody = await cleared.json();
    expect(clearedBody.data.review).toBeUndefined();
    expect(clearedBody.data.reviewExcerpt ?? null).toBeNull();
    expect(await GameReview.countDocuments({ userGameId: id })).toBe(0);
  });

  it("rolls back review updates on sync failure, keeping the old body", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { ...MANUAL_GAME, review: { content: "# Original" } },
        }),
      )
    ).json();
    const id = created.data._id as string;

    const spy = vi
      .spyOn(GameReview, "updateOne")
      .mockRejectedValueOnce(new Error("sync boom"));
    try {
      const failed = await patchGame(
        authed(`/api/games/${id}`, token, {
          method: "PATCH",
          body: { review: { content: "# Replaced" } },
        }),
        { params: Promise.resolve({ gameId: id }) },
      );
      expect(failed.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const kept = await GameReview.findOne({ userGameId: id }).lean();
    expect(kept?.content).toBe("# Original");
    const game = await UserGame.findById(id).lean();
    expect(game?.reviewExcerpt).toContain("Original");
    expect("review" in (game ?? {})).toBe(false);
  });

  it("serves full content on demand and 404s when missing", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { ...MANUAL_GAME, review: { content: "# Full" } },
        }),
      )
    ).json();
    const id = created.data._id as string;

    const okRes = await getReview(authed(`/api/games/${id}/review`, token), {
      params: Promise.resolve({ gameId: id }),
    });
    expect(okRes.status).toBe(200);
    expect((await okRes.json()).data.content).toBe("# Full");

    const plain = await (
      await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { game: { name: "No Review Game" } },
        }),
      )
    ).json();
    const missing = await getReview(
      authed(`/api/games/${plain.data._id}/review`, token),
      { params: Promise.resolve({ gameId: plain.data._id }) },
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("REVIEW_NOT_FOUND");
  });

  it("rejects unauthenticated and foreign review reads", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { ...MANUAL_GAME, review: { content: "# Mine" } },
        }),
      )
    ).json();
    const id = created.data._id as string;

    const anon = await getReview(
      new NextRequest(`http://localhost/api/games/${id}/review`),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(anon.status).toBe(401);

    const otherToken = await tokenFor(OTHER_USER);
    const foreign = await getReview(
      authed(`/api/games/${id}/review`, otherToken),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(foreign.status).toBe(404);
  });

  it("does not embed full content in list/get responses", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { ...MANUAL_GAME, review: { content: "# Full body here" } },
        }),
      )
    ).json();
    const fetched = await getGame(authed(`/api/games/${created.data._id}`, token), {
      params: Promise.resolve({ gameId: created.data._id }),
    });
    const data = (await fetched.json()).data;
    expect(data.reviewExcerpt).toBeDefined();
    // Full markdown travels only via /review on demand; no legacy mirror.
    expect(data.review).toBeUndefined();
    expect(data.game).toBeDefined();
  });

  it("cascades GameReview deletion with the UserGame (C4)", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { ...MANUAL_GAME, review: { content: "# Gone" } },
        }),
      )
    ).json();
    const id = created.data._id as string;
    const noted = await createNote(
      authed(`/api/games/${id}/notes`, token, {
        method: "POST",
        body: { content: "a note" },
      }),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(noted.status).toBe(201);

    const del = await deleteGame(authed(`/api/games/${id}`, token, { method: "DELETE" }), {
      params: Promise.resolve({ gameId: id }),
    });
    expect(del.status).toBe(204);
    expect(await GameReview.countDocuments({ userGameId: id })).toBe(0);
    expect(await UserGameNote.countDocuments({ userGameId: id })).toBe(0);
    expect(await UserGame.countDocuments({ _id: id })).toBe(0);
  });

  it("rolls back delete cascade on failure: no orphans, game intact (C4)", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(
        authed("/api/games", token, {
          method: "POST",
          body: { ...MANUAL_GAME, review: { content: "# Keep" } },
        }),
      )
    ).json();
    const id = created.data._id as string;

    const spy = vi
      .spyOn(GameReview, "deleteMany")
      .mockRejectedValueOnce(new Error("cascade boom"));
    try {
      const failed = await deleteGame(
        authed(`/api/games/${id}`, token, { method: "DELETE" }),
        { params: Promise.resolve({ gameId: id }) },
      );
      expect(failed.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(await UserGame.countDocuments({ _id: id })).toBe(1);
    expect(await GameReview.countDocuments({ userGameId: id })).toBe(1);
  });
});
