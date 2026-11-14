// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

import PasswordInput from "@/components/RPGUI/PasswordInput";
import { RegisterForm } from "@/features/auth/register-form";

afterEach(cleanup);

function Harness({ name = "senha" }: { name?: string }) {
  const [value, setValue] = useState("segredo-123");
  return (
    <PasswordInput
      aria-label={name}
      name={name}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      autoComplete="current-password"
    />
  );
}

describe("PasswordInput", () => {
  it("starts hidden and exposes an accessible show control", () => {
    render(<Harness />);
    const input = screen.getByLabelText("senha");
    expect(input.getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ocultar senha" })).toBeNull();
  });

  it("reveals and hides again while preserving the typed value", () => {
    render(<Harness />);
    const input = screen.getByLabelText("senha") as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input.getAttribute("type")).toBe("text");
    expect(input.value).toBe("segredo-123");
    expect(screen.getByRole("button", { name: "Ocultar senha" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(input.getAttribute("type")).toBe("password");
    expect(input.value).toBe("segredo-123");
  });

  it("uses a type=button control that never submits the surrounding form", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    );

    const toggle = screen.getByRole("button", { name: "Mostrar senha" });
    expect(toggle.getAttribute("type")).toBe("button");
    fireEvent.click(toggle);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("senha").getAttribute("type")).toBe("text");
  });

  it("preserves autocomplete and other caller attributes", () => {
    render(<Harness />);
    const input = screen.getByLabelText("senha");
    expect(input.getAttribute("autocomplete")).toBe("current-password");
    expect(input.getAttribute("name")).toBe("senha");
  });

  it("keeps each field's visibility independent", () => {
    render(
      <div>
        <PasswordInput aria-label="primeira" defaultValue="a" autoComplete="new-password" />
        <PasswordInput aria-label="segunda" defaultValue="b" autoComplete="new-password" />
      </div>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Mostrar senha" })[0]);

    expect(screen.getByLabelText("primeira").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("segunda").getAttribute("type")).toBe("password");
  });
});

describe("RegisterForm password controls", () => {
  it("keeps password and confirmation visibility independent", () => {
    render(<RegisterForm />);

    const password = screen.getByLabelText("Senha");
    const confirm = screen.getByLabelText("Confirmar senha");
    expect(password.getAttribute("type")).toBe("password");
    expect(confirm.getAttribute("type")).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    expect(confirm.getAttribute("autocomplete")).toBe("new-password");

    fireEvent.click(screen.getAllByRole("button", { name: "Mostrar senha" })[0]);

    expect(screen.getByLabelText("Senha").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Confirmar senha").getAttribute("type")).toBe("password");
  });
});
