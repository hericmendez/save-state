"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import { useCollectionModalStore } from "./collection-modal-store";
import { notifyCollectionsChanged } from "./collections-signal";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";
export function CollectionCreateModal() {
  const isOpen = useCollectionModalStore((s) => s.isOpen);
  const mode = useCollectionModalStore((s) => s.mode);
  const close = useCollectionModalStore((s) => s.close);
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode.kind === "edit";

  // Prefill on open (edit) and reset on open (create); independent of
  // previous typing. Runs only on open transitions.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setName(isEdit ? mode.initialName : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await apiRequest(`/api/game-collections/${mode.collectionId}`, {
          method: "PATCH",
          body: { name: name.trim() },
        });
      } else {
        await apiRequest("/api/game-collections", { method: "POST", body: { name: name.trim() } });
      }
      setName("");
      close();
      // Invalidate submenu + lists page state; router.refresh() alone
      // only re-renders Server Components.
      notifyCollectionsChanged();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : isEdit ? "Falha ao renomear" : "Falha ao criar lista");
    } finally {
      setIsSubmitting(false);
    }
  }

  const heading = isEdit ? "Renomear lista" : "Nova Coleção";
  const confirmLabel = isEdit ? "Salvar alterações" : "Criar";

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="rpgui-container framed-golden w-full max-w-md p-6">
        <h2 className="font-display text-xl">{heading}</h2>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <RPGUInput
            className="w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da lista"
            maxLength={100}
            autoFocus
          />
          {error && <p role="alert">{error}</p>}
          <div className="flex gap-2">
            <RPGUIButton
              type="submit"
              title={isSubmitting ? `${confirmLabel}…` : confirmLabel}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            />
            <RPGUIButton
              type="button"
              title="Cancelar"
              onClick={close}
              disabled={isSubmitting}
            />
            {isSubmitting && <span className="font-display text-xs self-center" aria-live="polite">[ Carregando... ]</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
