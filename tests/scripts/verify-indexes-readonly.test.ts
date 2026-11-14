import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  indexAuditConnectionOptions,
} from "@/scripts/lib/index-audit-options";
import {
  inspectModelIndexes,
  readIndexesOrEmpty,
  type IndexModelLike,
} from "@/db/index-management";

afterEach(() => vi.restoreAllMocks());

describe("B-01 connection options", () => {
  it("disables every Mongoose automatic collection/index creation per connection", () => {
    const options = indexAuditConnectionOptions("save-state-dev");
    expect(options).toMatchObject({
      dbName: "save-state-dev",
      autoCreate: false,
      autoIndex: false,
      autoSearchIndex: false,
    });
    expect(options.serverSelectionTimeoutMS).toBeGreaterThan(0);
  });
});

describe("Mongoose model initialization without a database", () => {
  it("uses connection false values before pending Model.init continues", async () => {
    const instance = new mongoose.Mongoose({ autoCreate: true, autoIndex: true });
    const connection = instance.connection;
    let finishConnect!: () => void;
    const waitableConnection = connection as unknown as {
      _waitForConnect: (force?: boolean) => Promise<void>;
    };
    const waitForConnect = vi
      .spyOn(waitableConnection, "_waitForConnect")
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishConnect = resolve;
          }),
      );

    const schema = new mongoose.Schema({ label: String });
    const model = connection.model("ReadOnlyInitGuard", schema);
    const createCollection = vi.spyOn(model, "createCollection");
    const ensureIndexes = vi.spyOn(model, "ensureIndexes");
    const createIndexes = vi.spyOn(model, "createIndexes");
    const createSearchIndexes = vi.spyOn(model, "createSearchIndexes");
    const syncIndexes = vi.spyOn(model, "syncIndexes");
    const createIndex = vi.spyOn(model.collection, "createIndex");
    const createDriverIndexes = vi.spyOn(model.collection, "createIndexes");
    const dropIndex = vi.spyOn(model.collection, "dropIndex");
    const dropIndexes = vi.spyOn(model.collection, "dropIndexes");
    const insertOne = vi.spyOn(model.collection, "insertOne");
    const updateOne = vi.spyOn(model.collection, "updateOne");
    const deleteOne = vi.spyOn(model.collection, "deleteOne");

    expect(waitForConnect).toHaveBeenCalledOnce();
    connection.config.autoCreate = false;
    connection.config.autoIndex = false;
    connection.config.autoSearchIndex = false;
    finishConnect();

    await model.init();

    expect(createCollection).not.toHaveBeenCalled();
    expect(ensureIndexes).not.toHaveBeenCalled();
    expect(createIndexes).not.toHaveBeenCalled();
    expect(createSearchIndexes).not.toHaveBeenCalled();
    expect(syncIndexes).not.toHaveBeenCalled();
    expect(createIndex).not.toHaveBeenCalled();
    expect(createDriverIndexes).not.toHaveBeenCalled();
    expect(dropIndex).not.toHaveBeenCalled();
    expect(dropIndexes).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(deleteOne).not.toHaveBeenCalled();
    expect(instance.get("autoCreate")).toBe(true);
    expect(instance.get("autoIndex")).toBe(true);
    expect(connection.config.autoCreate).toBe(false);
    expect(connection.config.autoIndex).toBe(false);

    await connection.close();
  });

  it("preserves schema-level precedence and contains the test write in a mock", async () => {
    const instance = new mongoose.Mongoose({ autoCreate: false, autoIndex: false });
    const connection = instance.connection;
    connection.config.autoCreate = false;
    connection.config.autoIndex = false;
    const createCollection = vi
      .spyOn(connection, "createCollection")
      .mockResolvedValue({} as never);
    const schema = new mongoose.Schema(
      { label: String },
      { autoCreate: true, autoIndex: true },
    );

    const model = connection.model("SchemaOverridesConnection", schema);
    const ensureIndexes = vi.spyOn(model, "ensureIndexes").mockResolvedValue(undefined);
    await model.init();

    expect(schema.options.autoCreate).toBe(true);
    expect(connection.config.autoCreate).toBe(false);
    expect(createCollection).toHaveBeenCalledOnce();
    expect(ensureIndexes).toHaveBeenCalledOnce();
    await connection.close();
  });
});

describe("read-only index metadata", () => {
  it("inspects existing metadata without invoking any write method", async () => {
    const createIndex = vi.fn();
    const model: IndexModelLike = {
      modelName: "Widget",
      schema: { indexes: () => [[{ label: 1 }, { unique: true }]] },
      collection: {
        listIndexes: () => ({
          toArray: async () => [{ key: { label: 1 }, name: "label_1", unique: true }],
        }),
        createIndex,
      },
    };

    await expect(inspectModelIndexes(model)).resolves.toMatchObject([
      { model: "Widget", status: "present", fields: { label: 1 } },
    ]);
    expect(createIndex).not.toHaveBeenCalled();
  });

  it("treats only a missing namespace as an empty collection", async () => {
    const model: IndexModelLike = {
      modelName: "MissingWidget",
      schema: { indexes: () => [[{ label: 1 }, {}]] },
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
    await expect(inspectModelIndexes(model)).resolves.toMatchObject([
      { model: "MissingWidget", status: "missing" },
    ]);
    expect(model.collection.createIndex).not.toHaveBeenCalled();
  });
});
