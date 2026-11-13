// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  from: null as string | null,
  params: {} as Record<string, string>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/home",
  useSearchParams: () => ({
    get: (key: string) => key === "from" ? navigation.from : navigation.params[key] ?? null,
  }),
}));

import { CheckEmail } from "@/features/auth/check-email";
import { LoginForm } from "@/features/auth/login-form";
import { RegisterForm } from "@/features/auth/register-form";
import { VerifyEmail } from "@/features/auth/verify-email";
import { LogoutLink } from "@/features/navigation/nav-desktop";
import { PasswordForm } from "@/features/settings/password-form";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.refresh.mockReset();
  navigation.from = null;
  navigation.params = {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("authentication recovery UI", () => {
  it("uses the validated fallback for an attacker-controlled login destination", async () => {
    navigation.from = "javascript:alert(1)";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: { id: "user" } })));
    const { container } = render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "password-123" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/home"));
  });

  it("offers a visible recovery path after an indeterminate registration failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    }, 500)));
    const { container } = render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Test Player" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "password-123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "password-123" } });
    fireEvent.submit(container.querySelector("form")!);

    expect((await screen.findByRole("alert")).textContent).toMatch(/não foi possível confirmar o resultado/i);
    expect(screen.getByRole("link", { name: "Solicitar outro link" }).getAttribute("href"))
      .toBe("/check-email");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("lets a user manually request resend without putting the email in the URL", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({
      data: { message: "If the account is pending, a verification email will be sent" },
    }));
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<CheckEmail />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: " USER@example.com " } });
    fireEvent.submit(container.querySelector("form")!);

    expect((await screen.findByRole("status")).textContent).toMatch(/não confirma a entrega/i);
    expect(fetch).toHaveBeenCalledWith("/api/auth/resend-verification", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "user@example.com" }),
    }));
  });

  it("offers contextual resend from login without exposing account state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "UNAUTHENTICATED", message: "Invalid credentials" },
    }, 401)));
    const { container } = render(<LoginForm />);
    expect(screen.getByRole("link", { name: /solicitar outro link/i }).getAttribute("href"))
      .toBe("/check-email");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pending@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "wrong-password" } });
    fireEvent.submit(container.querySelector("form")!);

    expect((await screen.findByRole("alert")).textContent).toBe("Invalid credentials");
    expect(screen.queryByText(/pendente|não verificado/i)).toBeNull();
  });

  it("shows only the fixed password-reset success message for the known flag", () => {
    navigation.params.passwordReset = "1";
    render(<LoginForm />);
    expect(screen.getByRole("status").textContent)
      .toBe("Senha redefinida com sucesso. Entre usando sua nova senha.");
  });

  it("shows no reset-success status for absent or different flags", () => {
    navigation.params.passwordReset = "true";
    const { rerender } = render(<LoginForm />);
    expect(screen.queryByRole("status")).toBeNull();
    navigation.params = {};
    rerender(<LoginForm />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not render arbitrary login query values as messages", () => {
    navigation.params.passwordReset = "<img src=x onerror=alert(1)>";
    render(<LoginForm />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("offers direct recovery after an invalid verification link", async () => {
    navigation.params.token = "expired-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "INVALID_TOKEN", message: "Invalid or expired verification link" },
    }, 400)));
    render(<VerifyEmail />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar e-mail/i }));

    expect((await screen.findByRole("status")).textContent).toMatch(/solicite um novo link/i);
    expect(screen.getByRole("link", { name: /solicitar outro link/i }).getAttribute("href"))
      .toBe("/check-email");
  });

  it("routes to login with an unconfirmed-revocation message when logout fails", async () => {
    const logout = vi.spyOn((await import("@/lib/api-client")).api, "logout")
      .mockRejectedValueOnce(new Error("network failure"));
    render(<LogoutLink />);
    fireEvent.click(screen.getByRole("link", { name: "Sair" }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?logout=unconfirmed"));
    expect(navigation.refresh).toHaveBeenCalled();
    logout.mockRestore();
  });

  it("routes to login after a confirmed logout", async () => {
    const logout = vi.spyOn((await import("@/lib/api-client")).api, "logout")
      .mockResolvedValueOnce({ message: "Logged out" });
    render(<LogoutLink />);
    fireEvent.click(screen.getByRole("link", { name: "Sair" }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?loggedOut=1"));
    logout.mockRestore();
  });

  it("leaves the revoked settings page after confirmed password change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: { message: "Password changed successfully" },
    })));
    render(<PasswordForm />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Alterar senha" }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?passwordChanged=1"));
  });

  it("keeps the password form and reports an error when the server rejects the change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "INVALID_PASSWORD", message: "Current password is incorrect" },
    }, 400)));
    render(<PasswordForm />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "wrong-password" } });
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Alterar senha" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Current password is incorrect");
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
