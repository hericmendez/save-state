"use client";

import RPGUIButton from "@/components/RPGUI/Button";
import type { CollectionViewMode } from "./collection-query";

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
        type="button"
        title="▦"
        className={viewMode === "grid" ? "down" : ""}
        onClick={() => onChange("grid")}
        aria-label="Ver em grade"
      />
      <RPGUIButton
        type="button"
        title="☰"
        className={viewMode === "list" ? "down" : ""}
        onClick={() => onChange("list")}
        aria-label="Ver em lista"
      />
    </>
  );
}
