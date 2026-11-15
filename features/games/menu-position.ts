/**
 * Pure viewport-aware placement math for the context menu.
 *
 * The menu renders through a portal with `position: fixed`, so every
 * coordinate here is in viewport space and inherently scroll-safe
 * (window.scrollX/scrollY never enter the computation).
 *
 * Policy: prefer the requested direction; flip to the opposite side when
 * there is no room; otherwise clamp to the best possible position. When
 * the menu is physically larger than the viewport, perfect containment is
 * impossible and the margin-anchored position is returned as best effort.
 */

export interface PlaceMenuInput {
  /** Preferred top-left corner (e.g. cursor), viewport coords. */
  anchorX: number;
  anchorY: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}

export interface PlacedPosition {
  x: number;
  y: number;
}

const DEFAULT_MARGIN = 8;

function placeAxis(
  anchor: number,
  size: number,
  viewport: number,
  margin: number,
): number {
  // Prefer forward; flip backward; otherwise clamp (or best effort).
  if (anchor + size + margin <= viewport) return anchor;
  if (anchor - size - margin >= 0) return anchor - size;
  return Math.min(
    Math.max(anchor, margin),
    Math.max(margin, viewport - size - margin),
  );
}

export function placeMenu(input: PlaceMenuInput): PlacedPosition {
  const margin = input.margin ?? DEFAULT_MARGIN;
  return {
    x: placeAxis(input.anchorX, input.menuWidth, input.viewportWidth, margin),
    y: placeAxis(input.anchorY, input.menuHeight, input.viewportHeight, margin),
  };
}

export interface PlaceSubmenuInput {
  /** Parent item rect, viewport coords. */
  parentLeft: number;
  parentTop: number;
  parentWidth: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}

/**
 * Submenu offset relative to the parent <li> (its offset parent).
 * Prefers right/top; flips left/up when there is no room; clamps to the
 * best possible position when neither side fits (e.g. a flipped root menu
 * near the left edge in a narrow viewport).
 */
export function placeSubmenu(input: PlaceSubmenuInput): PlacedPosition {
  const margin = input.margin ?? DEFAULT_MARGIN;
  const fitsRight =
    input.parentLeft + input.parentWidth + input.menuWidth + margin <=
    input.viewportWidth;
  let x: number;
  if (fitsRight) {
    x = input.parentWidth;
  } else if (input.parentLeft - input.menuWidth - margin >= 0) {
    x = -input.menuWidth;
  } else {
    // Neither side fits: align to the best possible absolute position.
    const absoluteX = Math.max(
      margin,
      input.viewportWidth - input.menuWidth - margin,
    );
    x = absoluteX - input.parentLeft;
  }
  let absoluteTop: number;
  if (input.parentTop + input.menuHeight + margin <= input.viewportHeight) {
    absoluteTop = input.parentTop;
  } else if (input.viewportHeight - input.menuHeight - margin >= margin) {
    absoluteTop = input.viewportHeight - margin - input.menuHeight;
  } else {
    absoluteTop = margin;
  }
  return { x, y: absoluteTop - input.parentTop };
}
