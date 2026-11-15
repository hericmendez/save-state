"use client";

import type { KeyboardEvent, MouseEventHandler, ReactNode } from "react";

/**
 * Shared RPGUI data table.
 *
 * Real HTML table semantics (`table > thead/tbody > tr > th/td`). Column
 * widths are resolved once by the browser's table layout algorithm, so the
 * header and every row always share the same geometry — no per-row grid
 * templates and no `role="table"` impersonation.
 *
 * Visual treatment lives in `app/globals.css` (`.rpgui-data-table*`):
 * golden framed header cells and grey framed body cells, reusing the
 * vendored RPGUI artwork without inserting invalid wrappers inside the
 * table.
 */
export function DataTable({
  label,
  minWidthClass = "min-w-[600px]",
  header,
  children,
}: {
  label: string;
  minWidthClass?: string;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        aria-label={label}
        className={`rpgui-data-table w-full ${minWidthClass}`}
      >
        {header}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Header group. Rendered as a fragment by callers so a sibling
 * `<colgroup>` can define the shared column proportions.
 */
export function DataTableHeader({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="rpgui-data-table-head-row">{children}</tr>
    </thead>
  );
}

export function DataTableHeaderCell({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <th scope="col" className={`rpgui-data-table-th ${className}`}>
      {children}
    </th>
  );
}

export function DataTableRow({
  label,
  onActivate,
  onContextMenu,
  children,
}: {
  label: string;
  onActivate?: () => void;
  onContextMenu?: MouseEventHandler<HTMLTableRowElement>;
  children: ReactNode;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Interactive descendants (action buttons, links, inputs) keep their
    // own keyboard behavior; the row activates only from the row background.
    if (
      (event.target as HTMLElement).closest("button,a,input,select,textarea")
    ) {
      return;
    }
    event.preventDefault();
    onActivate?.();
  }

  return (
    <tr
      aria-label={label}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
      className={`rpgui-data-table-row ${
        onActivate ? "cursor-pointer" : ""
      }`}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  className = "",
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <td title={title} className={`rpgui-data-table-td ${className}`}>
      {children}
    </td>
  );
}
