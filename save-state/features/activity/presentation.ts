/**
 * Activity Presentation Registry (client-safe, pure).
 *
 * Separation of concerns:
 *
 * ```text
 * schemas/activity.ts  → "what happened?" (domain, Zod-validated)
 * features/activity/*  → "how do we tell the user?" (presentation)
 * ```
 *
 * This module never touches the database, the current library state, or
 * any catalog: every message renders exclusively from the event snapshot.
 * History is told from what was frozen at event time, never from what the
 * library looks like today.
 *
 * Isolation note: only `import type` is used from `@/schemas/activity`
 * (fully erased at compile time). There is intentionally no runtime import
 * of server-only, Mongoose, React, or Next.js code here.
 */

import type { ActivityType } from "@/schemas/activity";

/** Minimal event shape the presentation layer consumes (DTO, not Mongoose). */
export interface ActivityEventDTO {
  _id: string;
  type: string;
  userId?: string;
  userGameId?: string | null;
  game?: { name: string; cover?: string | null } | null;
  list?: { listId?: string; name: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string | Date;
}

/** Maximum gap between consecutive events of the same chain (minutes). */
export const GROUP_GAP_MINUTES = 30;

export const UNKNOWN_ACTIVITY_MESSAGE = "Atividade registrada.";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function meta(event: ActivityEventDTO): Record<string, unknown> {
  return asRecord(event.metadata);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function gameName(event: ActivityEventDTO): string {
  return event.game?.name ?? "um jogo";
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Logical day (`YYYY-MM-DD`) of an instant in the presentation timezone.
 * Single source for day sections AND grouping — components must not
 * recompute days independently.
 */
export function logicalDayKey(value: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(toDate(value));
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}`;
}

/** `"21 de setembro de 2026"` in the presentation timezone. */
export function formatDayHeading(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(toDate(value));
}

/** `"09:14"` in the presentation timezone. */
export function formatFeedTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}

export function listName(event: ActivityEventDTO): string {
  return event.list?.name ?? "uma lista";
}

export interface PresentationRule {
  groupable: boolean;
  semanticKey?: (event: ActivityEventDTO) => string;
  singular: (event: ActivityEventDTO) => string;
  plural?: (count: number, first: ActivityEventDTO) => string;
}

function ratingSingular(event: ActivityEventDTO): string {
  const game = gameName(event);
  const data = meta(event);
  const to = "to" in data ? (data.to as number | null) : null;
  const from = "from" in data ? (data.from as number | null) : null;
  if (to === null || to === undefined) return `Você removeu a nota de ${game}.`;
  if (from === null || from === undefined) return `Você avaliou ${game} com ${to}.`;
  return `Você mudou a nota de ${game} de ${from} para ${to}.`;
}

function achievementsSingular(event: ActivityEventDTO): string {
  const game = gameName(event);
  const data = meta(event);
  const from = asRecord(data.from);
  const to = asRecord(data.to);
  const wasEnabled = from.enabled === true;
  const isEnabled = to.enabled === true;
  if (!wasEnabled && isEnabled) {
    const progress = num(asRecord(to).progress);
    return `Você começou a buscar conquistas em ${game} (${progress ?? 0}%).`;
  }
  if (wasEnabled && !isEnabled) {
    return `Você parou de buscar conquistas em ${game}.`;
  }
  const progress = num(to.progress);
  if (progress === null) return `Você atualizou as conquistas de ${game}.`;
  return `Você atualizou o progresso de conquistas de ${game} para ${progress}%.`;
}

function top10RemovedReason(event: ActivityEventDTO): string {
  return str(meta(event).reason) ?? "manual";
}

function top10RemovedSingular(event: ActivityEventDTO): string {
  const game = gameName(event);
  switch (top10RemovedReason(event)) {
    case "unfavorited":
      return `${game} saiu do Top 10 porque deixou de ser favorito.`;
    case "game_deleted":
      return `${game} saiu do Top 10 porque foi removido da biblioteca.`;
    default:
      return `Você removeu ${game} do Top 10.`;
  }
}

export function top10RemovedPluralWithReason(
  count: number,
  reason: string,
): string {
  switch (reason) {
    case "unfavorited":
      return `${count} jogos saíram do Top 10 porque deixaram de ser favoritos.`;
    case "game_deleted":
      return `${count} jogos saíram do Top 10 porque foram removidos da biblioteca.`;
    default:
      return `Você removeu ${count} jogos do Top 10.`;
  }
}

export interface ReorderMove {
  userGameId: string;
  from: number;
  to: number;
  /** Frozen snapshot (required for new events). Legacy events without it
   * fall back to positional display — never to a live catalog lookup. */
  game?: { name?: unknown; cover?: unknown } | null;
}

/** Explicit historical fallback: integrity over invention. */
export const UNKNOWN_MOVE_GAME_NAME = "Jogo desconhecido";

export function moveGameName(move: ReorderMove): string {
  return typeof move.game?.name === "string" && move.game.name.length > 0
    ? move.game.name
    : UNKNOWN_MOVE_GAME_NAME;
}

/** Defensive parsing: presentation never trusts metadata shapes blindly. */
export function reorderMoves(event: ActivityEventDTO): ReorderMove[] {
  const moves = meta(event).moves;
  if (!Array.isArray(moves)) return [];
  const parsed: ReorderMove[] = [];
  for (const move of moves) {
    const record = asRecord(move);
    const userGameId = str(record.userGameId);
    const from = num(record.from);
    const to = num(record.to);
    if (userGameId === null || from === null || to === null) continue;
    if (from === to) continue;
    const game = asRecord(record.game);
    parsed.push({
      userGameId,
      from,
      to,
      game: typeof game.name === "string" ? game : undefined,
    });
  }
  return parsed;
}

function top1Move(event: ActivityEventDTO): ReorderMove | undefined {
  return reorderMoves(event).find((move) => move.to === 1);
}

export function hasTop1Move(event: ActivityEventDTO): boolean {
  return top1Move(event) !== undefined;
}

/**
 * Causal Top 1 title: the name comes from the move snapshot frozen at
 * reorder time. A legacy move without snapshot keeps the generic title —
 * history is never rebuilt from the current catalog.
 */
export function reorderedTitle(event: ActivityEventDTO): string {
  const top1 = top1Move(event);
  if (!top1) return "Seu Top 10 foi reorganizado.";
  const name =
    typeof top1.game?.name === "string" && top1.game.name.length > 0
      ? top1.game.name
      : null;
  if (!name) return "Seu Top 10 tem um novo Top 1!";
  return `${name} é seu Top 1 favorito!`;
}

export const PRESENTATION_REGISTRY: Record<ActivityType, PresentationRule> = {
  "game.added": {
    groupable: true,
    semanticKey: () => "game.added",
    singular: (event) => `Você adicionou ${gameName(event)} à biblioteca.`,
    plural: (count) => `${count} jogos foram adicionados à biblioteca.`,
  },
  "game.removed": {
    groupable: false,
    singular: (event) => `Você removeu ${gameName(event)} da biblioteca.`,
  },
  "game.status_changed": {
    groupable: false,
    singular: (event) => {
      const data = meta(event);
      return `Você mudou o status de ${gameName(event)} de ${str(data.from) ?? "?"} para ${str(data.to) ?? "?"}.`;
    },
  },
  "game.finished": {
    groupable: true,
    semanticKey: () => "game.finished",
    singular: (event) => {
      const times = num(meta(event).timesFinished);
      return `Você zerou ${gameName(event)}. Vezes zerado: ${times ?? 1}.`;
    },
    plural: (count) => `Você terminou ${count} jogos.`,
  },
  "game.times_finished_changed": {
    groupable: false,
    singular: (event) => {
      const data = meta(event);
      return `Você ajustou as vezes zeradas de ${gameName(event)} de ${num(data.from) ?? "?"} para ${num(data.to) ?? "?"}.`;
    },
  },
  "game.favorited": {
    groupable: true,
    semanticKey: () => "game.favorited",
    singular: (event) => `${gameName(event)} é um dos seus jogos favoritos!`,
    plural: (count) => `${count} jogos foram adicionados aos favoritos.`,
  },
  "game.unfavorited": {
    groupable: true,
    semanticKey: () => "game.unfavorited",
    singular: (event) => `Você removeu ${gameName(event)} dos favoritos.`,
    plural: (count) => `${count} jogos foram removidos dos favoritos.`,
  },
  "game.completed": {
    groupable: true,
    semanticKey: () => "game.completed",
    singular: (event) => `Você concluiu ${gameName(event)} 100%.`,
    plural: (count) => `${count} jogos foram concluídos 100%.`,
  },
  "game.uncompleted": {
    groupable: true,
    semanticKey: () => "game.uncompleted",
    singular: (event) => `Você desmarcou ${gameName(event)} como 100% concluído.`,
    plural: (count) => `${count} jogos deixaram os 100%.`,
  },
  "game.rating_changed": {
    groupable: false,
    singular: ratingSingular,
  },
  "game.hours_changed": {
    groupable: false,
    singular: (event) => {
      const data = meta(event);
      return `Você atualizou as horas de ${gameName(event)} de ${num(data.from) ?? "?"} para ${num(data.to) ?? "?"}.`;
    },
  },
  "game.achievements_changed": {
    groupable: false,
    singular: achievementsSingular,
  },
  // Backend contract completion for `note.created` (renderer copy for the
  // frontend phase lives here only because the registry is total over
  // ActivityType; visual behavior is unchanged otherwise).
  "note.created": {
    groupable: true,
    semanticKey: (event) => `note.created\n${event.userGameId ?? "?"}`,
    singular: (event) => `Você adicionou uma anotação em ${gameName(event)}.`,
    plural: (count) => `Você adicionou ${count} anotações.`,
  },
  "game.added_to_list": {
    groupable: true,
    semanticKey: (event) =>
      `game.added_to_list\n${event.list?.listId ?? listName(event)}`,
    singular: (event) =>
      `Você adicionou ${gameName(event)} à lista "${listName(event)}".`,
    plural: (count, first) =>
      `${count} jogos foram adicionados à lista "${listName(first)}".`,
  },
  "game.removed_from_list": {
    groupable: true,
    semanticKey: (event) =>
      `game.removed_from_list\n${event.list?.listId ?? listName(event)}`,
    singular: (event) =>
      `Você removeu ${gameName(event)} da lista "${listName(event)}".`,
    plural: (count, first) =>
      `${count} jogos foram removidos da lista "${listName(first)}".`,
  },
  "list.created": {
    groupable: false,
    singular: (event) => `Você criou a lista "${listName(event)}".`,
  },
  "list.renamed": {
    groupable: false,
    singular: (event) => {
      const data = meta(event);
      return `Você renomeou a lista "${str(data.from) ?? "?"}" para "${str(data.to) ?? "?"}".`;
    },
  },
  "list.deleted": {
    groupable: false,
    singular: (event) => {
      const count = num(meta(event).memberCount);
      const suffix =
        count === null ? "" : ` (${count} ${count === 1 ? "jogo" : "jogos"})`;
      return `Você excluiu a lista "${listName(event)}"${suffix}.`;
    },
  },
  "top10.added": {
    groupable: true,
    semanticKey: () => "top10.added",
    singular: (event) => {
      const position = num(meta(event).position);
      return `${gameName(event)} entrou no seu Top 10 (${position !== null ? `#${position}` : "posição desconhecida"}).`;
    },
    plural: (count) => `${count} jogos foram adicionados ao seu Top 10.`,
  },
  "top10.removed": {
    groupable: true,
    semanticKey: (event) => `top10.removed\n${top10RemovedReason(event)}`,
    singular: top10RemovedSingular,
    plural: (count, first) =>
      top10RemovedPluralWithReason(count, top10RemovedReason(first)),
  },
  "top10.reordered": {
    groupable: false,
    singular: reorderedTitle,
  },
};

export function presentationRuleFor(
  type: string,
): PresentationRule | undefined {
  return (PRESENTATION_REGISTRY as Record<string, PresentationRule>)[type];
}

export function singularMessage(event: ActivityEventDTO): string {
  return presentationRuleFor(event.type)?.singular(event) ?? UNKNOWN_ACTIVITY_MESSAGE;
}
