#!/usr/bin/env tsx
// NOTE: this import must stay first. It registers the local "server-only"
// stub before any @/ module is evaluated, so ops scripts run under plain
// tsx on any OS — no NODE_OPTIONS shell prefix required (Windows-safe).
import "./register-server-only-stub.mjs";
/**
 * Save State local seed (Etapa 6 FASE 4).
 *
 * Rebuilds the LOCAL database with a curated catalog of 30 real games,
 * one test user, distributed library entries, collections, favorites
 * and notes — all through the existing domain services (no raw writes
 * except guarded idempotency lookups).
 *
 * Usage:
 *   pnpm db:seed              # idempotent upsert; never drops
 *   pnpm db:seed -- --reset   # drops the LOCAL save-state DB first
 *
 * Safety: refuses anything that is not mongodb://localhost:27017 (or
 * 127.0.0.1) with database name exactly "save-state". Atlas
 * (mongodb+srv / *.mongodb.net), foreign hosts and other databases are
 * rejected before any connection that could mutate data.
 *
 * Data: static curated catalog (no IGDB dependency — IGDB is not
 * configured in this environment). Platform names match the Save State
 * IGDB platform catalog so future provider filters resolve. Cover and
 * summary are intentionally absent (never invent); igdbId is omitted
 * (no confirmed external identifier).
 */
import mongoose from "mongoose";
import "./load-local-env";
import { GlobalGame } from "@/db/models/global-game";
import { GameCollection } from "@/db/models/game-collection";
import { User } from "@/db/models/user";
import { UserGame } from "@/db/models/user-game";
import { registerUser } from "@/server/auth/service";
import { createGame } from "@/server/games/service";
import { addCollectionToGame, createGameCollection } from "@/server/collections/service";
import { createNote } from "@/server/notes/service";

interface SeedGame {
  slug: string;
  name: string;
  platforms: string[];
  genres: string[];
  developers: string[];
  publishers: string[];
  releaseDate: string;
  library: {
    status:
      | "backlog"
      | "playing"
      | "replaying"
      | "stalled"
      | "dropped"
      | "limbo"
      | "endless"
      | "achievement"
      | "finished"
      | "wishlist";
    hoursPlayed: number;
    timesFinished: number;
    rating?: number;
    review?: string;
    favorite: boolean;
    fullyCompleted?: boolean;
    achievements?: boolean;
    achievementProgress?: number;
  };
}

const GAMES: SeedGame[] = [
  { slug: "tetris", name: "Tetris", platforms: ["Game Boy"], genres: ["Puzzle"], developers: ["Nintendo"], publishers: ["Nintendo"], releaseDate: "1989-06-14", library: { status: "finished", hoursPlayed: 40, timesFinished: 3, rating: 9, favorite: true } },
  { slug: "super-mario-bros", name: "Super Mario Bros.", platforms: ["Nintendo Entertainment System"], genres: ["Platform"], developers: ["Nintendo"], publishers: ["Nintendo"], releaseDate: "1985-09-13", library: { status: "finished", hoursPlayed: 25, timesFinished: 5, rating: 10, favorite: false } },
  { slug: "the-legend-of-zelda-ocarina-of-time", name: "The Legend of Zelda: Ocarina of Time", platforms: ["Nintendo 64"], genres: ["Adventure"], developers: ["Nintendo"], publishers: ["Nintendo"], releaseDate: "1998-11-21", library: { status: "finished", hoursPlayed: 80, timesFinished: 3, rating: 10, review: "Uma aventura perfeita do início ao fim.", favorite: true, fullyCompleted: true } },
  { slug: "super-mario-64", name: "Super Mario 64", platforms: ["Nintendo 64"], genres: ["Platform"], developers: ["Nintendo"], publishers: ["Nintendo"], releaseDate: "1996-06-23", library: { status: "finished", hoursPlayed: 35, timesFinished: 2, rating: 9, favorite: false } },
  { slug: "chrono-trigger", name: "Chrono Trigger", platforms: ["Super Nintendo Entertainment System"], genres: ["Role-playing (RPG)"], developers: ["Square"], publishers: ["Square"], releaseDate: "1995-03-11", library: { status: "dropped", hoursPlayed: 5, timesFinished: 0, favorite: true } },
  { slug: "final-fantasy-vii", name: "Final Fantasy VII", platforms: ["PlayStation"], genres: ["Role-playing (RPG)"], developers: ["Square"], publishers: ["Square"], releaseDate: "1997-01-31", library: { status: "backlog", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "metal-gear-solid", name: "Metal Gear Solid", platforms: ["PlayStation"], genres: ["Adventure"], developers: ["Konami"], publishers: ["Konami"], releaseDate: "1998-09-03", library: { status: "backlog", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "half-life-2", name: "Half-Life 2", platforms: ["PC (Microsoft Windows)"], genres: ["Shooter"], developers: ["Valve"], publishers: ["Valve"], releaseDate: "2004-11-16", library: { status: "backlog", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "portal", name: "Portal", platforms: ["PC (Microsoft Windows)"], genres: ["Puzzle"], developers: ["Valve"], publishers: ["Valve"], releaseDate: "2007-10-09", library: { status: "finished", hoursPlayed: 12, timesFinished: 2, rating: 9, review: "Puzzles geniais e humor afiado.", favorite: false } },
  { slug: "the-elder-scrolls-v-skyrim", name: "The Elder Scrolls V: Skyrim", platforms: ["PC (Microsoft Windows)"], genres: ["Role-playing (RPG)"], developers: ["Bethesda Game Studios"], publishers: ["Bethesda Softworks"], releaseDate: "2011-11-11", library: { status: "wishlist", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "the-witcher-3-wild-hunt", name: "The Witcher 3: Wild Hunt", platforms: ["PC (Microsoft Windows)"], genres: ["Role-playing (RPG)"], developers: ["CD Projekt Red"], publishers: ["CD Projekt"], releaseDate: "2015-05-19", library: { status: "wishlist", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "red-dead-redemption-2", name: "Red Dead Redemption 2", platforms: ["PlayStation 4"], genres: ["Adventure"], developers: ["Rockstar Games"], publishers: ["Rockstar Games"], releaseDate: "2018-10-26", library: { status: "wishlist", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "the-last-of-us", name: "The Last of Us", platforms: ["PlayStation 3"], genres: ["Adventure"], developers: ["Naughty Dog"], publishers: ["Sony Computer Entertainment"], releaseDate: "2013-06-14", library: { status: "wishlist", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "god-of-war-2018", name: "God of War", platforms: ["PlayStation 4"], genres: ["Adventure"], developers: ["Santa Monica Studio"], publishers: ["Sony Interactive Entertainment"], releaseDate: "2018-04-20", library: { status: "wishlist", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "elden-ring", name: "Elden Ring", platforms: ["PlayStation 5"], genres: ["Role-playing (RPG)"], developers: ["FromSoftware"], publishers: ["Bandai Namco Entertainment"], releaseDate: "2022-02-25", library: { status: "playing", hoursPlayed: 95, timesFinished: 0, rating: 9, favorite: true } },
  { slug: "baldurs-gate-3", name: "Baldur's Gate 3", platforms: ["PC (Microsoft Windows)"], genres: ["Role-playing (RPG)"], developers: ["Larian Studios"], publishers: ["Larian Studios"], releaseDate: "2023-08-03", library: { status: "playing", hoursPlayed: 120, timesFinished: 0, rating: 10, favorite: false } },
  { slug: "hades", name: "Hades", platforms: ["Nintendo Switch"], genres: ["Indie", "Hack and slash/Beat 'em up"], developers: ["Supergiant Games"], publishers: ["Supergiant Games"], releaseDate: "2020-09-17", library: { status: "replaying", hoursPlayed: 70, timesFinished: 3, rating: 10, favorite: false } },
  { slug: "hollow-knight", name: "Hollow Knight", platforms: ["PC (Microsoft Windows)"], genres: ["Platform", "Adventure"], developers: ["Team Cherry"], publishers: ["Team Cherry"], releaseDate: "2017-02-24", library: { status: "playing", hoursPlayed: 45, timesFinished: 0, rating: 9, favorite: true } },
  { slug: "celeste", name: "Celeste", platforms: ["Nintendo Switch"], genres: ["Platform"], developers: ["Maddy Makes Games"], publishers: ["Maddy Makes Games"], releaseDate: "2018-01-25", library: { status: "finished", hoursPlayed: 20, timesFinished: 1, rating: 9, favorite: false, fullyCompleted: true } },
  { slug: "stardew-valley", name: "Stardew Valley", platforms: ["PC (Microsoft Windows)"], genres: ["Simulator", "Role-playing (RPG)"], developers: ["ConcernedApe"], publishers: ["ConcernedApe"], releaseDate: "2016-02-26", library: { status: "playing", hoursPlayed: 60, timesFinished: 0, rating: 8, favorite: false } },
  { slug: "minecraft", name: "Minecraft", platforms: ["PC (Microsoft Windows)"], genres: ["Adventure", "Simulator"], developers: ["Mojang"], publishers: ["Mojang"], releaseDate: "2011-11-18", library: { status: "endless", hoursPlayed: 200, timesFinished: 0, favorite: false, achievements: true, achievementProgress: 45 } },
  { slug: "halo-combat-evolved", name: "Halo: Combat Evolved", platforms: ["Xbox"], genres: ["Shooter"], developers: ["Bungie"], publishers: ["Microsoft Game Studios"], releaseDate: "2001-11-15", library: { status: "dropped", hoursPlayed: 8, timesFinished: 0, rating: 6, favorite: false } },
  { slug: "super-metroid", name: "Super Metroid", platforms: ["Super Nintendo Entertainment System"], genres: ["Platform", "Adventure"], developers: ["Nintendo"], publishers: ["Nintendo"], releaseDate: "1994-03-19", library: { status: "backlog", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "shadow-of-the-colossus", name: "Shadow of the Colossus", platforms: ["PlayStation 2"], genres: ["Adventure"], developers: ["Team Ico"], publishers: ["Sony Computer Entertainment"], releaseDate: "2005-10-18", library: { status: "backlog", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "resident-evil-4", name: "Resident Evil 4", platforms: ["Nintendo GameCube"], genres: ["Shooter"], developers: ["Capcom"], publishers: ["Capcom"], releaseDate: "2005-01-11", library: { status: "finished", hoursPlayed: 25, timesFinished: 2, rating: 9, favorite: false } },
  { slug: "dark-souls", name: "Dark Souls", platforms: ["PlayStation 3"], genres: ["Role-playing (RPG)"], developers: ["FromSoftware"], publishers: ["Namco Bandai Games"], releaseDate: "2011-09-22", library: { status: "backlog", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "the-legend-of-zelda-breath-of-the-wild", name: "The Legend of Zelda: Breath of the Wild", platforms: ["Nintendo Switch"], genres: ["Adventure"], developers: ["Nintendo"], publishers: ["Nintendo"], releaseDate: "2017-03-03", library: { status: "playing", hoursPlayed: 110, timesFinished: 0, rating: 10, review: "Liberdade total para explorar Hyrule.", favorite: true } },
  { slug: "super-mario-world", name: "Super Mario World", platforms: ["Super Nintendo Entertainment System"], genres: ["Platform"], developers: ["Nintendo"], publishers: ["Nintendo"], releaseDate: "1990-11-21", library: { status: "finished", hoursPlayed: 30, timesFinished: 4, rating: 10, review: "Plataforma em estado puro.", favorite: false } },
  { slug: "pokemon-red", name: "Pokémon Red", platforms: ["Game Boy"], genres: ["Role-playing (RPG)"], developers: ["Game Freak"], publishers: ["Nintendo"], releaseDate: "1996-02-27", library: { status: "backlog", hoursPlayed: 0, timesFinished: 0, favorite: false } },
  { slug: "grand-theft-auto-v", name: "Grand Theft Auto V", platforms: ["PlayStation 3"], genres: ["Adventure"], developers: ["Rockstar North"], publishers: ["Rockstar Games"], releaseDate: "2013-09-17", library: { status: "backlog", hoursPlayed: 0, timesFinished: 0, favorite: false } },
];

const COLLECTIONS: Array<{ name: string; slugs: string[] }> = [
  { name: "Favoritos da infância", slugs: ["tetris", "super-mario-bros", "super-mario-world", "super-mario-64", "the-legend-of-zelda-ocarina-of-time", "pokemon-red", "super-metroid"] },
  { name: "Jogando atualmente", slugs: ["elden-ring", "baldurs-gate-3", "hollow-knight", "the-legend-of-zelda-breath-of-the-wild", "stardew-valley", "hades"] },
  { name: "Quero jogar", slugs: ["final-fantasy-vii", "metal-gear-solid", "chrono-trigger", "the-elder-scrolls-v-skyrim", "the-witcher-3-wild-hunt", "the-last-of-us", "god-of-war-2018", "red-dead-redemption-2"] },
  { name: "Clássicos", slugs: ["tetris", "super-mario-bros", "chrono-trigger", "final-fantasy-vii", "metal-gear-solid", "the-legend-of-zelda-ocarina-of-time", "super-metroid", "shadow-of-the-colossus", "resident-evil-4", "super-mario-world"] },
];

const NOTES: Array<{ slug: string; content: string }> = [
  { slug: "the-legend-of-zelda-ocarina-of-time", content: "Anotar onde estão as Skulltulas douradas que faltam." },
  { slug: "the-legend-of-zelda-breath-of-the-wild", content: "Testar receita com durian na próxima sessão." },
  { slug: "elden-ring", content: "Explorar Nokron antes do chefe final." },
];

// Local-only dev credentials. Documented in the Etapa 6 FASE 4 report;
// never printed by this script.
const DEV_USER = {
  name: "Player One",
  email: "dev@savestate.local",
  password: "dev-player-01-local",
};

function assertLocalMongo(uri: string): { dbName: string } {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    console.error("refusing to proceed: MONGODB_URI is not a valid URL — aborting before any destructive step");
    process.exit(2);
  }
  const protocolOk = parsed.protocol === "mongodb:";
  const host = parsed.hostname.toLowerCase();
  const hostOk = host === "localhost" || host === "127.0.0.1";
  const port = parsed.port === "" ? "27017" : parsed.port;
  const portOk = port === "27017";
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("?")[0]);
  const atlas = host.includes("mongodb.net");
  if (!protocolOk || !hostOk || !portOk || atlas || dbName !== "save-state") {
    console.error(
      "refusing to proceed: target is not the local save-state database " +
        `(protocol=${parsed.protocol} host=<redacted> port=${port} db=${dbName || "(empty)"}). ` +
        "This script only touches mongodb://localhost:27017/save-state.",
    );
    process.exit(2);
  }
  return { dbName };
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(2);
  }
  const { dbName } = assertLocalMongo(uri);
  const reset = process.argv.includes("--reset");
  console.log(`target: mongodb://localhost:27017/${dbName} (verified local)`);
  console.log(`mode: ${reset ? "reset + seed" : "idempotent seed (no destructive step)"}`);

  await mongoose.connect(uri);
  try {
    if (reset) {
      await mongoose.connection.db?.dropDatabase();
      console.log("local database dropped");
    }

    // User (idempotent by email).
    const existingUser = await User.findOne({ email: DEV_USER.email }).lean();
    if (!existingUser) {
      await registerUser(DEV_USER);
      console.log(`user created: ${DEV_USER.email}`);
    } else {
      console.log(`user reused: ${DEV_USER.email}`);
    }
    const userDoc = await User.findOne({ email: DEV_USER.email }).lean();
    const userId = String(userDoc!._id);

    // Catalog + library (idempotent by slug / {userId,gameId}).
    let gamesCreated = 0;
    let gamesReused = 0;
    let libraryCreated = 0;
    let libraryKept = 0;
    const userGameBySlug = new Map<string, string>();
    for (const entry of GAMES) {
      let global: { _id: mongoose.Types.ObjectId } | null =
        await GlobalGame.findOne({ slug: entry.slug }).lean();
      if (!global) {
        const created = await GlobalGame.create({
          slug: entry.slug,
          name: entry.name,
          source: "manual" as const,
          genres: entry.genres,
          platforms: entry.platforms,
          developers: entry.developers,
          publishers: entry.publishers,
          releaseDate: new Date(`${entry.releaseDate}T00:00:00.000Z`),
        });
        global = created.toObject();
        gamesCreated += 1;
      } else {
        gamesReused += 1;
      }
      const existing = await UserGame.findOne({ userId, gameId: global!._id }).lean();
      if (existing) {
        libraryKept += 1;
        userGameBySlug.set(entry.slug, String(existing._id));
        continue;
      }
      const created = await createGame({
        userId,
        gameId: String(global!._id),
        status: entry.library.status,
        hoursPlayed: entry.library.hoursPlayed,
        timesFinished: entry.library.timesFinished,
        ...(entry.library.rating !== undefined ? { rating: entry.library.rating } : {}),
        ...(entry.library.review !== undefined
          ? { review: { content: entry.library.review } }
          : {}),
        ...(entry.library.favorite ? { favorite: true } : {}),
        ...(entry.library.fullyCompleted ? { fullyCompleted: true } : {}),
        ...(entry.library.achievements ? { achievements: true } : {}),
        ...(entry.library.achievementProgress !== undefined
          ? { achievementProgress: entry.library.achievementProgress }
          : {}),
      });
      libraryCreated += 1;
      userGameBySlug.set(entry.slug, String(created._id));
    }

    // Collections (idempotent by {userId,name}).
    let collectionsCreated = 0;
    let collectionsReused = 0;
    const collectionByName = new Map<string, string>();
    for (const collection of COLLECTIONS) {
      let doc = await GameCollection.findOne({ userId, name: collection.name }).lean();
      if (!doc) {
        const created = await createGameCollection(userId, { name: collection.name });
        doc = created.toObject() as typeof doc;
        collectionsCreated += 1;
      } else {
        collectionsReused += 1;
      }
      collectionByName.set(collection.name, String(doc!._id));
    }

    // Memberships (idempotent: service skips existing links).
    let memberships = 0;
    for (const collection of COLLECTIONS) {
      const collectionId = collectionByName.get(collection.name)!;
      for (const slug of collection.slugs) {
        const userGameId = userGameBySlug.get(slug);
        if (!userGameId) throw new Error(`missing UserGame for slug ${slug}`);
        const before = await UserGame.findById(userGameId).lean();
        await addCollectionToGame(userId, userGameId, collectionId);
        const after = await UserGame.findById(userGameId).lean();
        if ((after?.collectionIds.length ?? 0) > (before?.collectionIds.length ?? 0)) {
          memberships += 1;
        }
      }
    }

    // Notes (idempotent by exact content per game).
    let notesCreated = 0;
    for (const note of NOTES) {
      const userGameId = userGameBySlug.get(note.slug);
      if (!userGameId) throw new Error(`missing UserGame for slug ${note.slug}`);
      const existing = await mongoose.connection.db
        ?.collection("usergamenotes")
        .findOne({ userId: new mongoose.Types.ObjectId(userId), content: note.content });
      if (!existing) {
        await createNote(userId, userGameId, { content: note.content });
        notesCreated += 1;
      }
    }

    console.log(
      `done: games created=${gamesCreated} reused=${gamesReused} | ` +
        `library created=${libraryCreated} kept=${libraryKept} | ` +
        `collections created=${collectionsCreated} reused=${collectionsReused} | ` +
        `memberships added=${memberships} | notes created=${notesCreated}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
