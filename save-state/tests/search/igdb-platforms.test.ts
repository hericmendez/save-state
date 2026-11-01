import { afterEach, describe, expect, it, vi } from "vitest";
import { findCatalogPlatform, resolveIgdbPlatformIds } from "@/server/search/igdb-platforms";

describe("Etapa 3 — Save State platform catalog → IGDB ids", () => {
  it("resolves editorial/generation names", () => {
    expect(resolveIgdbPlatformIds("PlayStation 5").ids).toEqual([167]);
    expect(resolveIgdbPlatformIds("Nintendo Switch").ids).toEqual([130]);
    expect(resolveIgdbPlatformIds("Xbox Series").ids).toEqual([169]);
    expect(resolveIgdbPlatformIds("GameCube").ids).toEqual([21]);
    expect(resolveIgdbPlatformIds("Sega Mega Drive").ids).toEqual([29]);
    expect(resolveIgdbPlatformIds("SNES").ids).toEqual([19]);
    expect(resolveIgdbPlatformIds("NES").ids).toEqual([18]);
  });

  it("resolves comma-joined multi-platform contexts with dedup", () => {
    const { ids, unresolved } = resolveIgdbPlatformIds(
      "PlayStation 5, Xbox Series, PlayStation 5",
    );
    expect(ids).toEqual([167, 169]);
    expect(unresolved).toEqual([]);
  });

  it("resolves manufacturer names to every platform of that company", () => {
    // Etapa 2 §3.7: typing "Sony" in the platform filter expands to all
    // Sony consoles — no guessing, only curated catalog ids.
    const sony = resolveIgdbPlatformIds("Sony");
    expect(sony.unresolved).toEqual([]);
    expect(sony.ids).toContain(7); // PlayStation
    expect(sony.ids).toContain(8); // PlayStation 2
    expect(sony.ids).toContain(167); // PlayStation 5
    expect(sony.ids.length).toBeGreaterThan(3);

    const nintendo = resolveIgdbPlatformIds("Nintendo");
    expect(nintendo.unresolved).toEqual([]);
    expect(nintendo.ids).toContain(130); // Nintendo Switch
    expect(nintendo.ids).toContain(19); // SNES
  });

  it("resolves official names, aliases and makers in one comma-joined value", () => {
    const { ids, unresolved } = resolveIgdbPlatformIds("PS2, Switch, Sega");
    expect(unresolved).toEqual([]);
    expect(ids).toContain(8); // PS2 alias → PlayStation 2
    expect(ids).toContain(130); // Switch alias → Nintendo Switch
    expect(ids).toContain(29); // Sega maker → Mega Drive, Saturn, ...
  });

  it("reports unknown platforms instead of guessing", () => {
    const { ids, unresolved } = resolveIgdbPlatformIds("PlayStation 5, iOS");
    expect(ids).toEqual([167]);
    expect(unresolved).toEqual(["iOS"]);
  });

  it("is case-insensitive and trim-tolerant", () => {
    expect(resolveIgdbPlatformIds("  nintendo switch ").ids).toEqual([130]);
  });

  it("exposes curated display metadata without invented values", () => {
    const ps5 = findCatalogPlatform(167);
    expect(ps5).toMatchObject({
      name: "PlayStation 5",
      company: "Sony",
      family: "Sony",
      releaseYear: 2020,
      status: "active",
    });
    const web = findCatalogPlatform(82);
    expect(web?.company).toBe("");
    expect(web?.releaseYear).toBeNull();
  });
});
