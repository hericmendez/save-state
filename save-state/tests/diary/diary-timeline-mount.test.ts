import { readFileSync } from "fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T1 — Timeline initial-load regression test.
 *
 * The bug: the mount-once `firstLoad` gate plus the unmount cleanup that
 * aborts the in-flight request could strand the diary in "loading" with
 * empty items (StrictMode remount aborts fetch #1; the remount skips the
 * fetch because the gate is already consumed; the AbortError is swallowed
 * silently). Any later user action (view switch, filter, retry) issued a
 * fresh fetch into the shared `items` state, which is why switching to
 * Lista and back "fixed" the Timeline.
 *
 * There is no DOM renderer in this repo's test setup (vitest environment
 * is "node", no new dependencies allowed), so — following the repo's
 * established source-contract style (loading-ux, modal-dispatch) — this
 * test pins the exact lifecycle contract that makes mount → abort →
 * remount → refetch work, instead of duplicating the logic in a mock.
 */
const SOURCE_PATH = "features/diary/diary-view.tsx";

function source(): string {
  return readFileSync(path.resolve(SOURCE_PATH), "utf8");
}

describe("T1 — diary initial fetch recovers after an aborted mount", () => {
  it("mount effect is still gated (no duplicate initial fetches)", () => {
    const text = source();
    // The mount effect runs the initial query only when the gate is open…
    expect(text).toContain("if (firstLoad.current) {");
    // …and consumes the gate when it does.
    expect(text).toContain("firstLoad.current = false;");
  });

  it("unmount rearms the gate so a remount refetches (the fix)", () => {
    const text = source();
    // Narrow to the unmount cleanup effect (not fetchPage's abort call):
    // it must both abort the in-flight request and rearm the gate.
    const cleanupEffect = text.slice(text.indexOf("() => () => {"));
    expect(cleanupEffect).toContain("abortRef.current?.abort();");
    expect(cleanupEffect).toContain("firstLoad.current = true;");
  });

  it("aborted requests still resolve silently without touching state", () => {
    const text = source();
    // AbortError from a superseded request must not surface as an error…
    expect(text).toContain('err.name === "AbortError"');
    // …and stale responses must never overwrite newer ones (abortRef
    // identity guard in fetchPage).
    expect(text).toContain("if (abortRef.current !== controller) return;");
  });

  it("non-abort errors keep the existing error handling", () => {
    const text = source();
    expect(text).toContain('setStatus("error")');
    expect(text).toContain("Falha ao carregar");
  });

  it("filter, pagination and view switching still drive fresh fetches", () => {
    const text = source();
    // runQuery/commitToUrl path untouched: user actions always fetch.
    expect(text).toContain("void fetchPage(withoutCursor(next), null, false);");
    expect(text).toContain("onClick={() => updateFilters({ view: ");
  });
});

describe("T2 — activity cards use framed-grey", () => {
  it("GroupCard renders rpgui-container framed-grey (Home and diary share it)", () => {
    const feed = readFileSync(
      path.resolve("features/activity/activity-feed.tsx"),
      "utf8",
    );
    const groupCardStart = feed.indexOf("function GroupCard(");
    expect(groupCardStart).toBeGreaterThan(-1);
    const groupCardBlock = feed.slice(groupCardStart, groupCardStart + 1200);
    expect(groupCardBlock).toContain("rpgui-container framed-grey p-3");
    expect(groupCardBlock).not.toMatch(/framed(?!-)/);
  });

  it("leaves skeletons, error boxes and list rows untouched", () => {
    const feed = readFileSync(
      path.resolve("features/activity/activity-feed.tsx"),
      "utf8",
    );
    // Loading skeleton keeps its own framed style.
    expect(feed).toContain("rpgui-container framed animate-pulse p-3");
    const diary = readFileSync(
      path.resolve("features/diary/diary-view.tsx"),
      "utf8",
    );
    // List-view rows keep framed-golden.
    expect(diary).toContain("rpgui-container framed-golden grid");
  });
});
