"use client";
import { useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await apiRequest("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
      setMessage("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao alterar senha");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={handleSubmit} className="rpgui-container framed-grey flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1">
        Senha atual
        <input className="rpgui-input w-full" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1">
        Nova senha
        <input className="rpgui-input w-full" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} maxLength={128} />
      </label>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button className="rpgui-button" type="submit" disabled={loading}>
        {loading ? "Salvando..." : "Alterar senha"}
      </button>
    </form>
  );
}
