/**
 * Pure chronological grouping: `ActivityEvent[] → FeedItem[]`.
 *
 * Single-pass over ascending `(createdAt, _id)` order. An event extends the
 * immediately previous pending group only when all hold:
 *
 * 1. same groupable type/direction with a semantic key;
 * 2. identical semantic key;
 * 3. same logical day (explicit `timeZone`, UTC storage untouched);
 * 4. gap to the previous event ≤ `GROUP_GAP_MINUTES` (chain, not window);
 * 5. no interleaving event in between (anything else flushes the pending
 *    group — there is no global collection by type).
 *
 * No persistence, no MongoDB, no current-state lookups, no React, no
 * timers. Same input always yields same output (retroactive by design).
 */

import {
  formatDayHeading,
  formatFeedTime,
  GROUP_GAP_MINUTES,
  logicalDayKey,
  moveGameName,
  presentationRuleFor,
  reorderMoves,
  singularMessage,
  type ActivityEventDTO,
} from "./presentation";

export type { ActivityEventDTO };

export interface ActivitySpan {
  from: Date;
  to: Date;
}

export interface ExpandedLine {
  /** Local `HH:mm` rendering of the member's `createdAt`. */
  time: string;
  /** Singular message (or, for reorders, one `#from → #to` move line). */
  text: string;
  /** Snapshot cover when the member carries one. */
  cover?: string;
}

export interface ActivityGroup {
  kind: "group";
  title: string;
  count: number;
  span: ActivitySpan;
  members: ActivityEventDTO[];
  expanded: ExpandedLine[];
  canExpand: true;
}

export interface ActivitySingle {
  kind: "single";
  title: string;
  count: 1;
  span: ActivitySpan;
  members: [ActivityEventDTO];
  expanded: ExpandedLine[];
  canExpand: false;
}

export type FeedItem = ActivityGroup | ActivitySingle;

export interface GroupActivitiesOptions {
  /** IANA timezone for logical days and times. Defaults to `"UTC"`. */
  timeZone?: string;
}

const GAP_MS = GROUP_GAP_MINUTES * 60 * 1000;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Shared continuation predicate (single source for grouping AND
 * pagination peek): `current` extends a chain ending in `previous` iff
 * same groupable type/direction, identical semantic key, same logical
 * day, and gap ≤ `GROUP_GAP_MINUTES` — always against the immediately
 * previous event, never the first of the chain.
 */
export function canExtendGroup(
  previous: ActivityEventDTO,
  current: ActivityEventDTO,
  timeZone: string,
): boolean {
  const rule = presentationRuleFor(current.type);
  if (!rule?.groupable || !rule.semanticKey || !rule.plural) return false;
  const previousRule = presentationRuleFor(previous.type);
  if (
    !previousRule?.groupable ||
    !previousRule.semanticKey ||
    !previousRule.plural
  ) {
    return false;
  }
  if (`${current.type}\n${rule.semanticKey(current)}` !==
      `${previous.type}\n${previousRule.semanticKey(previous)}`) {
    return false;
  }
  if (
    dayKey(previous.createdAt, timeZone) !== dayKey(current.createdAt, timeZone)
  ) {
    return false;
  }
  return (
    toDate(current.createdAt).getTime() - toDate(previous.createdAt).getTime() <=
    GAP_MS
  );
}

function dayKey(value: string | Date, timeZone: string): string {
  return logicalDayKey(value, timeZone);
}

function formatTime(value: string | Date, timeZone: string): string {
  return formatFeedTime(value, timeZone);
}

function compareEvents(
  first: ActivityEventDTO,
  second: ActivityEventDTO,
): number {
  const time = toDate(first.createdAt).getTime() - toDate(second.createdAt).getTime();
  if (time !== 0) return time;
  return first._id < second._id ? -1 : first._id > second._id ? 1 : 0;
}

function expandedLine(
  event: ActivityEventDTO,
  timeZone: string,
): ExpandedLine {
  const line: ExpandedLine = {
    time: formatTime(event.createdAt, timeZone),
    text: singularMessage(event),
  };
  if (event.game?.cover) line.cover = event.game.cover;
  return line;
}

function reorderedExpanded(
  event: ActivityEventDTO,
  timeZone: string,
): ExpandedLine[] {
  const time = formatTime(event.createdAt, timeZone);
  // Historical details come exclusively from the frozen move snapshots:
  // name, positions, and cover. Missing covers simply omit the thumbnail
  // (same fallback as every other detail line) — never a live lookup.
  return reorderMoves(event).map((move) => {
    const cover =
      typeof move.game?.cover === "string" && move.game.cover.length > 0
        ? move.game.cover
        : undefined;
    return {
      time,
      text: `${moveGameName(move)} #${move.from} → #${move.to}`,
      ...(cover ? { cover } : {}),
    };
  });
}

function makeSingle(
  event: ActivityEventDTO,
  timeZone: string,
): ActivitySingle {
  const createdAt = toDate(event.createdAt);
  return {
    kind: "single",
    title: singularMessage(event),
    count: 1,
    span: { from: createdAt, to: createdAt },
    members: [event],
    expanded:
      event.type === "top10.reordered"
        ? reorderedExpanded(event, timeZone)
        : [expandedLine(event, timeZone)],
    canExpand: false,
  };
}

function makeGroup(
  members: ActivityEventDTO[],
  title: string,
  timeZone: string,
): ActivityGroup {
  return {
    kind: "group",
    title,
    count: members.length,
    span: {
      from: toDate(members[0].createdAt),
      to: toDate(members[members.length - 1].createdAt),
    },
    members,
    expanded: members.map((member) => expandedLine(member, timeZone)),
    canExpand: true,
  };
}

export function groupActivities(
  events: ActivityEventDTO[],
  options?: GroupActivitiesOptions,
): FeedItem[] {
  const timeZone = options?.timeZone ?? "UTC";
  const sorted = [...events].sort(compareEvents);
  const items: FeedItem[] = [];
  let pending: ActivityEventDTO[] = [];

  function flush(): void {
    if (pending.length >= 2) {
      const first = pending[0];
      const rule = presentationRuleFor(first.type);
      const title = rule?.plural?.(pending.length, first) ?? singularMessage(first);
      items.push(makeGroup(pending, title, timeZone));
    } else if (pending.length === 1) {
      items.push(makeSingle(pending[0], timeZone));
    }
    pending = [];
  }

  for (const event of sorted) {
    const previous = pending[pending.length - 1];
    if (previous && canExtendGroup(previous, event, timeZone)) {
      pending.push(event);
    } else {
      flush();
      pending = [event];
    }
  }
  flush();
  // Feed order: newest first. Groups never overlap in time (sequential
  // partition), so reversing the chronological pass is exact.
  return items.reverse();
}

export interface DaySection {
  key: string;
  heading: string;
  items: FeedItem[];
}

/**
 * Pure assembly: consecutive feed items sharing a logical day.
 * Uses the same `logicalDayKey` as grouping — components must not
 * recompute days independently.
 */
export function groupItemsByDay(
  items: FeedItem[],
  timeZone: string,
): DaySection[] {
  const sections: DaySection[] = [];
  for (const item of items) {
    const key = logicalDayKey(item.members[0].createdAt, timeZone);
    const current = sections[sections.length - 1];
    if (current && current.key === key) {
      current.items.push(item);
    } else {
      sections.push({
        key,
        heading: formatDayHeading(item.members[0].createdAt, timeZone),
        items: [item],
      });
    }
  }
  return sections;
}
