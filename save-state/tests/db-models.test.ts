import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { defineModel } from "@/db/models";

const testSchema = new mongoose.Schema(
  { label: { type: String, required: true } },
  { collection: "phase1_infra_probe" },
);

describe("defineModel", () => {
  it("returns the same model on repeated imports without throwing", () => {
    const first = defineModel("Phase1InfraProbe", testSchema);
    const second = defineModel("Phase1InfraProbe", testSchema);
    expect(second).toBe(first);
  });

  it("registers the model on the shared mongoose instance", () => {
    defineModel("Phase1InfraProbe", testSchema);
    expect(mongoose.models.Phase1InfraProbe).toBeDefined();
  });
});
