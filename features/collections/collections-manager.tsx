"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type { GameCollection } from "@/features/shared/types";
import { ConfirmDialog } from "@/features/games/confirm-dialog";
import {
  notifyCollectionsChanged,
  useCollectionsVersion,
} from "./collections-signal";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";
import { FaEye, FaPen } from "react-icons/fa6";

export function CollectionsManager({ initialCollections }: { initialCollections: GameCollection[] }) {
  const router = useRouter();
  const [collections, setCollections] = useState<GameCollection[]>(initialCollections);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GameCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function refresh() {
    try {
      const result = await apiRequest<{ data: GameCollection[]; pagination: unknown }>(
        "/api/game-collections?limit=100&withCount=true",
      );
      setCollections(result.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao recarregar");
    }
  }

  // Stay consistent with submenu-driven changes (same shared signal the
  // nav and the create modal use). Skips the initial mount: SSR already
  // provided initialCollections.
  const collectionsVersion = useCollectionsVersion();
  const firstVersionRender = useRef(true);
  useEffect(() => {
    if (firstVersionRender.current) {
      firstVersionRender.current = false;
      return;
    }
    void refresh();
  }, [collectionsVersion]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim() || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await apiRequest("/api/game-collections", {
        method: "POST",
        body: { name: newName.trim() },
      });
      setNewName("");
      notifyCollectionsChanged();
      router.refresh();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao criar coleção");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRename(collectionId: string) {
    if (!renamingName.trim() || isRenaming) return;
    setError(null);
    setIsRenaming(true);
    try {
      await apiRequest(`/api/game-collections/${collectionId}`, {
        method: "PATCH",
        body: { name: renamingName.trim() },
      });
      setRenamingId(null);
      setRenamingName("");
      notifyCollectionsChanged();
      router.refresh();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao renomear");
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || isDeleting) return;
    const target = deleteTarget;
    setError(null);
    setIsDeleting(true);
    try {
      await apiRequest(`/api/game-collections/${target._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      notifyCollectionsChanged();
      router.refresh();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao excluir");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Minhas coleções</h1>
      </header>
      {error && (
        <p role="alert" className="rpgui-container framed-grey p-3">
          {error}
        </p>
      )}
      <form
        onSubmit={handleCreate}
        className="flex gap-2 p-4"
      >
        <RPGUInput
          className="flex-1"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Nova coleção"
          maxLength={100}
        />
        <RPGUIButton type="submit" title="Criar" disabled={isSubmitting} />
      </form>
      {collections.length === 0 ? (
        <p>Nenhuma coleção ainda. Crie a primeira acima.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {collections.map((collection) => (
            <li
              key={collection._id}
              className="rpgui-container framed-golden flex flex-wrap items-center gap-2 p-3"
            >
              {renamingId === collection._id ? (
                <>
                  <RPGUInput
                    className="flex-1"
                    value={renamingName}
                    onChange={(event) => setRenamingName(event.target.value)}
                    maxLength={100}
                    autoFocus
                  />
                  <RPGUIButton
                    type="button"
                    title={isRenaming ? "Salvando…" : "Salvar"}
                    onClick={() => handleRename(collection._id)}
                    disabled={isRenaming}
                    aria-busy={isRenaming}
                  />
                  <RPGUIButton
                    type="button"
                    title="Cancelar"
                    onClick={() => setRenamingId(null)}
                    disabled={isRenaming}
                  />
                  {isRenaming && (
                    <span className="font-display text-xs" aria-live="polite">
                      [ Carregando... ]
                    </span>
                  )}
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="font-display">{collection.name}</p>
                    {typeof collection.gameCount === "number" && (
                      <p className="text-xs">{collection.gameCount} jogos</p>
                    )}
                  </div>
                  <Link
                    href={`/backlog/lists/${collection._id}`}
                    className="rpgui-container framed-grey flex h-9 w-9 items-center justify-center text-lg transition-all hover:[--webkit-text-stroke:1px]"
                    aria-label="Ver jogos"
                    title="Ver jogos"
                  >
                    <FaEye />
                  </Link>
                  <button
                    type="button"
                    aria-label="Renomear"
                    title="Renomear"
                    className="rpgui-container framed-grey flex h-9 w-9 items-center justify-center text-lg transition-all hover:[--webkit-text-stroke:1px]"
                    onClick={() => {
                      setRenamingId(collection._id);
                      setRenamingName(collection.name);
                    }}
                  >
                    <FaPen className="text-sm" />
                  </button>
                  <button
                    type="button"
                    aria-label="Excluir"
                    title="Excluir"
                    className="rpgui-container framed-grey flex h-9 w-9 items-center justify-center text-lg font-display text-red-500! transition-all hover:[--webkit-text-stroke:1px]"
                    onClick={() => setDeleteTarget(collection)}
                  >
                    X
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Excluir coleção"
          message={`Excluir a coleção "${deleteTarget.name}"? Os jogos serão preservados.`}
          confirmLabel="Excluir"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => !isDeleting && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
