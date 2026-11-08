"use client";
import { useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditing) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await apiRequest("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
      setMessage("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setIsEditing(false);
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
        <RPGUInput className="w-full" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required readOnly={!isEditing} />
      </label>
      <label className="flex flex-col gap-1">
        Nova senha
        <RPGUInput className="w-full" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} maxLength={128} readOnly={!isEditing} />
      </label>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="flex gap-2">
        {!isEditing ? (
          <RPGUIButton type="button" className="self-start" title="Editar" onClick={() => setIsEditing(true)} />
        ) : (
          <>
            <RPGUIButton
              type="submit"
              className="self-start"
              title={loading ? "Salvando..." : "Alterar senha"}
              disabled={loading}
            />
            <RPGUIButton
              type="button"
              className="self-start"
              title="Cancelar"
              disabled={loading}
              onClick={() => {
                setCurrentPassword("");
                setNewPassword("");
                setError(null);
                setMessage(null);
                setIsEditing(false);
              }}
            />
          </>
        )}
      </div>
    </form>
  );
}
