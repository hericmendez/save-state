/**
 * RPGUI load guard.
 *
 * The vendored RPGUI runtime defaults to `init_on_load = true`, which runs a
 * global `RPGUI.init()` on `window.load`. That behavior is incompatible with
 * React ownership: global init hides native `<select>` elements and injects
 * sibling/child DOM (dropdown headers, progress internals) that React will
 * remove or mis-reconcile on the next render. It also throws when executed
 * twice (`RPGUI was already init!`).
 *
 * This module therefore disables the automatic global init as early as
 * possible. RPGUI remains available as an explicitly-invoked runtime
 * (`window.RPGUI`) for deliberately scoped use; nothing in the application
 * auto-initializes it.
 */

export interface RpguiScope {
  RPGUI?: { init_on_load?: boolean; init?: unknown };
}

/**
 * Disable RPGUI's automatic `window.load` initialization on the given scope.
 * Safe to call repeatedly and safe when RPGUI is not (yet) loaded: it
 * installs a namespace object carrying the opt-out flag, which the real
 * runtime preserves (`var RPGUI = RPGUI || {}`) when it arrives.
 */
export function applyRpguiLoadGuard(
  scope: RpguiScope & Record<string, unknown>,
): void {
  const existing = (scope.RPGUI ?? {}) as { init_on_load?: boolean };
  existing.init_on_load = false;
  scope.RPGUI = existing;
}

/** True once the vendored RPGUI runtime has been loaded. */
export function isRpguiLoaded(
  scope: RpguiScope & Record<string, unknown>,
): boolean {
  return (
    typeof scope.RPGUI === "object" &&
    scope.RPGUI !== null &&
    typeof (scope.RPGUI as { init?: unknown }).init === "function"
  );
}
