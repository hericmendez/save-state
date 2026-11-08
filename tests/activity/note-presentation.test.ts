import { describe, expect, it } from "vitest";
import {
  PRESENTATION_REGISTRY,
  singularMessage,
  UNKNOWN_ACTIVITY_MESSAGE,
  type ActivityEventDTO,
} from "@/features/activity/presentation";
import {
  canExtendGroup,
  groupActivities,
  type ActivityGroup,
  type FeedItem,
} from "@/features/activity/grouping";

let sequence = 0;

function ev(
  type: string,
  iso: string,
  extra?: Partial<ActivityEventDTO>,
): ActivityEventDTO {
  sequence += 1;
  return {
    _id: String(sequence).padStart(24, "0"),
    type,
    userGameId: "000000000000000000000001",
    game: { name: "Hollow Knight" },
    metadata: { noteId: `0000000000000000000000${String(sequence).padStart(2, "0")}` },
    createdAt: iso,
    ...extra,
  };
}

function note(iso: string, extra?: Partial<ActivityEventDTO>): ActivityEventDTO {
  return ev("note.created", iso, extra);
}

function at(minutes: number): string {
  const base = Date.UTC(2026, 8, 21, 12, 0, 0);
  return new Date(base + minutes * 60_000).toISOString();
}

describe("note.created presentation", () => {
  it("renders the pt-BR singular message with the game name", () => {
    expect(singularMessage(note(at(0)))).toBe(
      "Você adicionou uma anotação em Hollow Knight.",
    );
  });

  it("falls back to a generic game name without a snapshot", () => {
    expect(singularMessage(note(at(0), { game: null }))).toBe(
      "Você adicionou uma anotação em um jogo.",
    );
  });

  it("never exposes the note content in the message", () => {
    const secret = "conteúdo secreto da anotação que jamais deve vazar";
    const event = note(at(0), { metadata: { noteId: "abc123" } });
    const message = singularMessage(event);
    expect(message).not.toContain(secret);
    expect(message).not.toContain("abc123");
    expect(JSON.stringify(event.metadata)).not.toContain(secret);
  });

  it("is groupable with a plural message", () => {
    const rule = PRESENTATION_REGISTRY["note.created"];
    expect(rule.groupable).toBe(true);
    expect(typeof rule.semanticKey).toBe("function");
    expect(rule.plural?.(2, note(at(0)))).toBe("Você adicionou 2 anotações.");
  });

  it("keeps the unknown-type canary untouched", () => {
    expect(singularMessage(ev("future.unknown", at(0)))).toBe(
      UNKNOWN_ACTIVITY_MESSAGE,
    );
  });
});

describe("note.created grouping", () => {
  it("groups notes of the same game inside the 30-minute chain", () => {
    const items = groupActivities([note(at(0)), note(at(10))]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("group");
    expect(items[0].title).toBe("Você adicionou 2 anotações.");
    expect((items[0] as ActivityGroup).members).toHaveLength(2);
  });

  it("never mixes notes from different games", () => {
    const items = groupActivities([
      note(at(0)),
      note(at(5), { userGameId: "000000000000000000000002" }),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((item: FeedItem) => item.kind === "single")).toBe(true);
  });

  it("breaks the chain past the 30-minute gap", () => {
    expect(canExtendGroup(note(at(0)), note(at(29)), "UTC")).toBe(true);
    expect(canExtendGroup(note(at(0)), note(at(31)), "UTC")).toBe(false);
    const items = groupActivities([note(at(0)), note(at(45))]);
    expect(items).toHaveLength(2);
  });

  it("breaks the chain on an interleaving event", () => {
    const items = groupActivities([
      note(at(0)),
      ev("game.finished", at(2), { metadata: { timesFinished: 1 } }),
      note(at(4)),
    ]);
    expect(items).toHaveLength(3);
  });
});
