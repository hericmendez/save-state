/**
 * Fase 1 — Diário: URL query state (parse/serialize/defaults/invalid).
 */

import { describe, expect, it } from "vitest";
import {
  DIARY_DEFAULTS,
  hasActiveDiaryFilters,
  parseDiaryQuery,
  serializeDiaryQuery,
  withoutCursor,
} from "@/features/diary/diary-query";

describe("parseDiaryQuery", () => {
  it("returns defaults for empty input", () => {
    expect(parseDiaryQuery(undefined)).toEqual(DIARY_DEFAULTS);
    expect(parseDiaryQuery(new URLSearchParams())).toEqual(DIARY_DEFAULTS);
  });

  it("parses a full valid query", () => {
    expect(
      parseDiaryQuery(
        new URLSearchParams(
          "q=zelda&userGameId=0123456789abcdef01234567&type=note.created&from=2026-09-01&to=2026-09-22&limit=20&view=list",
        ),
      ),
    ).toEqual({
      q: "zelda",
      userGameId: "0123456789abcdef01234567",
      type: "note.created",
      from: "2026-09-01",
      to: "2026-09-22",
      cursor: undefined,
      limit: 20,
      view: "list",
    });
  });

  it("rejects malformed values predictably", () => {
    const parsed = parseDiaryQuery({
      userGameId: "nope",
      type: "!!!",
      from: "22/09/2026",
      to: "not-a-date",
      limit: "99",
      view: "grid",
    });
    expect(parsed.userGameId).toBe("");
    expect(parsed.type).toBe("");
    expect(parsed.from).toBe("");
    expect(parsed.to).toBe("");
    expect(parsed.limit).toBe(10);
    expect(parsed.view).toBe("timeline");
  });

  it("passes well-formed types through (API enum is authoritative)", () => {
    expect(parseDiaryQuery({ type: "note.created" }).type).toBe(
      "note.created",
    );
  });

  it("keeps cursor when present and drops it on filter change", () => {
    const withCursor = parseDiaryQuery(
      new URLSearchParams("cursor=abc123&limit=20"),
    );
    expect(withCursor.cursor).toBe("abc123");
    expect(withoutCursor(withCursor).cursor).toBeUndefined();
    // withoutCursor preserves everything else.
    expect(withoutCursor({ ...withCursor, q: "x" }).q).toBe("x");
  });
});

describe("serializeDiaryQuery", () => {
  it("omits defaults and round-trips", () => {
    expect(serializeDiaryQuery({})).toBe("");
    const query = {
      ...DIARY_DEFAULTS,
      q: "mario",
      type: "game.finished",
      view: "list" as const,
    };
    const serialized = serializeDiaryQuery(query);
    expect(serialized).toContain("q=mario");
    expect(serialized).not.toContain("cursor");
    expect(parseDiaryQuery(new URLSearchParams(serialized))).toEqual(query);
  });

  it("detects active filters", () => {
    expect(hasActiveDiaryFilters(DIARY_DEFAULTS)).toBe(false);
    expect(
      hasActiveDiaryFilters({ ...DIARY_DEFAULTS, from: "2026-09-01" }),
    ).toBe(true);
  });
});
