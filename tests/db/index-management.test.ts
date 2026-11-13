import mongoose, { type Model } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  inspectModelIndexes,
  provisionMissingIndexes,
  readIndexesOrEmpty,
  verifyEnforcedModelIndexes,
  type IndexModelLike,
} from "@/db/index-management";
import { Activity } from "@/db/models/activity";
import { GameCollection } from "@/db/models/game-collection";
import { GameReview } from "@/db/models/game-review";
import { GlobalGame } from "@/db/models/global-game";
import { PasswordResetToken } from "@/db/models/password-reset-token";
import { EmailVerificationToken } from "@/db/models/email-verification-token";
import { User } from "@/db/models/user";
import { UserGameNote } from "@/db/models/user-game-note";
import { UserGame } from "@/db/models/user-game";

const SOURCE_MODELS = [
  User,
  GlobalGame,
  UserGame,
  GameReview,
  GameCollection,
  PasswordResetToken,
  EmailVerificationToken,
  Activity,
  UserGameNote,
];

let mongo: MongoMemoryServer;
let databaseCounter = 0;
let connections: mongoose.Connection[] = [];

async function createIsolatedModels() {
  const dbName = `save-state-index-test-${++databaseCounter}`;
  const connection = await mongoose
    .createConnection(mongo.getUri(), { dbName })
    .asPromise();
  connections.push(connection);
  const models = SOURCE_MODELS.map((source) =>
    connection.model(source.modelName, source.schema),
  );
  return { connection, models: models as unknown as IndexModelLike[] };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
});

afterEach(async () => {
  await Promise.all(connections.map((connection) => connection.close()));
  connections = [];
  vi.restoreAllMocks();
});

afterAll(async () => {
  await mongo?.stop();
});

describe("schema-driven index management", () => {
  it("T1 provisions every schema index on a completely empty database", async () => {
    const { models } = await createIsolatedModels();
    const before = await Promise.all(models.map(inspectModelIndexes));
    const missing = before.flat().filter((item) => item.status === "missing");

    expect(missing.length).toBeGreaterThan(0);
    await expect(verifyEnforcedModelIndexes(models)).rejects.toThrow(
      /missing enforced index/,
    );

    const after = await provisionMissingIndexes(models);
    expect(after).toHaveLength(missing.length);
    expect(after.every((item) => item.status === "present")).toBe(true);
    await expect(verifyEnforcedModelIndexes(models)).resolves.toBeUndefined();
  });

  it("T2 is idempotent and leaves existing documents unchanged", async () => {
    const { models } = await createIsolatedModels();
    const userModel = models.find((model) => model.modelName === "User") as unknown as Model<any>;
    await userModel.create({
      name: "Index Test",
      email: "index-test@example.invalid",
      passwordHash: "not-a-real-password-hash",
    });

    const first = await provisionMissingIndexes(models);
    const firstSnapshot = await Promise.all(
      models.map(async (model) => ({
        model: model.modelName,
        indexes: await model.collection.listIndexes().toArray(),
      })),
    );
    const second = await provisionMissingIndexes(models);
    const secondSnapshot = await Promise.all(
      models.map(async (model) => ({
        model: model.modelName,
        indexes: await model.collection.listIndexes().toArray(),
      })),
    );

    expect(first.every((item) => item.status === "present")).toBe(true);
    expect(second.every((item) => item.status === "present")).toBe(true);
    expect(secondSnapshot).toEqual(firstSnapshot);
    expect(await userModel.countDocuments()).toBe(1);
  });

  it("T3 provisions tokenHash unique and expiresAt TTL, never legacy token", async () => {
    const { models } = await createIsolatedModels();
    const passwordReset = models.find(
      (model) => model.modelName === "PasswordResetToken",
    )!;

    await provisionMissingIndexes(models);
    const indexes = await passwordReset.collection.listIndexes().toArray();
    const tokenHash = indexes.find((index) =>
      JSON.stringify(index.key) === JSON.stringify({ tokenHash: 1 }),
    );
    const expiresAt = indexes.find((index) =>
      JSON.stringify(index.key) === JSON.stringify({ expiresAt: 1 }),
    );

    expect(tokenHash?.unique).toBe(true);
    expect(expiresAt?.expireAfterSeconds).toBe(0);
    expect(indexes.some((index) =>
      JSON.stringify(index.key) === JSON.stringify({ token: 1 }),
    )).toBe(false);
  });

  it("provisions and verifies EmailVerificationToken unique, TTL, and userId indexes", async () => {
    const { models } = await createIsolatedModels();
    const verification = models.find((model) => model.modelName === "EmailVerificationToken")!;
    const provisioned = await provisionMissingIndexes(models);
    const indexes = await verification.collection.listIndexes().toArray();

    const byKey = (field: string) => indexes.find((index) =>
      JSON.stringify(index.key) === JSON.stringify({ [field]: 1 }),
    );
    expect(byKey("tokenHash")?.unique).toBe(true);
    expect(byKey("expiresAt")?.expireAfterSeconds).toBe(0);
    expect(byKey("userId")).toBeTruthy();
    expect(provisioned.filter((entry) => entry.model === "EmailVerificationToken")
      .every((entry) => entry.status === "present")).toBe(true);
    await expect(verifyEnforcedModelIndexes([verification])).resolves.toBeUndefined();
  });

  it("fails closed for missing and incompatible EmailVerificationToken enforced indexes", async () => {
    const { models } = await createIsolatedModels();
    const verification = models.find((model) => model.modelName === "EmailVerificationToken")!;
    await provisionMissingIndexes(models);
    const indexes = await verification.collection.listIndexes().toArray();
    const tokenIndex = indexes.find((index) =>
      JSON.stringify(index.key) === JSON.stringify({ tokenHash: 1 }),
    )!;
    const originalListIndexes = verification.collection.listIndexes.bind(verification.collection);

    verification.collection.listIndexes = () => ({
      toArray: async () => indexes.filter((index) => index !== tokenIndex),
    });
    await expect(verifyEnforcedModelIndexes([verification]))
      .rejects.toThrow(/missing enforced index.*tokenHash/);

    verification.collection.listIndexes = () => ({
      toArray: async () => indexes.map((index) => index === tokenIndex
        ? { ...index, unique: false }
        : index),
    });
    await expect(verifyEnforcedModelIndexes([verification]))
      .rejects.toThrow(/incompatible enforced index.*tokenHash/);
    verification.collection.listIndexes = originalListIndexes;
  });

  it("T4 fails closed when a required index is missing", async () => {
    const missingModel: IndexModelLike = {
      modelName: "User",
      schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
      collection: {
        listIndexes: () => ({ toArray: async () => [{ key: { _id: 1 } }] }),
        createIndex: vi.fn(),
      },
    };

    await expect(verifyEnforcedModelIndexes([missingModel])).rejects.toThrow(
      /missing enforced index.*email/,
    );
  });

  it("T5 detects incompatible options and never replaces the index", async () => {
    const createIndex = vi.fn();
    const incompatibleModel: IndexModelLike = {
      modelName: "User",
      schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
      collection: {
        listIndexes: () => ({
          toArray: async () => [{ key: { email: 1 }, unique: false }],
        }),
        createIndex,
      },
    };

    await expect(
      provisionMissingIndexes([incompatibleModel]),
    ).rejects.toThrow(/Incompatible existing indexes/);
    await expect(
      verifyEnforcedModelIndexes([incompatibleModel]),
    ).rejects.toThrow(/incompatible enforced index/);
    expect(createIndex).not.toHaveBeenCalled();
  });

  it("T6 preserves correct existing indexes and creates only absent ones", async () => {
    const { models } = await createIsolatedModels();
    const userModel = models.find((model) => model.modelName === "User")!;
    const collection = userModel.collection as unknown as {
      createIndex(fields: Record<string, number>, options?: Record<string, unknown>): Promise<unknown>;
    };
    await collection.createIndex({ email: 1 }, { unique: true });
    const before = await userModel.collection.listIndexes().toArray();

    const final = await provisionMissingIndexes(models);
    const after = await userModel.collection.listIndexes().toArray();

    expect(final.every((item) => item.status === "present")).toBe(true);
    expect(after.find((item) => JSON.stringify(item.key) === JSON.stringify({ email: 1 })))
      .toEqual(before.find((item) => JSON.stringify(item.key) === JSON.stringify({ email: 1 })));
  });

  it("T7 treats only code 26 as a missing collection", async () => {
    const model: IndexModelLike = {
      modelName: "Widget",
      schema: { indexes: () => [] },
      collection: {
        listIndexes: () => ({
          toArray: async () => {
            throw Object.assign(new Error("namespace missing"), { code: 26 });
          },
        }),
        createIndex: vi.fn(),
      },
    };
    await expect(readIndexesOrEmpty(model)).resolves.toEqual([]);

    const permissionError = Object.assign(new Error("not authorized"), { code: 13 });
    model.collection.listIndexes = () => ({
      toArray: async () => { throw permissionError; },
    });
    await expect(readIndexesOrEmpty(model)).rejects.toBe(permissionError);

    const connectionError = new Error("server selection timeout");
    model.collection.listIndexes = () => ({
      toArray: async () => { throw connectionError; },
    });
    await expect(readIndexesOrEmpty(model)).rejects.toBe(connectionError);
  });
});
