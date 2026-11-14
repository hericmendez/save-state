import { describe, expect, it } from "vitest";
import { isEnforcedIndex } from "@/db/index-management";
import { Activity } from "@/db/models/activity";
import { GameCollection } from "@/db/models/game-collection";
import { GameReview } from "@/db/models/game-review";
import { GlobalGame } from "@/db/models/global-game";
import { PasswordResetToken } from "@/db/models/password-reset-token";
import { EmailVerificationToken } from "@/db/models/email-verification-token";
import { User } from "@/db/models/user";
import { UserGameNote } from "@/db/models/user-game-note";
import { UserGame } from "@/db/models/user-game";

const MODELS = [
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

describe("local Mongoose index inventory", () => {
  const indexes = MODELS.flatMap((model) =>
    model.schema.indexes().map(([fields, options = {}]) => ({
      model: model.modelName,
      fields,
      options,
    })),
  );

  it("contains 33 declared indexes across nine models, 12 enforced", () => {
    expect(MODELS).toHaveLength(9);
    expect(indexes).toHaveLength(33);
    expect(indexes.filter((index) => isEnforcedIndex(index.options))).toHaveLength(12);
  });

  it("preserves the unique, sparse, partial, and TTL inventory", () => {
    expect(indexes.filter((index) => index.options.unique === true)).toHaveLength(10);
    expect(indexes.filter((index) => index.options.sparse === true)).toHaveLength(2);
    expect(
      indexes.filter((index) => index.options.partialFilterExpression !== undefined),
    ).toHaveLength(1);
    expect(
      indexes.filter((index) => typeof index.options.expireAfterSeconds === "number"),
    ).toHaveLength(2);
  });

  it("has no schema-level autoCreate/autoIndex opt-in that overrides B-01", () => {
    expect(
      MODELS.filter(
        (model) =>
          model.schema.options.autoCreate === true ||
          model.schema.options.autoIndex === true ||
          model.schema.options.autoSearchIndex === true,
      ).map((model) => model.modelName),
    ).toEqual([]);
  });
});
