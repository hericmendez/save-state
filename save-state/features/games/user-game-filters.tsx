"use client";

import { GAME_STATUSES } from "@/schemas/games";
import type {
  CollectionOrder,
  CollectionQuery,
} from "@/features/collection/collection-query";

export const LIBRARY_ORDER_OPTIONS = [
  { value: "", label: "Padrão (recentes)" },
  { value: "title", label: "Título" },
  { value: "platform", label: "Plataforma" },
  { value: "releaseYear", label: "Ano de lançamento" },
  { value: "status", label: "Status" },
] as const;

export interface LibraryFilterDraft {
  platform: string;
  yearFrom: string;
  yearTo: string;
  status: string;
  orderBy: string;
  order: CollectionOrder;
}

export function toFilterDraft(query: CollectionQuery): LibraryFilterDraft {
  return {
    platform: query.platform,
    yearFrom: query.yearFrom === undefined ? "" : String(query.yearFrom),
    yearTo: query.yearTo === undefined ? "" : String(query.yearTo),
    status: query.status,
    orderBy: query.orderBy,
    order: query.order,
  };
}

/**
 * Minha Biblioteca — presentational filter bar over the current Save State
 * representation (no ATP taxonomy). Reports draft changes; the caller owns
 * committing them to the URL + server query.
 */
export function UserGameFilters({
  draft,
  onChange,
}: {
  draft: LibraryFilterDraft;
  onChange: (patch: Partial<LibraryFilterDraft>) => void;
}) {
  return (
    <div className="rpgui-container framed-grey flex flex-wrap items-end gap-2 p-3">
      <label className="flex flex-col gap-1 text-xs">
        Plataforma
        <input
          className="rpgui-input"
          type="text"
          value={draft.platform}
          placeholder="Ex.: N64"
          onChange={(event) => onChange({ platform: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Ano de
        <input
          className="rpgui-input w-24"
          type="number"
          inputMode="numeric"
          min={1000}
          max={9999}
          value={draft.yearFrom}
          placeholder="1990"
          onChange={(event) => onChange({ yearFrom: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Ano até
        <input
          className="rpgui-input w-24"
          type="number"
          inputMode="numeric"
          min={1000}
          max={9999}
          value={draft.yearTo}
          placeholder="2025"
          onChange={(event) => onChange({ yearTo: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Status
        <select
          className="rpgui-dropdown"
          value={draft.status}
          onChange={(event) => onChange({ status: event.target.value })}
        >
          <option value="">Todos</option>
          {GAME_STATUSES.map((status) => (
            <option key={status} value={status} className="capitalize">
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Ordenar por
        <select
          className="rpgui-dropdown"
          value={draft.orderBy}
          onChange={(event) => onChange({ orderBy: event.target.value })}
        >
          {LIBRARY_ORDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Ordem
        <select
          className="rpgui-dropdown"
          value={draft.order}
          onChange={(event) =>
            onChange({ order: event.target.value as CollectionOrder })
          }
        >
          <option value="asc">ASC</option>
          <option value="desc">DESC</option>
        </select>
      </label>
    </div>
  );
}
