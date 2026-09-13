"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import { useListModalStore } from "./list-modal-store";

export function ListCreateModal() {
  const isOpen = useListModalStore((s) => s.isOpen);
  const close = useListModalStore((s) => s.close);
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest("/api/game-lists", { method: "POST", body: { name: name.trim() } });
      setName("");
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao criar lista");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Nova Lista">
      <div className="rpgui-container framed-golden w-full max-w-md p-6">
        <h2 className="font-display text-xl">Nova Lista</h2>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <input
            className="rpgui-input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da lista"
            maxLength={100}
            autoFocus
          />
          {error && <p role="alert">{error}</p>}
          <div className="flex gap-2">
            <button className="rpgui-button" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? "Criando…" : "Criar"}
            </button>
            <button className="rpgui-button" type="button" onClick={close} disabled={isSubmitting}>
              Cancelar
            </button>
            {isSubmitting && <span className="font-display text-xs self-center" aria-live="polite">[ Carregando... ]</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
