// @vitest-environment jsdom
/**
 * Context-menu composition for table rows.
 *
 * `<tbody>` may only contain `<tr>`, so the row context menu must attach
 * its handler to the row itself (`asChild`) instead of inserting a wrapper
 * `<div>`. Grid/list consumers keep the original wrapper behavior.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomContextMenu } from "@/features/games/context-menu";

afterEach(cleanup);

describe("CustomContextMenu asChild", () => {
  it("attaches the handler to the row without adding a wrapper element", () => {
    const onClick = vi.fn();
    const { container } = render(
      <table>
        <tbody>
          <CustomContextMenu
            asChild
            items={[{ key: "details", label: "Ver detalhes", onClick }]}
          >
            <tr data-testid="row">
              <td>Jogo</td>
            </tr>
          </CustomContextMenu>
        </tbody>
      </table>,
    );

    const tbody = container.querySelector("tbody");
    expect(tbody?.children).toHaveLength(1);
    expect(tbody?.firstElementChild?.tagName).toBe("TR");

    fireEvent.contextMenu(screen.getByTestId("row"));
    fireEvent.click(screen.getByText("Ver detalhes"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps the original div wrapper when asChild is not used", () => {
    const { container } = render(
      <CustomContextMenu items={[{ key: "details", label: "Ver detalhes" }]}>
        <span>conteúdo</span>
      </CustomContextMenu>,
    );

    expect(container.querySelector("div > span")).toBeTruthy();
  });
});
