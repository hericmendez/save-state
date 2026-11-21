import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "node:path";
import { rpguiButtonClasses } from "@/components/RPGUI/Button";

describe("RpguiButton framed-grey variant (Etapa 5.1)", () => {
  it("keeps the legacy rpgui-button rendering by default", () => {
    const classes = rpguiButtonClasses({});
    expect(classes).toContain("rpgui-button");
    expect(classes).not.toContain("framed-grey");
    expect(classes).not.toContain("golden");
  });

  it("preserves the golden variant", () => {
    expect(rpguiButtonClasses({ golden: true })).toContain("golden");
    expect(rpguiButtonClasses({ golden: false })).not.toContain("golden");
  });

  it("renders the framed-grey container without the button skin", () => {
    const classes = rpguiButtonClasses({ framed: "grey" });
    expect(classes).toContain("rpgui-container");
    expect(classes).toContain("framed-grey");
    expect(classes).not.toContain("rpgui-button");
  });

  it("preserves caller classes in both modes", () => {
    expect(rpguiButtonClasses({ className: "my-row" })).toContain("my-row");
    expect(rpguiButtonClasses({ framed: "grey", className: "my-row" })).toContain(
      "my-row",
    );
  });

  it("keeps the old class output unless responsive sizing is opted in", () => {
    expect(rpguiButtonClasses({})).not.toContain("ss-rpgui-button--");
    expect(rpguiButtonClasses({ size: "compact", golden: true })).toContain(
      "ss-rpgui-button--compact",
    );
    expect(rpguiButtonClasses({ size: "icon" })).toContain(
      "ss-rpgui-button--icon-only",
    );
    expect(rpguiButtonClasses({ framed: "grey", size: "compact" })).toContain(
      "ss-rpgui-button--compact",
    );
  });

  it("supports action and navigation elements through one component", () => {
    const source = readFileSync(
      path.resolve("components/RPGUI/Button.tsx"),
      "utf8",
    );
    expect(source).toContain('as: "link"');
    expect(source).toContain("framed-grey");
    expect(source).toContain('size: "icon"; "aria-label": string');
    expect(source).toContain('aria-label={accessibleName}');
    // Framed mode renders the title verbatim (typography comes from the
    // caller's classes, exactly like the manual submenu buttons).
    expect(source).toContain("framed === ");
  });

  it("keeps the legacy <p> wrapper for non-framed buttons", () => {
    const source = readFileSync(
      path.resolve("components/RPGUI/Button.tsx"),
      "utf8",
    );
    expect(source).toContain("<p>{title}</p>");
  });
});
