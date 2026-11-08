import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dropLegacyCollection,
  planMigration,
  runMigration,
} from "@/server/collections/migration";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

const UID_A = new mongoose.Types.ObjectId();
const UID_B = new mongoose.Types.ObjectId();

function db() {
  if (!mongoose.connection.db) throw new Error("not connected");
  return mongoose.connection.db;
}

async function seedLegacy(options?: { orphan?: boolean; duplicate?: boolean }) {
  const lists = db().collection("gamelists");
  const users = db().collection("usergames");
  const listA = new mongoose.Types.ObjectId();
  await lists.insertOne({
    _id: listA,
    userId: UID_A,
    name: "Wishlist",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await users.insertOne({
    userId: UID_A,
    gameId: new mongoose.Types.ObjectId(),
    listIds: options?.orphan
      ? [listA, new mongoose.Types.ObjectId()]
      : [listA],
  });
  await users.insertOne({ userId: UID_B, gameId: new mongoose.Types.ObjectId() });
  if (options?.duplicate) {
    await lists.insertOne({
      _id: new mongoose.Types.ObjectId(),
      userId: UID_A,
      name: "Wishlist",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return listA;
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  // Raw collections bypass Mongoose models (no registration → the
  // generic clear skips them); usergames has no model import here either.
  await db().collection("gamelists").deleteMany({});
  await db().collection("gamecollections").deleteMany({});
  await db().collection("usergames").deleteMany({});
  await db().collection("activities").deleteMany({});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lists → collections migration", () => {
  it("dry-run reports without changing anything", async () => {
    await seedLegacy({ orphan: true });
    const plan = await planMigration();
    expect(plan.gameLists.total).toBe(1);
    expect(plan.userGames).toMatchObject({
      total: 2,
      withListIds: 1,
      listIdReferences: 2,
    });
    expect(plan.orphanListIds).toHaveLength(1);
    expect(await db().collection("gamecollections").countDocuments()).toBe(0);
    expect(
      await db().collection("usergames").countDocuments({ listIds: { $exists: true } }),
    ).toBe(1);
  });

  it("migrates with preserved ids, relationships and verification", async () => {
    const listId = await seedLegacy();
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    const result = await runMigration({ backupDir: dir });

    expect(result.verified).toBe(true);
    expect(result.copied).toBe(1);
    expect(result.renamed).toBe(1);
    expect(result.backupFile).toContain(dir);
    expect(readdirSync(dir)).toHaveLength(1);

    // Same _id, same ownership, same name.
    const moved = await db().collection("gamecollections").findOne({ _id: listId });
    expect(moved).toMatchObject({ name: "Wishlist", userId: UID_A });

    const tagged = await db()
      .collection("usergames")
      .findOne({ userId: UID_A, collectionIds: { $exists: true } });
    expect(tagged?.collectionIds.map(String)).toEqual([String(listId)]);
    expect(
      await db().collection("usergames").countDocuments({ listIds: { $exists: true } }),
    ).toBe(0);
  });

  it("is idempotent on rerun", async () => {
    await seedLegacy();
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    const first = await runMigration({ backupDir: dir });
    expect(first.verified).toBe(true);
    const second = await runMigration({ backupDir: dir });
    expect(second.copied).toBe(0);
    expect(second.alreadyPresent).toBe(1);
    expect(second.renamed).toBe(0);
    expect(second.verified).toBe(true);
  });

  it("aborts live runs on duplicates (unique index would reject)", async () => {
    await seedLegacy({ duplicate: true });
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    await expect(runMigration({ backupDir: dir })).rejects.toThrow(/duplicate/);
    expect(await db().collection("gamecollections").countDocuments()).toBe(0);
  });

  it("keeps orphans as-is, reported, and still verifies", async () => {
    await seedLegacy({ orphan: true });
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    const result = await runMigration({ backupDir: dir });
    expect(result.orphanListIds).toHaveLength(1);
    expect(result.verified).toBe(true);
    const tagged = await db()
      .collection("usergames")
      .findOne({ userId: UID_A });
    expect(tagged?.collectionIds).toHaveLength(2);
  });

  it("drop-legacy requires confirmation and a matching count", async () => {
    await seedLegacy();
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    await runMigration({ backupDir: dir });
    await expect(
      dropLegacyCollection({ expectedGamelists: 999, confirmDropLegacy: true }),
    ).rejects.toThrow(/re-validate/);
    // @ts-expect-error deliberate missing confirmation
    await expect(dropLegacyCollection({ expectedGamelists: 1 })).rejects.toThrow(
      /confirmation/,
    );
    const { dropped } = await dropLegacyCollection({
      expectedGamelists: 1,
      confirmDropLegacy: true,
    });
    expect(dropped).toBe(true);
    expect(await db().collection("gamelists").countDocuments()).toBe(0);
  });
});
