"use client";

import type { KeyboardEvent, ReactNode } from "react";

/**
 * Shared RPGUI data table (list-mode upgrade).
 *
 * Div-based with explicit ARIA table roles: a native `<table>` is not
 * compatible with the row-level context-menu wrappers (a `div` cannot sit
 * between `table` and `tr`), while role-less wrapper divs are pruned from
 * the accessibility tree so `table > row > cell` stays intact.
 * Each data row uses `rpgui-container framed-grey` per the design brief.
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
      <div
        role="table"
        aria-label={label}
        className={`flex flex-col gap-1 ${minWidthClass}`}
      >
        {header}
        {children}
      </div>
    </div>
  );
}

export function DataTableHeaderRow({
  gridClass,
  children,
}: {
  gridClass: string;
  children: ReactNode;
}) {
  return (
    <div
      role="row"
      aria-hidden="true"
      className={`rpgui-container framed-golden grid items-center gap-2 px-3 py-2 ${gridClass}`}
    >
      {children}
    </div>
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
    <div
      role="columnheader"
      className={`font-display min-w-0 text-xs ${className}`}
    >
      {children}
    </div>
  );
}

export function DataTableRow({
  gridClass,
  label,
  onActivate,
  children,
}: {
  gridClass: string;
  label: string;
  onActivate?: () => void;
  children: ReactNode;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Interactive descendants (action buttons, links, inputs) keep their
    // own keyboard behavior; the row activates only from row background.
    if (
      (event.target as HTMLElement).closest("button,a,input,select,textarea")
    ) {
      return;
    }
    event.preventDefault();
    onActivate?.();
  }

  return (
    <div
      role="row"
      aria-label={label}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={handleKeyDown}
      className={`rpgui-container framed-grey grid cursor-pointer items-center gap-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-1 ${gridClass}`}
    >
      {children}
    </div>
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
    <div role="cell" title={title} className={`min-w-0 text-xs ${className}`}>
      {children}
    </div>
  );
}
