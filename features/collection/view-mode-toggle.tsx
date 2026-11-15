"use client";

import { useEffect, useState } from "react";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUISelect from "@/components/RPGUI/Select";
import type { CollectionViewMode } from "./collection-query";
import {
  DEFAULT_GRID_DENSITY,
  GRID_DENSITIES,
} from "@/features/shared/layout-mode";
import { useUiStore } from "@/features/shared/ui-store";

/**
 * Collection Foundation — reusable Card/List mode control.
 *
 * Presentational only: it renders the current mode and reports changes.
 * Ownership of the state (local useState now, URL query param from Fase 3
 * on) stays with the caller, never inside this control or a global store.
 */
export function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: CollectionViewMode;
  onChange: (mode: CollectionViewMode) => void;
}) {
  return (
    <>
      <RPGUIButton
        framed="grey"
        type="button"
        title="▦"
        className={`game-view-toggle ${viewMode === "grid" ? "down" : ""}`}
        onClick={() => onChange("grid")}
        aria-label="Ver em grade"
        aria-pressed={viewMode === "grid"}
      />
      <RPGUIButton
        framed="grey"
        type="button"
        title="☰"
        className={`game-view-toggle ${viewMode === "list" ? "down" : ""}`}
        onClick={() => onChange("list")}
        aria-label="Ver em lista"
        aria-pressed={viewMode === "list"}
      />
    </>
  );
}

/** Compact, global desktop density preference for every shared game grid. */
export function GridDensitySelect() {
  const density = useUiStore((state) => state.gridDensity);
  const setDensity = useUiStore((state) => state.setGridDensity);
  const [hydrated, setHydrated] = useState(false);

  // The parser-blocking root script applies the saved CSS attribute before
  // paint. Keep the server and first hydration markup at the same default;
  // reveal the stored select value after hydration without shifting the grid.
  useEffect(() => setHydrated(true), []);

  return (
    <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px]">
      <span>Colunas</span>
      <RPGUISelect
        aria-label="Densidade do grid no desktop"
        className="h-10! w-24! px-2! text-xs"
        value={hydrated ? density : DEFAULT_GRID_DENSITY}
        onChange={(event) => setDensity(Number(event.target.value) as typeof density)}
      >
        {GRID_DENSITIES.map((columns) => (
          <option key={columns} value={columns}>
            {columns}
          </option>
        ))}
      </RPGUISelect>
    </label>
  );
}
