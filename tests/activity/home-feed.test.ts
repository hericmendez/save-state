import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendFeedPage,
  buildFeedUrl,
  FEED_PAGE_LIMIT,
  resolveTimeZone,
  type FeedPageDTO,
} from "@/features/activity/feed-client";
import type { FeedItem } from "@/features/activity/grouping";

function single(id: string, title: string): FeedItem {
  const createdAt = "2026-09-21T12:00:00.000Z";
  return {
    kind: "single",
    title,
    count: 1,
    span: { from: new Date(createdAt), to: new Date(createdAt) },
    members: [
      {
        _id: id,
        type: "game.favorited",
        game: { name: title },
        metadata: {},
        createdAt,
      },
    ],
    expanded: [{ time: "09:00", text: title }],
    canExpand: false,
  };
}

describe("feed-client pure rules", () => {
  it("resolves a usable timezone with UTC fallback", () => {
    const timeZone = resolveTimeZone();
    expect(typeof timeZone).toBe("string");
    expect(timeZone.length).toBeGreaterThan(0);
  });

  it("builds first-page and cursor URLs without interpreting the cursor", () => {
    expect(buildFeedUrl(10, "America/Sao_Paulo", null)).toBe(
      "/api/activity?limit=10&timeZone=America%2FSao_Paulo",
    );
    const opaque = "abc.def+ghi/jkl=";
    const url = buildFeedUrl(10, "UTC", opaque);
    expect(url).toContain(`cursor=${encodeURIComponent(opaque)}`);
    expect(url).toContain("timeZone=UTC");
  });

  it("appends pages without replacing or reordering", () => {
    const current = [single("a", "A"), single("b", "B")];
    const page: FeedPageDTO = {
      data: [single("c", "C")],
      pagination: { limit: 10, hasMore: true, nextCursor: "cursor-1" },
    };
    const merged = appendFeedPage(current, page);
    expect(merged.items.map((item) => item.title)).toEqual(["A", "B", "C"]);
    expect(merged.nextCursor).toBe("cursor-1");
    expect(merged.hasMore).toBe(true);
    // Inputs untouched (no regroup, no mutation).
    expect(current).toHaveLength(2);
  });

  it("ends pagination on null cursors", () => {
    const merged = appendFeedPage([], {
      data: [],
      pagination: { limit: 10, hasMore: false, nextCursor: null },
    });
    expect(merged.items).toEqual([]);
    expect(merged.hasMore).toBe(false);
    expect(merged.nextCursor).toBeNull();
  });

  it("uses the project page size", () => {
    expect(FEED_PAGE_LIMIT).toBe(10);
  });
});

describe("HomeFeed wiring (static seam checks, no DOM infra)", () => {
  const homeFeedSource = readFileSync(
    new URL("../../features/activity/home-feed.tsx", import.meta.url),
    "utf8",
  );

  it("fetches through apiRequest without regrouping or raw fetch", () => {
    expect(homeFeedSource).toContain("apiRequest");
    // No import and no call of the grouping projection (mentions in
    // comments/docs are fine — this guards executable references).
    expect(homeFeedSource).not.toMatch(/import[^;]*groupActivities/);
    expect(homeFeedSource).not.toMatch(/groupActivities\(/);
    expect(homeFeedSource).not.match(/(^|[^a-zA-Z])fetch\(/);
  });

  it("keeps one fixed timezone for every page", () => {
    // Single resolution stored in state; every URL builder call reuses it.
    expect(homeFeedSource).toContain("useState<string>(resolveTimeZone)");
    expect(homeFeedSource.match(/buildFeedUrl\(limit, timeZone/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("guards concurrent load-more requests", () => {
    expect(homeFeedSource).toContain("loadingMoreRef");
    expect(homeFeedSource).toContain("disabled={loadingMore}");
  });
});
