// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUIInput from "@/components/RPGUI/Input";
import RPGUISelect from "@/components/RPGUI/Select";

afterEach(() => {
  cleanup();
});

describe("RPGUI mobile foundation opt-in APIs", () => {
  it("preserves the legacy button markup by default", () => {
    render(<RPGUIButton title="Save" data-testid="legacy-button" />);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.classList.contains("rpgui-button")).toBe(true);
    expect(button.classList.contains("ss-rpgui-button--compact")).toBe(false);
    expect(button.querySelector("p")?.textContent).toBe("Save");
  });

  it("adds compact golden styling without replacing button props or behavior", () => {
    const onClick = vi.fn();
    render(
      <RPGUIButton
        title="Save"
        size="compact"
        golden
        type="button"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.classList.contains("golden")).toBe(true);
    expect(button.classList.contains("ss-rpgui-button--compact")).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps icon-only controls named and hides the visual title", () => {
    render(
      <RPGUIButton
        title="Remove item"
        aria-label="Remove game from list"
        size="icon"
      >
        <span aria-hidden="true">×</span>
      </RPGUIButton>,
    );
    const button = screen.getByRole("button", { name: "Remove game from list" });
    expect(button.classList.contains("ss-rpgui-button--icon")).toBe(true);
    expect(button.classList.contains("ss-rpgui-button--icon-only")).toBe(true);
    expect(
      button.querySelector(".ss-rpgui-button__label")?.textContent,
    ).toBe("Remove item");
  });

  it("preserves navigation semantics for compact anchors and Next links", () => {
    const { rerender } = render(
      <RPGUIButton
        as="a"
        href="/games"
        title="Games"
        size="compact"
        golden
      />,
    );
    expect(screen.getByRole("link", { name: "Games" }).getAttribute("href")).toBe(
      "/games",
    );
    rerender(
      <RPGUIButton as="link" href="/library" title="Library" size="compact" />,
    );
    expect(
      screen.getByRole("link", { name: "Library" }).getAttribute("href"),
    ).toBe("/library");
  });

  it("adds compact control classes while preserving native form attributes", () => {
    render(
      <>
        <RPGUIInput
          density="compact"
          aria-label="Search"
          required
          name="query"
        />
        <RPGUISelect
          density="compact"
          aria-label="Platform"
          defaultValue="pc"
          name="platform"
        >
          <option value="pc">PC</option>
        </RPGUISelect>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Search" });
    const select = screen.getByRole("combobox", { name: "Platform" });
    expect(input.classList.contains("ss-rpgui-control--compact")).toBe(true);
    expect((input as HTMLInputElement).required).toBe(true);
    expect((select as HTMLSelectElement).value).toBe("pc");
    expect(select.classList.contains("ss-rpgui-control--compact")).toBe(true);
  });
});
