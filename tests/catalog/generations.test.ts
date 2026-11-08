/**
 * Fase 8 — editorial generation config: identity, order, lookup and the
 * optional ATP mapping contract (pure, no I/O).
 */

import { describe, expect, it } from "vitest";
import {
  GENERATIONS,
  findConsole,
  findGeneration,
  generationAtpPlatforms,
  generationHasAtpMapping,
  listGenerations,
} from "@/features/catalog/generations/generation-map";

describe("generation config", () => {
  it("covers generations 9 → 1", () => {
    expect(GENERATIONS).toHaveLength(9);
    expect(listGenerations().map((g) => g.order)).toEqual([
      9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
  });

  it("uses editorial order, not alphabetical", () => {
    const names = listGenerations().map((g) => g.name);
    expect(names[0]).toBe("Geração 9");
    expect(names[names.length - 1]).toBe("Geração 1");
    expect([...names].sort()).not.toEqual(names);
  });

  it("keeps generation ids unique with required fields", () => {
    const ids = GENERATIONS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const generation of GENERATIONS) {
      expect(generation.name.trim()).not.toBe("");
      expect(generation.shortName.trim()).not.toBe("");
      expect(generation.description.trim()).not.toBe("");
      expect(generation.consoles.length).toBeGreaterThan(0);
    }
  });

  it("keeps console ids unique per generation with optional mappings", () => {
    for (const generation of GENERATIONS) {
      const ids = generation.consoles.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const console of generation.consoles) {
        expect(console.name.trim()).not.toBe("");
        expect(console.manufacturer.trim()).not.toBe("");
        expect(Array.isArray(console.atpPlatforms)).toBe(true);
      }
    }
  });
});

describe("generation lookup", () => {
  it("finds existing generations and consoles", () => {
    expect(findGeneration("gen-9")?.shortName).toBe("Gen 9");
    expect(findConsole("gen-9", "playstation-5")?.manufacturer).toBe("Sony");
  });

  it("returns undefined for unknown ids", () => {
    expect(findGeneration("gen-99")).toBeUndefined();
    expect(findConsole("gen-9", "nope")).toBeUndefined();
    expect(findConsole("nope", "playstation-5")).toBeUndefined();
  });

  it("collects deduplicated ATP platform names in console order", () => {
    const gen9 = findGeneration("gen-9");
    if (!gen9) throw new Error("gen-9 missing");
    const names = generationAtpPlatforms(gen9);
    expect(names).toContain("PlayStation 5");
    expect(new Set(names).size).toBe(names.length);
    expect(generationHasAtpMapping(gen9)).toBe(true);
  });

  it("treats generations without mapping as valid and mappable-free", () => {
    const gen1 = findGeneration("gen-1");
    if (!gen1) throw new Error("gen-1 missing");
    expect(generationAtpPlatforms(gen1)).toEqual([]);
    expect(generationHasAtpMapping(gen1)).toBe(false);
  });
});
