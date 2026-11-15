"use client";
import { useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";

export function UsernameForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
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
      await apiRequest("/api/auth/me", { method: "PATCH", body: { name } });
      setMessage("Username atualizado com sucesso!");
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao atualizar");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={handleSubmit} className="rpgui-container framed-grey flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1">
        Novo username
        <RPGUInput className="w-full" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} readOnly={false} />
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
              title={loading ? "Salvando..." : "Salvar"}
              disabled={loading}
            />
            <RPGUIButton
              type="button"
              className="self-start"
              title="Cancelar"
              disabled={loading}
              onClick={() => {
                setName(initialName);
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
