/**
 * Presentation helpers shared by the statistics insights engine and the
 * dashboard modules. Pure functions only: no I/O, no React, no server code.
 *
 * Rules:
 * - Percentages use exactly one decimal in pt-BR (presentation only; counts
 *   and persisted values are never rounded).
 * - Ratings are printed from their exact numeric value (fractional ratings
 *   keep their precision, `0` is a valid rating).
 * - Hours may carry decimals too; only presentation is trimmed to two
 *   decimals to avoid floating-point noise.
 */

export function formatInteger(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Ratio in [0, 1] → localized percentage with one decimal. */
export function formatPercent(ratio: number): string {
  const safe = Number.isFinite(ratio) ? ratio : 0;
  return `${(safe * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Exact rating value, localized with a comma and no forced decimals. */
export function formatRating(value: number): string {
  return String(value).replace(".", ",");
}

/**
 * Derived averages are not persisted ratings, so they are shown with one
 * decimal (pt-BR). Individual ratings always use `formatRating` above.
 */
export function formatAverageRating(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Hours value for display; at most two decimals, never negative. */
export function formatHours(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Portuguese pluralization: count 1 uses the singular form. */
export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/** "1 jogo" / "2 jogos". */
export function gamesLabel(count: number): string {
  return `${formatInteger(count)} ${plural(count, "jogo", "jogos")}`;
}
