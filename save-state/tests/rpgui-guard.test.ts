import { describe, expect, it } from "vitest";
import { applyRpguiLoadGuard, isRpguiLoaded } from "@/features/rpgui/guard";

describe("applyRpguiLoadGuard", () => {
  it("disables auto-init on an empty scope without loading anything", () => {
    const scope: Record<string, unknown> = {};
    applyRpguiLoadGuard(scope);
    expect(scope.RPGUI).toEqual({ init_on_load: false });
  });

  it("preserves an existing RPGUI namespace while opting out", () => {
    const runtime = { init_on_load: true, version: "1.03" };
    const scope: Record<string, unknown> = { RPGUI: runtime };
    applyRpguiLoadGuard(scope);
    expect(scope.RPGUI).toBe(runtime);
    expect((scope.RPGUI as { init_on_load: boolean }).init_on_load).toBe(
      false,
    );
  });

  it("is idempotent across repeated calls", () => {
    const scope: Record<string, unknown> = {};
    applyRpguiLoadGuard(scope);
    applyRpguiLoadGuard(scope);
    expect(scope.RPGUI).toEqual({ init_on_load: false });
  });
});

describe("isRpguiLoaded", () => {
  it("reports false before the runtime arrives", () => {
    expect(isRpguiLoaded({})).toBe(false);
    expect(isRpguiLoaded({ RPGUI: { init_on_load: false } })).toBe(false);
  });

  it("reports true once the runtime exposes init", () => {
    expect(isRpguiLoaded({ RPGUI: { init: () => {} } })).toBe(true);
  });
});
