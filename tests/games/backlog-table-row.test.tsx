// @vitest-environment jsdom
/**
 * Backlog table — semantic `<table>` behavior.
 *
 * Covers the rendered DOM: native table structure, equal columns between
 * header and rows, no redundant Ações/Detalhes column, and details opening
 * from mouse, Enter and Space.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} />
  ),
}));

import { DataTable } from "@/features/games/data-table";
import {
  BacklogTableHeader,
  BacklogTableRow,
} from "@/features/games/backlog-table-row";
import type { Game } from "@/features/shared/types";

const game = {
  _id: "g1",
  favorite: true,
  status: "playing",
  hoursPlayed: 12,
  rating: 9,
  game: {
    name: "Celeste",
    platforms: ["PC", "Nintendo Switch"],
    cover: null,
  },
} as unknown as Game;

function renderTable(onDetails: () => void = () => {}) {
  return render(
    <DataTable label="Jogos em tabela" header={<BacklogTableHeader />}>
      <BacklogTableRow game={game} onDetails={onDetails} />
    </DataTable>,
  );
}

afterEach(cleanup);

describe("backlog semantic table", () => {
  it("renders a real table with thead, tbody, th and td", () => {
    const { container } = renderTable();

    const table = container.querySelector("table");
    expect(table).toBeTruthy();
    expect(table?.querySelector("thead")).toBeTruthy();
    expect(table?.querySelector("tbody")).toBeTruthy();

    const headers = container.querySelectorAll("thead th");
    const cells = container.querySelectorAll("tbody td");
    expect(headers).toHaveLength(6);
    expect(cells).toHaveLength(6);
    for (const header of headers) {
      expect(header.getAttribute("scope")).toBe("col");
    }
  });

  it("does not simulate table semantics with ARIA roles or grid", () => {
    const { container } = renderTable();

    expect(container.querySelector('[role="table"]')).toBeNull();
    expect(container.querySelector('[role="row"]')).toBeNull();
    expect(container.querySelector('[role="cell"]')).toBeNull();
    expect(container.querySelector('[role="columnheader"]')).toBeNull();
    expect(container.querySelector(".grid")).toBeNull();
    expect(container.querySelector("[class*='grid-cols']")).toBeNull();
  });

  it("declares shared column proportions through colgroup", () => {
    const { container } = renderTable();
    expect(container.querySelectorAll("colgroup col")).toHaveLength(6);
  });

  it("does not render the redundant Ações/Detalhes column", () => {
    const { container } = renderTable();

    expect(container.textContent).toContain("Celeste");
    expect(container.textContent).not.toContain("Ações");
    expect(container.textContent).not.toContain("Detalhes");
    expect(container.querySelector("button")).toBeNull();
  });

  it("opens details when the row is clicked", () => {
    const onDetails = vi.fn();
    renderTable(onDetails);

    fireEvent.click(screen.getByRole("row", { name: "Celeste" }));

    expect(onDetails).toHaveBeenCalledTimes(1);
  });

  it("keeps keyboard activation from the row background", () => {
    const onDetails = vi.fn();
    renderTable(onDetails);

    const row = screen.getByRole("row", { name: "Celeste" });
    expect(row.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });

    expect(onDetails).toHaveBeenCalledTimes(2);
  });
});
