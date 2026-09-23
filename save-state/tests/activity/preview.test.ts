import { describe, expect, it } from "vitest";
import { parseActivityEvent } from "@/schemas/activity";
import { groupActivities, groupItemsByDay } from "@/features/activity/grouping";
import {
  PREVIEW_EVENTS_WITH_LISTS,
  PREVIEW_TIME_ZONE,
} from "@/features/activity/fixtures";

const TZ = PREVIEW_TIME_ZONE;

function grouped() {
  return groupActivities(PREVIEW_EVENTS_WITH_LISTS, { timeZone: TZ });
}

describe("preview fixtures", () => {
  it("every known-type event satisfies the domain schemas", () => {
    const known = PREVIEW_EVENTS_WITH_LISTS.filter(
      (event) => event.type !== "future.unknown",
    );
    expect(known.length).toBeGreaterThan(20);
    for (const event of known) {
      expect(() =>
        parseActivityEvent({
          type: event.type,
          ...(event.userGameId ? { userGameId: event.userGameId } : {}),
          ...(event.game ? { game: event.game } : {}),
          ...(event.list ? { list: event.list } : {}),
          metadata: event.metadata,
        }),
      ).not.toThrow();
    }
  });

  it("uses fixed timestamps and unique ids", () => {
    const stamps = PREVIEW_EVENTS_WITH_LISTS.map((event) =>
      new Date(event.createdAt).getTime(),
    );
    expect(stamps.every(Number.isFinite)).toBe(true);
    expect(
      stamps.every(
        (time) => time >= Date.UTC(2026, 0, 1) && time < Date.UTC(2027, 0, 1),
      ),
    ).toBe(true);
    const ids = PREVIEW_EVENTS_WITH_LISTS.map((event) => event._id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("preview grouping", () => {
  it("groups the four morning favorites into one visual", () => {
    const items = grouped();
    const group = items.find(
      (item) => item.title === "4 jogos foram adicionados aos favoritos.",
    );
    expect(group?.kind).toBe("group");
    expect(group?.count).toBe(4);
  });

  it("keeps time-separated favorites apart", () => {
    const items = grouped();
    const singles = items.filter(
      (item) =>
        item.kind === "single" &&
        item.title.includes("é um dos seus jogos favoritos"),
    );
    // Hollow (10:00), Slay (11:06, chain broken by finished), and the two
    // midnight singles. Celeste (10:45) chains with 11:00/11:02 (gaps ≤30).
    expect(singles.map((item) => item.title)).toEqual([
      "After Hours é um dos seus jogos favoritos!",
      "Midnight Oil é um dos seus jogos favoritos!",
      "Slay the Spire é um dos seus jogos favoritos!",
      "Hollow Knight é um dos seus jogos favoritos!",
    ]);
  });

  it("does not reconnect favorites across a finished event", () => {
    const items = grouped();
    const group = items.find(
      (item) =>
        item.kind === "group" &&
        item.members.some((member) => member.game?.name === "Hades"),
    );
    expect(group?.kind).toBe("group");
    expect(group?.count).toBe(3);
    expect(
      group && "members" in group
        ? group.members.map((member) => member.game?.name)
        : [],
    ).toEqual(["Celeste", "Hades", "Dead Cells"]);
  });

  it("groups the three finished games", () => {
    const items = grouped();
    expect(
      items.find((item) => item.title === "Você terminou 3 jogos."),
    ).toBeDefined();
  });

  it("keeps the status change as a singleton", () => {
    const items = grouped();
    const status = items.find((item) =>
      item.title.includes("mudou o status"),
    );
    expect(status?.kind).toBe("single");
    expect(status?.title).toContain("stalled");
  });

  it("groups same-list membership and isolates the other list", () => {
    const items = grouped();
    expect(
      items.find(
        (item) =>
          item.title === '3 jogos foram adicionados à lista "Favoritos para jogar".',
      )?.kind,
    ).toBe("group");
    const other = items.find((item) =>
      item.title.includes('"Wishlist"'),
    );
    expect(other?.kind).toBe("single");
  });

  it("groups top10.added and separates removals by reason", () => {
    const items = grouped();
    expect(
      items.find(
        (item) => item.title === "3 jogos foram adicionados ao seu Top 10.",
      )?.kind,
    ).toBe("group");
    expect(
      items.find((item) => item.title === "Você removeu 2 jogos do Top 10."),
    ).toBeDefined();
    const unfavorited = items.find((item) =>
      item.title.includes("deixou de ser favorito"),
    );
    expect(unfavorited?.kind).toBe("single");
    expect(unfavorited?.title).toBe(
      "Game Unfav saiu do Top 10 porque deixou de ser favorito.",
    );
    const deleted = items.find((item) =>
      item.title.includes("foi removido da biblioteca"),
    );
    expect(deleted?.kind).toBe("single");
    expect(deleted?.title).toBe(
      "Game Deleted saiu do Top 10 porque foi removido da biblioteca.",
    );
  });

  it("names the Top 1 from the move snapshot", () => {
    const items = grouped();
    const top1 = items.find((item) => item.title.includes("Top 1 favorito"));
    expect(top1?.title).toBe(
      "The Legend of Zelda: Ocarina of Time é seu Top 1 favorito!",
    );
    expect(
      top1?.expanded.map((line) => line.text),
    ).toContain("The Legend of Zelda: Ocarina of Time #4 → #1");
    const normal = items.find(
      (item) => item.title === "Seu Top 10 foi reorganizado.",
    );
    expect(normal).toBeDefined();
  });

  it("splits midnight across logical days", () => {
    const sections = groupItemsByDay(grouped(), TZ);
    const headings = sections.map((section) => section.heading);
    expect(headings).toContain("20 de setembro de 2026");
    expect(headings).toContain("21 de setembro de 2026");
    expect(headings).toContain("22 de setembro de 2026");
  });

  it("renders the unknown event with fallback instead of breaking", () => {
    const items = grouped();
    const unknown = items.find(
      (item) => item.title === "Atividade registrada.",
    );
    expect(unknown?.kind).toBe("single");
    // The whole feed still groups normally around it.
    expect(items.length).toBeGreaterThan(10);
  });

  it("is deterministic across runs", () => {
    expect(grouped()).toEqual(grouped());
  });
});
