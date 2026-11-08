import { describe, expect, it } from "vitest";
import { ACTIVITY_TYPES } from "@/schemas/activity";
import {
  GROUP_GAP_MINUTES,
  PRESENTATION_REGISTRY,
  singularMessage,
  UNKNOWN_ACTIVITY_MESSAGE,
  type ActivityEventDTO,
} from "@/features/activity/presentation";
import {
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
    game: { name: `Game ${sequence}` },
    metadata: {},
    createdAt: iso,
    ...extra,
  };
}

function fav(iso: string, name?: string): ActivityEventDTO {
  return ev("game.favorited", iso, name ? { game: { name } } : {});
}

function titles(items: FeedItem[]): string[] {
  return items.map((item) => `${item.kind}:${item.title}`);
}

function at(minutes: number): string {
  const base = Date.UTC(2026, 8, 21, 9, 0, 0);
  return new Date(base + minutes * 60_000).toISOString();
}

describe("registry totality", () => {
  it("covers every domain event type with a rule", () => {
    expect(GROUP_GAP_MINUTES).toBe(30);
    for (const type of ACTIVITY_TYPES) {
      expect(PRESENTATION_REGISTRY[type], type).toBeDefined();
      expect(typeof PRESENTATION_REGISTRY[type].singular).toBe("function");
    }
  });

  it("falls back for unknown future types without breaking", () => {
    const items = groupActivities([
      ev("game.favorited", at(0)),
      ev("future.unknown", at(1)),
      ev("future.unknown", at(2)),
    ]);
    // Unknown types never group — each stays a singleton with fallback.
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.kind === "single")).toBe(true);
    expect(items[0].title).toBe(UNKNOWN_ACTIVITY_MESSAGE);
  });
});

describe("list.deleted memberCount plural", () => {
  function deleted(memberCount: number): string {
    return singularMessage({
      _id: "000000000000000000000001",
      type: "list.deleted",
      list: { listId: "000000000000000000000002", name: "Lista Y" },
      metadata: { memberCount },
      createdAt: "2026-09-21T12:00:00.000Z",
    });
  }

  it.each([
    [0, 'Você excluiu a lista "Lista Y" (0 jogos).'],
    [1, 'Você excluiu a lista "Lista Y" (1 jogo).'],
    [2, 'Você excluiu a lista "Lista Y" (2 jogos).'],
    [25, 'Você excluiu a lista "Lista Y" (25 jogos).'],
  ])("memberCount %i → %s", (memberCount, expected) => {
    expect(deleted(memberCount)).toBe(expected);
  });
});

describe("basics", () => {
  it("keeps a lone event as singleton, not a group of one", () => {
    const [item] = groupActivities([fav(at(0), "Chrono Trigger")]);
    expect(item.kind).toBe("single");
    expect(item.count).toBe(1);
    expect(item.title).toBe("Chrono Trigger é um dos seus jogos favoritos!");
    expect(item.canExpand).toBe(false);
  });

  it("groups two compatible events", () => {
    const items = groupActivities([fav(at(0)), fav(at(5))]);
    expect(items).toHaveLength(1);
    const [group] = items;
    expect(group.kind).toBe("group");
    expect(group.count).toBe(2);
    expect(group.title).toBe("2 jogos foram adicionados aos favoritos.");
    expect(group.canExpand).toBe(true);
  });

  it("groups four favorites with span, members and details", () => {
    const events = [fav(at(1)), fav(at(2)), fav(at(4)), fav(at(8))];
    const [group] = groupActivities(events) as [ActivityGroup];
    expect(group.kind).toBe("group");
    expect(group.count).toBe(4);
    expect(group.span.from.toISOString()).toBe(at(1));
    expect(group.span.to.toISOString()).toBe(at(8));
    expect(group.members).toEqual(events);
    expect(group.expanded).toHaveLength(4);
    expect(group.expanded[0].time).toBe("09:01");
    expect(group.expanded[0].cover).toBeUndefined();
  });

  it("keeps incompatible events separate", () => {
    const items = groupActivities([
      fav(at(0)),
      ev("game.status_changed", at(1), {
        metadata: { from: "backlog", to: "playing" },
      }),
    ]);
    expect(items).toHaveLength(2);
    // Feed order is newest-first: the status change is items[0].
    expect(items[0].title).toContain("backlog");
  });
});

describe("temporal window (chain semantics)", () => {
  it.each([
    ["29:59 groups", 29 + 59 / 60, 1],
    ["30:00 groups (boundary inclusive)", 30, 1],
    ["30:01 splits", 30 + 1 / 60, 2],
  ])("%s", (_label, gapMinutes, expected) => {
    const items = groupActivities([fav(at(0)), fav(at(gapMinutes))]);
    expect(items).toHaveLength(expected);
  });

  it("chains gaps: 09:00 → 09:20 → 09:40 is one group", () => {
    const items = groupActivities([fav(at(0)), fav(at(20)), fav(at(40))]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("group");
    expect(items[0].count).toBe(3);
  });
});

describe("interleaving breaks the chain (no global collection)", () => {
  it("A A B A → group A(2) + B + A", () => {
    const items = groupActivities([
      fav(at(0), "A1"),
      fav(at(2), "A2"),
      ev("game.status_changed", at(4), {
        metadata: { from: "backlog", to: "playing" },
      }),
      fav(at(6), "A3"),
    ]);
    // Feed order is newest-first.
    expect(titles(items)).toEqual([
      expect.stringMatching(/^single:/),
      expect.stringMatching(/^single:/),
      expect.stringMatching(/^group:/),
    ]);
    expect(items[2].count).toBe(2);
    expect((items[0] as ActivityGroup).members?.[0]).toBeDefined();
  });
});

describe("semantic separation", () => {
  it.each([
    ["game.favorited", "game.unfavorited"],
    ["game.completed", "game.uncompleted"],
    ["top10.removed/manual", "top10.removed/unfavorited"],
    ["top10.removed/unfavorited", "top10.removed/game_deleted"],
  ])("%s never mix", (first, second) => {
    const [typeA, reasonA] = first.split("/");
    const [typeB, reasonB] = second.split("/");
    const meta = (reason?: string) =>
      reason ? { reason } : {};
    const items = groupActivities([
      ev(typeA, at(0), { metadata: meta(reasonA) }),
      ev(typeB, at(5), { metadata: meta(reasonB) }),
    ]);
    expect(items).toHaveLength(2);
  });

  it("membership groups by list, not just by type", () => {
    const wish = { list: { listId: "1".padStart(24, "0"), name: "Wishlist" } };
    const favs = { list: { listId: "2".padStart(24, "0"), name: "Favorites" } };
    const items = groupActivities([
      ev("game.added_to_list", at(0), wish),
      ev("game.added_to_list", at(2), favs),
      ev("game.added_to_list", at(4), wish),
    ]);
    // Interleaved lists: 3 singletons (chain broken twice).
    expect(items).toHaveLength(3);
    const sameList = groupActivities([
      ev("game.added_to_list", at(0), wish),
      ev("game.added_to_list", at(2), wish),
    ]);
    expect(sameList).toHaveLength(1);
    expect(sameList[0].title).toBe('2 jogos foram adicionados à lista "Wishlist".');
  });
});

describe("logical days and timezones", () => {
  it("23:59 + 00:01 UTC belong to different days", () => {
    const items = groupActivities([
      fav("2026-09-21T23:59:00.000Z"),
      fav("2026-09-22T00:01:00.000Z"),
    ]);
    expect(items).toHaveLength(2);
  });

  it("the same pair groups under America/Sao_Paulo (both Sep 21 local)", () => {
    const items = groupActivities(
      [
        fav("2026-09-21T23:50:00.000Z"),
        fav("2026-09-22T00:10:00.000Z"),
      ],
      { timeZone: "America/Sao_Paulo" },
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("group");
  });

  it("formats detail times in the provided timezone", () => {
    const [item] = groupActivities([fav("2026-09-21T09:01:00.000Z")], {
      timeZone: "America/Sao_Paulo",
    });
    expect(item.expanded[0].time).toBe("06:01");
  });
});

describe("details derive from snapshots, members stay chronological", () => {
  it("preserves snapshots and orders members ascending", () => {
    const events = [
      fav(at(4), "Old Name"),
      fav(at(1), "First"),
    ];
    const [group] = groupActivities(events) as [ActivityGroup];
    expect(group.members.map((member) => member.game?.name)).toEqual([
      "First",
      "Old Name",
    ]);
    expect(group.expanded[0].text).toContain("First");
  });
});

describe("Top 10 presentation", () => {
  function top10Add(iso: string, name: string, position: number) {
    return ev("top10.added", iso, {
      game: { name },
      metadata: { position },
    });
  }

  function top10Remove(iso: string, name: string, reason: string) {
    return ev("top10.removed", iso, {
      game: { name },
      metadata: { position: 1, reason },
    });
  }

  it("groups multiple top10.added with positions in details", () => {
    const [group] = groupActivities([
      top10Add(at(0), "Chrono Trigger", 7),
      top10Add(at(3), "Resident Evil 4", 8),
      top10Add(at(6), "Ocarina of Time", 9),
    ]) as [ActivityGroup];
    expect(group.title).toBe("3 jogos foram adicionados ao seu Top 10.");
    expect(group.expanded.map((line) => line.text)).toEqual([
      "Chrono Trigger entrou no seu Top 10 (#7).",
      "Resident Evil 4 entrou no seu Top 10 (#8).",
      "Ocarina of Time entrou no seu Top 10 (#9).",
    ]);
  });

  it("groups removals only within the same reason", () => {
    const same = groupActivities([
      top10Remove(at(0), "A", "manual"),
      top10Remove(at(5), "B", "manual"),
    ]);
    expect(same).toHaveLength(1);
    expect(same[0].title).toBe("Você removeu 2 jogos do Top 10.");

    const mixed = groupActivities([
      top10Remove(at(0), "A", "manual"),
      top10Remove(at(5), "B", "unfavorited"),
    ]);
    expect(mixed).toHaveLength(2);
    expect(mixed[1].title).toBe("Você removeu A do Top 10.");
    expect(mixed[0].title).toBe(
      "B saiu do Top 10 porque deixou de ser favorito.",
    );
  });

  it("reorder without a Top 1 move uses the normal title", () => {
    const [item] = groupActivities([
      ev("top10.reordered", at(0), {
        metadata: {
          count: 3,
          moves: [
            {
              userGameId: "a".padStart(24, "0"),
              from: 2,
              to: 3,
              game: { name: "Game A" },
            },
            {
              userGameId: "b".padStart(24, "0"),
              from: 3,
              to: 2,
              game: { name: "Game B" },
            },
          ],
        },
      }),
    ]);
    expect(item.kind).toBe("single");
    expect(item.title).toBe("Seu Top 10 foi reorganizado.");
    expect(item.expanded.map((line) => line.text)).toEqual([
      "Game A #2 → #3",
      "Game B #3 → #2",
    ]);
  });

  it("a move with to === 1 uses the snapshot name in the Top 1 title", () => {
    const items = groupActivities([
      ev("top10.reordered", at(0), {
        metadata: {
          count: 3,
          moves: [
            {
              userGameId: "c".padStart(24, "0"),
              from: 4,
              to: 1,
              game: { name: "Ocarina of Time" },
            },
          ],
        },
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Ocarina of Time é seu Top 1 favorito!");
    expect(items[0].expanded.map((line) => line.text)).toEqual([
      "Ocarina of Time #4 → #1",
    ]);
  });

  it("legacy moves without snapshot fall back without live lookups", () => {
    const items = groupActivities([
      ev("top10.reordered", at(0), {
        metadata: {
          count: 2,
          moves: [{ userGameId: "c".padStart(24, "0"), from: 2, to: 1 }],
        },
      }),
    ]);
    expect(items).toHaveLength(1);
    // Generic title: history is never rebuilt from the current catalog.
    expect(items[0].title).toBe("Seu Top 10 tem um novo Top 1!");
    expect(items[0].expanded.map((line) => line.text)).toEqual([
      "Jogo desconhecido #2 → #1",
    ]);
  });

  it("uses move snapshot covers in reorder details", () => {
    const [item] = groupActivities([
      ev("top10.reordered", at(0), {
        metadata: {
          count: 2,
          moves: [
            {
              userGameId: "a".padStart(24, "0"),
              from: 4,
              to: 1,
              game: { name: "Ocarina", cover: "https://img.test/ocarina.png" },
            },
            {
              userGameId: "b".padStart(24, "0"),
              from: 1,
              to: 2,
              game: { name: "No Cover Game" },
            },
          ],
        },
      }),
    ]);
    expect(item.expanded).toHaveLength(2);
    expect(item.expanded[0]).toMatchObject({
      text: "Ocarina #4 → #1",
      cover: "https://img.test/ocarina.png",
    });
    // Missing cover omits the thumbnail without breaking the line.
    expect(item.expanded[1].text).toBe("No Cover Game #1 → #2");
    expect(item.expanded[1].cover).toBeUndefined();
  });

  it("ignores from === to noise in moves", () => {
    const [item] = groupActivities([
      ev("top10.reordered", at(0), {
        metadata: {
          count: 2,
          moves: [
            {
              userGameId: "a".padStart(24, "0"),
              from: 2,
              to: 2,
              game: { name: "Game A" },
            },
            {
              userGameId: "b".padStart(24, "0"),
              from: 1,
              to: 2,
              game: { name: "Game B" },
            },
          ],
        },
      }),
    ]);
    expect(item.expanded.map((line) => line.text)).toEqual(["Game B #1 → #2"]);
    expect(item.title).toBe("Seu Top 10 foi reorganizado.");
  });
});

describe("pagination equivalence", () => {
  it("concatenated pages regroup exactly like the full list", () => {
    const all: ActivityEventDTO[] = [];
    for (let minute = 0; minute < 25; minute += 5) {
      all.push(fav(at(minute)));
    }
    const page1 = all.slice(0, 20);
    const page2 = all.slice(20);
    expect(groupActivities([...page1, ...page2])).toEqual(groupActivities(all));
  });

  it("accepts DESC input and normalizes internally", () => {
    const all = [fav(at(0)), fav(at(5)), fav(at(40))];
    expect(groupActivities([...all].reverse())).toEqual(groupActivities(all));
  });
});
