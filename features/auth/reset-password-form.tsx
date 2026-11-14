"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import PasswordInput from "@/components/RPGUI/PasswordInput";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMessage("As senhas não coincidem.");
      return;
    }
    const token = params.get("token");
    if (!token) {
      setMessage("Link inválido ou expirado.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/auth/reset-password", { method: "POST", body: { token, password } });
      window.history.replaceState({}, "", "/reset-password");
      router.replace("/login?passwordReset=1");
    } catch {
      setMessage("Link inválido ou expirado. Solicite uma nova recuperação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="font-display text-center text-xl">Definir nova senha</h1>
      {message && <p role="alert">{message}</p>}
      <label>
        Nova senha
        <PasswordInput
          className="w-full"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        Confirmar senha
        <PasswordInput
          className="w-full"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <RPGUIButton type="submit" title={busy ? "Salvando…" : "Redefinir senha"} disabled={busy} />
    </form>
  );
}
