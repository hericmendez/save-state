import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyMongoTarget,
  formatTargetSummary,
  isDirectExecution,
} from "@/scripts/lib/db-target-guard";
import {
  parseMigrationArgs,
  parseSeedAtlasArgs,
  parseVerifyIndexesArgs,
  resolveMigrationTarget,
  resolveSeedAtlasTarget,
  resolveVerifyIndexesTarget,
} from "@/scripts/lib/operational-cli";

const atlasUri = "mongodb+srv://user:secret@cluster0.example.mongodb.net/?retryWrites=true";
const localUri = "mongodb://127.0.0.1:27017";
const devEnv = { NODE_ENV: "development", MONGODB_DB_NAME: "save-state-dev" };

vi.mock("@/server/seeds/atlas-seed", () => ({
  asAtlasSeedProvider: vi.fn(),
  classifyMongoUri: vi.fn(),
  runAtlasSeed: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());

describe("operational database target guard", () => {
  it("classifies Atlas only for the mongodb.net domain", () => {
    expect(classifyMongoTarget(atlasUri)).toBe("atlas");
    expect(classifyMongoTarget("mongodb+srv://user:secret@not-atlas.example")).toBe(
      "other",
    );
  });

  it("keeps B-01 verify-only as the default", () => {
    const args = parseVerifyIndexesArgs([]);
    expect(args.createMissing).toBe(false);
    expect(
      resolveVerifyIndexesTarget(args, devEnv, atlasUri),
    ).toMatchObject({ dbName: "save-state-dev", createMissing: false });
  });

  it("rejects incomplete index creation consent", () => {
    expect(() => parseVerifyIndexesArgs(["--create-missing"])).toThrow(/--yes/);
    expect(() => parseVerifyIndexesArgs(["--yes"])).toThrow(/only valid/);
    expect(() =>
      resolveVerifyIndexesTarget(
        parseVerifyIndexesArgs(["--create-missing", "--yes"]),
        devEnv,
        atlasUri,
      ),
    ).toThrow(/--db-name requires/);
  });

  it("requires matching nominal confirmation and approved Atlas dev target", () => {
    const args = parseVerifyIndexesArgs([
      "--db-name",
      "save-state-dev",
      "--confirm-db-name",
      "save-state-dev",
      "--create-missing",
      "--yes",
    ]);
    expect(resolveVerifyIndexesTarget(args, devEnv, atlasUri).dbName).toBe(
      "save-state-dev",
    );
    expect(() =>
      resolveVerifyIndexesTarget(
        { ...args, confirmDbName: "save-state" },
        devEnv,
        atlasUri,
      ),
    ).toThrow(/must exactly match/);
    expect(() =>
      resolveVerifyIndexesTarget(
        { ...args, dbName: "save-state" },
        devEnv,
        atlasUri,
      ),
    ).toThrow(/refuses the legacy\/default database/);
    expect(() =>
      resolveVerifyIndexesTarget(
        { ...args, dbName: "save-state-preview", confirmDbName: "save-state-preview" },
        devEnv,
        atlasUri,
      ),
    ).toThrow(/only permits Atlas writes/);
  });

  it("refuses production writes without a separate reviewed opt-in", () => {
    const args = parseVerifyIndexesArgs([
      "--db-name",
      "save-state-prod",
      "--confirm-db-name",
      "save-state-prod",
      "--create-missing",
      "--yes",
    ]);
    expect(() =>
      resolveVerifyIndexesTarget(
        args,
        { NODE_ENV: "production" },
        atlasUri,
      ),
    ).toThrow(/production context/);
    expect(() =>
      resolveVerifyIndexesTarget(
        { ...args, allowProduction: true },
        { NODE_ENV: "production" },
        atlasUri,
      ),
    ).not.toThrow();
  });

  it("does not globally block a future Preview target when explicitly opted in", () => {
    const args = parseVerifyIndexesArgs([
      "--db-name",
      "save-state-preview",
      "--confirm-db-name",
      "save-state-preview",
      "--create-missing",
      "--yes",
      "--allow-preview",
    ]);
    expect(() =>
      resolveVerifyIndexesTarget(args, { VERCEL_ENV: "preview" }, atlasUri),
    ).not.toThrow();
    expect(() =>
      resolveVerifyIndexesTarget(
        { ...args, allowPreview: false },
        { VERCEL_ENV: "preview" },
        atlasUri,
      ),
    ).toThrow(/Preview context/);
    expect(() =>
      parseVerifyIndexesArgs([
        "--create-missing",
        "--yes",
        "--allow-preview",
        "--allow-production",
      ]),
    ).toThrow(/only one hosted environment opt-in/);
  });

  it("never includes URI or hostname in target summaries", () => {
    const summary = formatTargetSummary(atlasUri, "save-state-dev");
    expect(summary).toBe("target: atlas; database: save-state-dev");
    expect(summary).not.toContain("cluster0");
    expect(summary).not.toContain("secret");
  });
});

describe("Atlas seed command guards", () => {
  const validArgs = () =>
    parseSeedAtlasArgs([
      "--db-name",
      "save-state-dev",
      "--confirm-db-name",
      "save-state-dev",
      "--allow-atlas-seed",
    ]);

  it("requires explicit operational consent, explicit database and exact confirmation", () => {
    expect(() =>
      resolveSeedAtlasTarget(
        parseSeedAtlasArgs([]),
        devEnv,
        atlasUri,
      ),
    ).toThrow(/explicit --allow-atlas-seed/);
    expect(() =>
      resolveSeedAtlasTarget(
        parseSeedAtlasArgs(["--allow-atlas-seed"]),
        devEnv,
        atlasUri,
      ),
    ).toThrow(/--db-name requires/);
    expect(() =>
      resolveSeedAtlasTarget(
        { ...validArgs(), confirmDbName: "save-state" },
        devEnv,
        atlasUri,
      ),
    ).toThrow(/must exactly match/);
  });

  it.each(["save-state", "test"]) (
    "refuses development seed destination %s",
    (dbName) => {
      const args = {
        ...validArgs(),
        dbName,
        confirmDbName: dbName,
      };
      expect(() => resolveSeedAtlasTarget(args, devEnv, atlasUri)).toThrow();
    },
  );

  it("accepts only the explicit Atlas development target", () => {
    expect(resolveSeedAtlasTarget(validArgs(), devEnv, atlasUri).dbName).toBe(
      "save-state-dev",
    );
    expect(() => resolveSeedAtlasTarget(validArgs(), devEnv, localUri)).toThrow(
      /only runs against Atlas/,
    );
  });
});

describe("collections migration command guards", () => {
  it("defaults to dry-run but still requires an explicit database", () => {
    const args = parseMigrationArgs([]);
    expect(args.mode).toBe("dry-run");
    expect(() => resolveMigrationTarget(args, {}, localUri)).toThrow(
      /requires a non-empty database name/,
    );
    expect(
      resolveMigrationTarget(
        args,
        { MONGODB_DB_NAME: "save-state-dev" },
        localUri,
      ),
    ).toMatchObject({ dbName: "save-state-dev", mode: "dry-run" });
  });

  it("requires exact database confirmation and a backup directory for live", () => {
    const missingBackup = parseMigrationArgs([
      "--live",
      "--db-name",
      "save-state-dev",
      "--confirm-db-name",
      "save-state-dev",
    ]);
    expect(() => resolveMigrationTarget(missingBackup, devEnv, localUri)).toThrow(
      /--backup-dir is required/,
    );

    const args = parseMigrationArgs([
      "--live",
      "--backup-dir",
      "/tmp/backup",
      "--db-name",
      "save-state-dev",
      "--confirm-db-name",
      "save-state-dev",
    ]);
    expect(resolveMigrationTarget(args, devEnv, localUri).dbName).toBe(
      "save-state-dev",
    );
    expect(() =>
      resolveMigrationTarget(
        { ...args, confirmDbName: "save-state" },
        devEnv,
        localUri,
      ),
    ).toThrow(/must exactly match/);
  });

  it("requires separate authorization for legacy collection drops", () => {
    const base = [
      "--drop-legacy",
      "--expected-gamelists",
      "0",
      "--confirm-drop-legacy",
      "--db-name",
      "save-state-dev",
      "--confirm-db-name",
      "save-state-dev",
    ];
    const unauthorized = parseMigrationArgs(base);
    expect(() => resolveMigrationTarget(unauthorized, devEnv, localUri)).toThrow(
      /separate --allow-drop-legacy authorization/,
    );
    const args = parseMigrationArgs([...base, "--allow-drop-legacy"]);
    expect(
      resolveMigrationTarget(args, devEnv, localUri).expectedGamelists,
    ).toBe(0);
    expect(() =>
      resolveMigrationTarget(
        parseMigrationArgs(["--drop-legacy"]),
        devEnv,
        localUri,
      ),
    ).toThrow(/expected-gamelists.*allow-drop-legacy/);
  });

  it("rejects ambiguous modes and never silently chooses the driver test DB", () => {
    expect(() => parseMigrationArgs(["--live", "--dry-run"])).toThrow(
      /choose exactly one/,
    );
    expect(() =>
      resolveMigrationTarget(
        parseMigrationArgs(["--dry-run", "--db-name", "test"]),
        {},
        localUri,
      ),
    ).toThrow(/driver default database/);
  });
});

describe("direct-execution gate", () => {
  it("does not run a CLI entrypoint when imported by another module", () => {
    expect(
      isDirectExecution(
        "file:///project/scripts/seed-atlas.ts",
        "/project/node_modules/vitest/vitest.mjs",
      ),
    ).toBe(false);
    expect(
      isDirectExecution(
        "file:///project/scripts/seed-atlas.ts",
        "/project/scripts/seed-atlas.ts",
      ),
    ).toBe(true);
  });

  it("importing the Atlas seed CLI does not load env or execute the seed", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    const beforeUri = process.env.MONGODB_URI;
    const beforeDbName = process.env.MONGODB_DB_NAME;
    const { runAtlasSeed } = await import("@/server/seeds/atlas-seed");

    await import("@/scripts/seed-atlas");

    expect(vi.mocked(runAtlasSeed)).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(process.env.MONGODB_URI).toBe(beforeUri);
    expect(process.env.MONGODB_DB_NAME).toBe(beforeDbName);
  });

  it("importing the migration CLI does not connect or run a migration", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    const beforeUri = process.env.MONGODB_URI;
    const beforeDbName = process.env.MONGODB_DB_NAME;

    await import("@/scripts/migrate-lists-to-collections");

    expect(connect).not.toHaveBeenCalled();
    expect(process.env.MONGODB_URI).toBe(beforeUri);
    expect(process.env.MONGODB_DB_NAME).toBe(beforeDbName);
  });

  it("importing B-01 does not connect or provision indexes", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    const beforeUri = process.env.MONGODB_URI;
    const beforeDbName = process.env.MONGODB_DB_NAME;

    await import("@/scripts/verify-indexes");

    expect(connect).not.toHaveBeenCalled();
    expect(process.env.MONGODB_URI).toBe(beforeUri);
    expect(process.env.MONGODB_DB_NAME).toBe(beforeDbName);
  });
});
