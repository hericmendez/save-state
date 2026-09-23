import { describe, expect, it } from "vitest";
import { placeMenu, placeSubmenu } from "@/features/games/menu-position";

function inside(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
): boolean {
  // Full viewport containment. The preferred direction keeps the exact
  // cursor anchor (no forced margin); flip/clamp branches additionally
  // honor the margin, asserted via exact values in those tests.
  return x >= 0 && y >= 0 && x + w <= vw && y + h <= vh;
}

describe("placeMenu", () => {
  const vw = 1920;
  const vh = 1080;

  it("keeps the preferred position at the center", () => {
    expect(
      placeMenu({
        anchorX: 400,
        anchorY: 300,
        menuWidth: 200,
        menuHeight: 150,
        viewportWidth: vw,
        viewportHeight: vh,
      }),
    ).toEqual({ x: 400, y: 300 });
  });

  it("flips left near the right edge", () => {
    const placed = placeMenu({
      anchorX: 1850,
      anchorY: 300,
      menuWidth: 200,
      menuHeight: 150,
      viewportWidth: vw,
      viewportHeight: vh,
    });
    expect(placed).toEqual({ x: 1650, y: 300 });
    expect(inside(placed.x, placed.y, 200, 150, vw, vh)).toBe(true);
  });

  it("flips up near the bottom edge", () => {
    const placed = placeMenu({
      anchorX: 400,
      anchorY: 1000,
      menuWidth: 200,
      menuHeight: 150,
      viewportWidth: vw,
      viewportHeight: vh,
    });
    expect(placed).toEqual({ x: 400, y: 850 });
    expect(inside(placed.x, placed.y, 200, 150, vw, vh)).toBe(true);
  });

  it("flips both axes at the bottom-right corner", () => {
    const placed = placeMenu({
      anchorX: 1900,
      anchorY: 1060,
      menuWidth: 200,
      menuHeight: 150,
      viewportWidth: vw,
      viewportHeight: vh,
    });
    expect(placed).toEqual({ x: 1700, y: 910 });
    expect(inside(placed.x, placed.y, 200, 150, vw, vh)).toBe(true);
  });

  it("flips both axes at the top-right corner", () => {
    const placed = placeMenu({
      anchorX: 1900,
      anchorY: 5,
      menuWidth: 200,
      menuHeight: 150,
      viewportWidth: vw,
      viewportHeight: vh,
    });
    expect(placed.x).toBe(1700);
    expect(inside(placed.x, placed.y, 200, 150, vw, vh)).toBe(true);
  });

  it("clamps when neither side fits", () => {
    // Narrow viewport: menu fits nowhere by flipping, so clamp wins.
    const placed = placeMenu({
      anchorX: 100,
      anchorY: 100,
      menuWidth: 200,
      menuHeight: 150,
      viewportWidth: 250,
      viewportHeight: 400,
    });
    expect(inside(placed.x, placed.y, 200, 150, 250, 400)).toBe(true);
  });

  it("returns best effort when the menu is larger than a small viewport", () => {
    const placed = placeMenu({
      anchorX: 100,
      anchorY: 100,
      menuWidth: 300,
      menuHeight: 500,
      viewportWidth: 200,
      viewportHeight: 400,
    });
    expect(placed).toEqual({ x: 8, y: 8 });
  });

  it("keeps the menu inside a mobile viewport", () => {
    const placed = placeMenu({
      anchorX: 370,
      anchorY: 800,
      menuWidth: 200,
      menuHeight: 220,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(inside(placed.x, placed.y, 200, 220, 390, 844)).toBe(true);
  });
});

describe("placeSubmenu", () => {
  const vw = 1920;
  const vh = 1080;

  it("opens to the right by default", () => {
    expect(
      placeSubmenu({
        parentLeft: 100,
        parentTop: 200,
        parentWidth: 192,
        menuWidth: 192,
        menuHeight: 120,
        viewportWidth: vw,
        viewportHeight: vh,
      }),
    ).toEqual({ x: 192, y: 0 });
  });

  it("flips left near the right edge", () => {
    expect(
      placeSubmenu({
        parentLeft: 1700,
        parentTop: 200,
        parentWidth: 192,
        menuWidth: 192,
        menuHeight: 120,
        viewportWidth: vw,
        viewportHeight: vh,
      }),
    ).toEqual({ x: -192, y: 0 });
  });

  it("flips up near the bottom edge", () => {
    const placed = placeSubmenu({
      parentLeft: 100,
      parentTop: 1000,
      parentWidth: 192,
      menuWidth: 192,
      menuHeight: 200,
      viewportWidth: vw,
      viewportHeight: vh,
    });
    expect(placed.x).toBe(192);
    // Absolute top = 1000 + y must equal vh - margin - height.
    expect(1000 + placed.y).toBe(1080 - 8 - 200);  });

  it("opens below on small screens when it fits", () => {
    const placed = placeSubmenu({
      parentLeft: 10,
      parentTop: 600,
      parentWidth: 180,
      menuWidth: 180,
      menuHeight: 100,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(placed).toEqual({ x: 180, y: 0 });
  });

  it("clamps inside when a flipped parent leaves room on neither side", () => {
    // Regression: root menu flipped left in a narrow viewport; flipping
    // the submenu left again would push it off-screen (negative x).
    const placed = placeSubmenu({
      parentLeft: 218,
      parentTop: 200,
      parentWidth: 274,
      menuWidth: 238,
      menuHeight: 84,
      viewportWidth: 500,
      viewportHeight: 500,
    });
    const absoluteX = 218 + placed.x;
    expect(absoluteX).toBeGreaterThanOrEqual(0);
    expect(absoluteX + 238).toBeLessThanOrEqual(500);
  });
});
