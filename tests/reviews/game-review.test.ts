import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { GameReview } from "@/db/models/game-review";
import { UserGame } from "@/db/models/user-game";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
  TEST_USER,
} from "../auth/helpers";
import { POST as register } from "@/app/api/auth/register/route";
import { postRequest } from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function userId(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  const { User } = await import("@/db/models/user");
  const user = await User.findOne({ email: TEST_USER.email }).lean();
  return String((user as { _id: unknown })._id);
}

describe("GameReview model", () => {
  it("creates a review with unique userGameId", async () => {
    const uid = await userId();
    const ug = await UserGame.create({
      userId: new Types.ObjectId(uid),
      gameId: new Types.ObjectId(),
      status: "playing",
    });
    await GameReview.create({
      userGameId: ug._id,
      userId: ug.userId,
      content: "# Great",
    });
    await expect(
      GameReview.create({
        userGameId: ug._id,
        userId: ug.userId,
        content: "dup",
      }),
    ).rejects.toThrow();
    expect(await GameReview.countDocuments()).toBe(1);
  });

  it("rejects empty content and content over 20000 chars", async () => {
    const uid = await userId();
    const ug = await UserGame.create({
      userId: new Types.ObjectId(uid),
      gameId: new Types.ObjectId(),
      status: "backlog",
    });
    await expect(
      GameReview.create({ userGameId: ug._id, userId: ug.userId, content: "   " }),
    ).rejects.toThrow();
    await expect(
      GameReview.create({
        userGameId: new Types.ObjectId(),
        userId: new Types.ObjectId(uid),
        content: "x".repeat(20001),
      }),
    ).rejects.toThrow();
  });
});
