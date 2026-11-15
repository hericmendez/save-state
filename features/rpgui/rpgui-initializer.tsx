"use client";

import Script from "next/script";
import { useRef } from "react";
import { applyRpguiLoadGuard } from "./guard";

/**
 * Controlled RPGUI runtime boundary.
 *
 * - Loads the byte-identical vendored runtime (`/vendor/rpgui/rpgui.js`)
 *   exactly once per page lifecycle (afterInteractive scripts are not
 *   re-executed on App Router client navigation).
 * - Disables the runtime's automatic global `init()` (see guard.ts) so it
 *   can never hijack React-managed DOM or throw on double init.
 * - Runs only in the browser; nothing here executes during SSR.
 * - Performs no MutationObserver, no polling, no global DOM scans.
 *
 * Deliberately NOT done here: calling `RPGUI.init()` globally. That call
 * transforms native selects and duplicates progress internals inside
 * React-owned subtrees (Phase 7 audit, category D). If a future screen
 * needs an explicitly managed RPGUI widget, it should invoke
 * `window.RPGUI.create(element, type)` for that element only.
 */
export function RpguiInitializer() {
  const handled = useRef(false);

  return (
    <Script
      src="/vendor/rpgui/rpgui.js"
      strategy="afterInteractive"
      onLoad={() => {
        if (handled.current) return;
        handled.current = true;
        applyRpguiLoadGuard(window as unknown as Record<string, unknown>);
      }}
    />
  );
}
