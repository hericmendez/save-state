// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Collection } from "@/features/games/collection";
import { GameCardFrame } from "@/features/games/game-card-frame";
import { useUiStore } from "@/features/shared/ui-store";
import { PREFERENCE_STYLESHEET_ID } from "@/features/shared/layout-mode";
import type { CollectionViewMode } from "@/features/collection/collection-query";

const longTitle =
  "The Extremely Long Role-Playing Game Title With A Subtitle That Must Remain Readable";
const specialTitle = "NieR:Automata™ — 星のカービィ";

function TestCollection() {
  const [viewMode, setViewMode] = useState<CollectionViewMode>("grid");
  return (
    <Collection
      items={[longTitle, "Short game", specialTitle]}
      getItemKey={(title) => title}
      renderGridItem={(title) => (
        <GameCardFrame
          presentation={{
            id: title,
            title,
            coverUrl: null,
            subtitle: "1998 · Super Nintendo",
            metaLines: ["Zerado 2×"],
            isFavorite: true,
          }}
          onDetails={vi.fn()}
        />
      )}
      renderListItem={(title) => <p>{title}</p>}
      renderListTable={{
        header: (
          <tr>
            <th scope="col">Jogo</th>
          </tr>
        ),
        renderRow: (title) => (
          <tr>
            <td>{title}</td>
          </tr>
        ),
      }}
      search=""
      onSearchChange={vi.fn()}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      isLoading={false}
      error={null}
      onRetry={vi.fn()}
      pagination={null}
      currentPage={1}
      onPageChange={vi.fn()}
      itemsPerPage={20}
      onItemsPerPageChange={vi.fn()}
    />
  );
}

describe("shared game grid density control", () => {
  beforeEach(() => {
    localStorage.clear();
    const preferenceStyles = document.createElement("style");
    preferenceStyles.id = PREFERENCE_STYLESHEET_ID;
    document.head.append(preferenceStyles);
    useUiStore.getState().setGridDensity(6);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.getElementById(PREFERENCE_STYLESHEET_ID)?.remove();
    useUiStore.getState().setGridDensity(6);
  });

  it("uses the configurable body font for card titles without display typography", () => {
    const source = readFileSync("features/games/game-card-frame.tsx", "utf8");
    const styles = readFileSync("app/globals.css", "utf8");
    expect(source).toContain('className="game-card-title text-[11px] leading-snug"');
    expect(source).not.toMatch(/game-card-title[^"\n]*font-display/);
    expect(styles).toMatch(/\.game-card-title\s*\{[^}]*font-family:\s*var\(--font-body-name\)/s);
    expect(styles).toMatch(/\.game-card-title\s*\{[^}]*color:\s*white/s);
    expect(styles).toMatch(/\.game-card-title\s*\{[^}]*text-shadow:/s);
    expect(styles).toContain("font-family: var(--font-body-name)");
  });

  it("defaults to six, persists selection, and preserves grid/table controls", async () => {
    const view = render(<TestCollection />);
    const density = screen.getByRole("combobox", {
      name: "Densidade do grid no desktop",
    });

    await waitFor(() => expect((density as HTMLSelectElement).value).toBe("6"));
    expect([...density.querySelectorAll("option")].map((option) => option.value))
      .toEqual(["6", "8", "10", "12"]);
    expect(view.container.querySelector(".game-card-grid")).not.toBeNull();
    expect(screen.getByText(longTitle)).not.toBeNull();
    expect(screen.getByText(specialTitle)).not.toBeNull();
    expect(view.container.querySelector(".game-card-title")?.className)
      .not.toContain("font-display");
    expect(
      screen.getByRole("button", { name: `Detalhes: ${longTitle}` }),
    ).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Favorito" })).toHaveLength(3);

    fireEvent.change(density, { target: { value: "10" } });
    expect(useUiStore.getState().gridDensity).toBe(10);
    const preferenceSheet = document.getElementById(
      PREFERENCE_STYLESHEET_ID,
    ) as HTMLStyleElement;
    expect(
      preferenceSheet.sheet?.cssRules[0].cssText,
    ).toContain("--ss-pref-grid-columns-1476: 10");
    const stored = JSON.parse(localStorage.getItem("save-state-ui") ?? "{}") as {
      state?: { gridDensity?: number };
    };
    expect(stored.state?.gridDensity).toBe(10);

    fireEvent.click(screen.getByRole("button", { name: "Ver em lista" }));
    expect(view.container.querySelector(".rpgui-data-table")).not.toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Densidade do grid no desktop" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver em grade" }));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Densidade do grid no desktop" }),
      ).toHaveProperty("value", "10"),
    );
  });
});
