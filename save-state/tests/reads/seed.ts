/**
 * Read-suite fixtures. Seeds two users with distinct libraries through the
 * real Mongoose models (no service shortcuts), so ownership and isolation
 * assertions are meaningful.
 */

import bcrypt from "bcryptjs";
import { GlobalGame } from "@/db/models/global-game";
import { GameCollection } from "@/db/models/game-collection";
import { User } from "@/db/models/user";
import { UserGame } from "@/db/models/user-game";

export interface SeedResult {
  userAId: string;
  userBId: string;
  zeldaId: string;
  marioId: string;
  tetrisId: string;
  userGameZeldaA: string;
  userGameMarioA: string;
  userGameTetrisB: string;
  collectionFavoritesA: string;
}

export async function seedReadFixtures(): Promise<SeedResult> {
  const passwordHash = await bcrypt.hash("password-123", 10);
  const [userA, userB] = await Promise.all([
    User.create({ name: "Reader A", email: "reader-a@test.com", passwordHash }),
    User.create({ name: "Reader B", email: "reader-b@test.com", passwordHash }),
  ]);

  const [zelda, mario, tetris] = await Promise.all([
    GlobalGame.create({
      slug: "zelda-oot",
      name: "Zelda: Ocarina of Time",
      source: "manual",
      genres: ["RPG", "Adventure"],
      platforms: ["N64"],
      developers: ["Nintendo"],
      publishers: ["Nintendo"],
      releaseDate: new Date("1998-11-21T00:00:00Z"),
    }),
    GlobalGame.create({
      slug: "mario-64",
      name: "Super Mario 64",
      source: "manual",
      genres: ["Platformer"],
      platforms: ["N64"],
      developers: ["Nintendo"],
      publishers: ["Nintendo"],
      releaseDate: new Date("1996-06-23T00:00:00Z"),
    }),
    GlobalGame.create({
      slug: "tetris-classic",
      name: "Tetris",
      source: "manual",
      genres: ["Puzzle"],
      platforms: ["Game Boy"],
      developers: ["Nintendo"],
      publishers: ["Nintendo"],
    }),
  ]);

  const [ugZeldaA, ugMarioA] = await Promise.all([
    UserGame.create({
      userId: userA._id,
      gameId: zelda._id,
      status: "finished",
      hoursPlayed: 40,
      timesFinished: 2,
      rating: 9,
    }),
    UserGame.create({
      userId: userA._id,
      gameId: mario._id,
      status: "playing",
      hoursPlayed: 10,
      timesFinished: 0,
      rating: 8,
    }),
  ]);
  const [ugTetrisB] = await Promise.all([
    UserGame.create({
      userId: userB._id,
      gameId: tetris._id,
      status: "backlog",
      hoursPlayed: 0,
      timesFinished: 0,
    }),
  ]);

  const favoritesA = await GameCollection.create({
    userId: userA._id,
    name: "Favorites",
  });
  ugZeldaA.collectionIds = [favoritesA._id];
  await ugZeldaA.save();

  return {
    userAId: String(userA._id),
    userBId: String(userB._id),
    zeldaId: String(zelda._id),
    marioId: String(mario._id),
    tetrisId: String(tetris._id),
    userGameZeldaA: String(ugZeldaA._id),
    userGameMarioA: String(ugMarioA._id),
    userGameTetrisB: String(ugTetrisB._id),
    collectionFavoritesA: String(favoritesA._id),
  };
}
