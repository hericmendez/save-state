/**
 * Loading-screen progress helpers (RPGUI LoadingScreen).
 *
 * Pure, client-safe math (no React, no DOM access on import, no side
 * effects): safe to import from Server Components, Route Handlers and
 * `.ts` test files alike.
 */

/** Default message rendered by the LoadingScreen. */
export const LOADING_SCREEN_DEFAULT_MESSAGE = "Loading... Please wait";

/** Denominator for both indeterminate simulation and controlled values. */
export const LOADING_SCREEN_MAX = 100;

/** Simulated bar starts here (percent of max). */
const INDETERMINATE_START_PCT = 8;
/** Simulated bar asymptotically approaches this (percent of max, < 100). */
const INDETERMINATE_CAP_PCT = 90;
/** Time constant of the deceleration curve (ms). */
const INDETERMINATE_TAU_MS = 3500;
/** Static fill shown when the user prefers reduced motion. */
export const REDUCED_MOTION_STATIC_VALUE = 35;

/** Clamps a caller-provided progress value into `[0, max]`. */
export function clampLoadingValue(
  value: number,
  max: number = LOADING_SCREEN_MAX,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return Math.min(max, Math.max(0, value));
}

/**
 * Simulated indeterminate progress at `elapsedMs` after mount.
 *
 * Monotonically increasing, decelerating (`1 - e^(-t/tau)` shape),
 * bounded by the 90% cap: it can approach but never reach `max`, so
 * the bar never presents a completion it has not achieved.
 */
export function indeterminateProgressAt(
  elapsedMs: number,
  max: number = LOADING_SCREEN_MAX,
): number {
  const t = Math.max(0, elapsedMs);
  const start = (INDETERMINATE_START_PCT / 100) * max;
  const cap = (INDETERMINATE_CAP_PCT / 100) * max;
  return cap - (cap - start) * Math.exp(-t / INDETERMINATE_TAU_MS);
}

export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
