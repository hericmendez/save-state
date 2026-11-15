"use client";

import { useEffect, useState } from "react";
import RPGUIProgressBar from "@/components/RPGUI/ProgressBar";
import {
  clampLoadingValue,
  indeterminateProgressAt,
  LOADING_SCREEN_DEFAULT_MESSAGE,
  LOADING_SCREEN_MAX,
  prefersReducedMotion,
  REDUCED_MOTION_STATIC_VALUE,
} from "@/components/RPGUI/loading-progress";

/**
 * Reusable RPGUI loading screen.
 *
 * Two modes, one component:
 * - `mode="indeterminate"` (default): simulated progress driven by
 *   `requestAnimationFrame`. The curve decelerates and asymptotically
 *   approaches 90% of `max`, so it never completes on its own — Next.js
 *   unmounts it when the route finishes loading. No fake percentages
 *   are ever rendered or announced.
 * - `mode="controlled"`: renders a real `value`/`max` pair owned by the
 *   caller. Purely presentational — no timers, no animation loop.
 *
 * Route `loading.tsx` files stay Server Components and import this
 * directly (server -> client import is allowed).
 */

export type LoadingScreenColor = "blue" | "red" | "green" | "purple";

interface LoadingScreenBase {
  /** Defaults to "Loading... Please wait". */
  message?: string;
  /** One of the fills already provided by RPGUIProgressBar. */
  color?: LoadingScreenColor;
  /** Extra classes merged into the outer container. */
  className?: string;
  /**
   * Render as a fixed fullscreen overlay. Defaults to `false`: an
   * inline centered block, so route `loading.tsx` boundaries never
   * cover the app chrome or clash with drawers/modals (z >= 9999).
   */
  fullscreen?: boolean;
}

export type LoadingScreenProps =
  | (LoadingScreenBase & { mode?: "indeterminate" })
  | (LoadingScreenBase & { mode: "controlled"; value: number; max?: number });

export default function LoadingScreen(props: LoadingScreenProps) {
  const {
    message = LOADING_SCREEN_DEFAULT_MESSAGE,
    color = "green",
    className = "",
    fullscreen = false,
  } = props;
  const isControlled = props.mode === "controlled";
  const max =
    isControlled && typeof props.max === "number"
      ? props.max
      : LOADING_SCREEN_MAX;

  const [simulated, setSimulated] = useState(() =>
    indeterminateProgressAt(0, LOADING_SCREEN_MAX),
  );
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (isControlled) {
      return;
    }
    if (prefersReducedMotion()) {
      setReducedMotion(true);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setSimulated(indeterminateProgressAt(now - start, LOADING_SCREEN_MAX));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isControlled]);

  const value = isControlled
    ? clampLoadingValue(props.value, max)
    : reducedMotion
      ? REDUCED_MOTION_STATIC_VALUE
      : simulated;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={
        fullscreen
          ? `fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 ${className}`
          : `flex min-h-[40vh] w-full items-center justify-center p-4 ${className}`
      }
    >
      <div className="rpgui-container framed-grey w-full max-w-xl p-4 text-center sm:p-6">
        <p className="font-display mb-4 text-sm">{message}</p>
        <RPGUIProgressBar
          color={color}
          value={value}
          max={max}
          indeterminate={!isControlled}
        />
      </div>
    </div>
  );
}
