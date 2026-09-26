"use client";

/**
 * Isolated Activity Feed preview components (E1.75).
 *
 * Small, local, mock-driven: expand/collapse and show-more are plain
 * `useState`. No providers, stores, API clients, pagination, or timers.
 * Messages, grouping, and day logic all come from the real
 * `features/activity` contracts — nothing is duplicated here.
 */

import { useState, type ReactNode } from "react";
import { formatFeedTime, hasTop1Move } from "./presentation";
import {
  groupItemsByDay,
  type DaySection,
  type ExpandedLine,
  type FeedItem,
} from "./grouping";
import RPGUIButton from "@/components/RPGUI/Button";

export type { DaySection };

const EXPANDED_PAGE_SIZE = 20;

function DetailLines({ lines }: { lines: ExpandedLine[] }) {
  const [visible, setVisible] = useState(EXPANDED_PAGE_SIZE);
  const shown = lines.slice(0, visible);
  return (
    <div className="mt-2 flex flex-col gap-1">
      {shown.map((line, index) => (
        <div
          key={`${line.time}-${index}`}
          className="flex items-center gap-2 text-sm"
        >
          <span className="shrink-0 text-sm opacity-70">{line.time}</span>
          {line.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={line.cover}
              alt=""
              aria-hidden="true"
              className="h-8 w-8 shrink-0 object-cover"
            />
          ) : null}
          <span className="min-w-0">{line.text}</span>
        </div>
      ))}
      {lines.length > visible && (
        <RPGUIButton
          className="mt-1 self-start"
          onClick={() => setVisible((count) => count + EXPANDED_PAGE_SIZE)}
          title={`Ver mais (${lines.length - visible} restantes)`}
        />
  
      )}
    </div>
  );
}

function ExpandToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <a
      type="button"
      className="mt-1 ms-4 text-amber-400 hover:underline font-bold cursor-pointer"
      onClick={onToggle}
    >
      {expanded ? "Recolher" : "Ver detalhes"}
    </a>
  );
}

function GroupSpan({
  item,
  timeZone,
}: {
  item: Extract<FeedItem, { kind: "group" }>;
  timeZone: string;
}) {
  const from = formatFeedTime(item.span.from, timeZone);
  const to = formatFeedTime(item.span.to, timeZone);
  return (
    <span className="text-sm opacity-70">
      {from === to ? from : `${from} — ${to}`}
    </span>
  );
}

function ItemTime({ iso, timeZone }: { iso: string | Date; timeZone: string }) {
  return (
    <span className="text-sm opacity-70 font-display">{formatFeedTime(iso, timeZone)}</span>
  );
}

/**
 * Single-game groups (every member shares one `userGameId` — always true
 * for `note.created`, whose semantic key includes the game) can open that
 * game directly. Multi-game groups stay expand-only: there is no single
 * game to open.
 */
function groupUserGameId(
  item: Extract<FeedItem, { kind: "group" }>,
): string | null {
  const first = item.members[0]?.userGameId;
  if (typeof first !== "string" || first.length === 0) return null;
  return item.members.every((member) => member.userGameId === first)
    ? first
    : null;
}

function GroupCard({
  item,
  timeZone,
  onOpenGame,
}: {
  item: Extract<FeedItem, { kind: "group" }>;
  timeZone: string;
  onOpenGame?: (userGameId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const gameId = groupUserGameId(item);
  return (
    <article className="rpgui-container framed p-3">
      <h3 className="font-display text-sm">{item.title}</h3>
      <div className="mt-2 flex items-center justify-between gap-2">
        <GroupSpan item={item} timeZone={timeZone} />
        <ExpandToggle
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
        />
      </div>
      {onOpenGame && gameId && (
        <a
          className="mt-1 ms-4 text-amber-400 hover:underline font-bold cursor-pointer"
          onClick={() => onOpenGame(gameId)}
        >
          Mostrar jogo
        </a>
      )}
      {expanded && <DetailLines lines={item.expanded} />}
    </article>
  );
}

function Top1Card({
  item,
  timeZone,
}: {
  item: Extract<FeedItem, { kind: "single" }>;
  timeZone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="p-1">
      <h3 className="font-display text-sm"> <ItemTime iso={item.span.from} timeZone={timeZone} /> ★ {item.title}<ExpandToggle
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
        /></h3>

      {expanded && <DetailLines lines={item.expanded} />}
    </article>
  );
}

function SingleRow({
  item,
  timeZone,
  onOpenGame,
}: {
  item: Extract<FeedItem, { kind: "single" }>;
  timeZone: string;
  onOpenGame?: (userGameId: string) => void;
}) {
  const first = item.members[0];
  if (first.type === "top10.reordered" && hasTop1Move(first)) {
    return <Top1Card item={item} timeZone={timeZone} />;
  }
  return (
    <article className="px-1 py-1 ">
      <p className="text-md">
        {" "}
        <ItemTime iso={item.span.from} timeZone={timeZone} /> • {item.title}{" "}
        {onOpenGame && first.userGameId && (
          <a
            className=" text-amber-400 hover:underline font-bold cursor-pointer"
            onClick={() => onOpenGame(first.userGameId as string)}
          >
            Mostrar jogo
          </a>
        )}
      </p>
    </article>
  );
}

function FeedEntry({
  item,
  timeZone,
  onOpenGame,
}: {
  item: FeedItem;
  timeZone: string;
  onOpenGame?: (userGameId: string) => void;
}) {
  if (item.kind === "group")
    return (
      <GroupCard item={item} timeZone={timeZone} onOpenGame={onOpenGame} />
    );
  return <SingleRow item={item} timeZone={timeZone} onOpenGame={onOpenGame} />;
}

export function ActivityFeed({
  items,
  timeZone,
  footer,
  onOpenGame,
}: {
  items: FeedItem[];
  timeZone: string;
  /** Optional pagination footer (e.g. HomeFeed's "Carregar mais"). */
  footer?: ReactNode;
  /** When provided, single-item rows expose an "Abrir jogo" action. */
  onOpenGame?: (userGameId: string) => void;
}) {
  const sections = groupItemsByDay(items, timeZone);
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <section key={section.key} aria-label={section.heading} className="rpgui-container framed-grey p-3">
          <h2 className="font-display text-md ps-2 mt-2 ">{section.heading}</h2>
                    <hr className="my-4 golden" />
          <div className="flex flex-col gap-2">
            {section.items.map((item) => (
              <FeedEntry
                key={item.members.map((member) => member._id).join("+")}
                item={item}
                timeZone={timeZone}
                onOpenGame={onOpenGame}
              />
            ))}
          </div>

        </section>
      ))}
      {footer}
    </div>
  );
}

export function FeedEmpty() {
  return (
    <div className="rpgui-container framed-grey p-4">
      <h2 className="font-display text-lg">Seu Diário</h2>
      <p className="mt-2 text-sm">Sua jornada começa aqui.</p>
      <p className="text-sm opacity-70">
        Suas atividades aparecerão aqui conforme você usar o Save State.
      </p>
    </div>
  );
}

export function FeedLoading() {
  return (
    <div
      className="rpgui-container framed-grey p-4"
      aria-busy="true"
      aria-label="Carregando diário"
    >
      <h2 className="font-display text-lg">Seu Diário</h2>
      <div className="mt-2 flex flex-col gap-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rpgui-container framed animate-pulse p-3">
            <div className="h-4 w-3/4 opacity-30">…</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rpgui-container framed-grey p-4">
      <h2 className="font-display text-lg">Seu Diário</h2>
      <p role="alert" className="mt-2 text-sm">
        Não foi possível carregar seu diário.
      </p>
      <RPGUIButton title="Tentar novamente" className="mt-2" onClick={onRetry} />
        

    </div>
  );
}

/** Local mock of the error → retry flow (no requests involved). */
export function FeedErrorDemo({
  items,
  timeZone,
}: {
  items: FeedItem[];
  timeZone: string;
}) {
  const [failed, setFailed] = useState(true);
  if (!failed) return <ActivityFeed items={items} timeZone={timeZone} />;
  return <FeedError onRetry={() => setFailed(false)} />;
}
