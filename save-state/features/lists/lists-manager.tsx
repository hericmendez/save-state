"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type { GameList } from "@/features/shared/types";
import { ConfirmDialog } from "@/features/games/confirm-dialog";

export function ListsManager({ initialLists }: { initialLists: GameList[] }) {
  const router = useRouter();
  const [lists, setLists] = useState<GameList[]>(initialLists);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GameList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refresh() {
    try {
      const result = await apiRequest<{ data: GameList[]; pagination: unknown }>(
        "/api/game-lists?limit=100&withCount=true",
      );
      setLists(result.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao recarregar");
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim() || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await apiRequest("/api/game-lists", {
        method: "POST",
        body: { name: newName.trim() },
      });
      setNewName("");
      router.refresh();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao criar lista");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRename(listId: string) {
    if (!renamingName.trim()) return;
    setError(null);
    try {
      await apiRequest(`/api/game-lists/${listId}`, {
        method: "PATCH",
        body: { name: renamingName.trim() },
      });
      setRenamingId(null);
      setRenamingName("");
      router.refresh();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao renomear");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setError(null);
    try {
      await apiRequest(`/api/game-lists/${target._id}`, { method: "DELETE" });
      router.refresh();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao excluir");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Minhas listas</h1>
      </header>
      {error && (
        <p role="alert" className="rpgui-container framed-grey p-3">
          {error}
        </p>
      )}
      <form
        onSubmit={handleCreate}
        className="rpgui-container framed-golden flex gap-2 p-4"
      >
        <input
          className="rpgui-input flex-1"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Nova lista"
          maxLength={100}
        />
        <button className="rpgui-button" type="submit" disabled={isSubmitting}>
          Criar
        </button>
      </form>
      {lists.length === 0 ? (
        <p>Nenhuma lista ainda. Crie a primeira acima.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lists.map((list) => (
            <li
              key={list._id}
              className="rpgui-container framed-golden flex flex-wrap items-center gap-2 p-3"
            >
              {renamingId === list._id ? (
                <>
                  <input
                    className="rpgui-input flex-1"
                    value={renamingName}
                    onChange={(event) => setRenamingName(event.target.value)}
                    maxLength={100}
                    autoFocus
                  />
                  <button
                    className="rpgui-button"
                    type="button"
                    onClick={() => handleRename(list._id)}
                  >
                    Salvar
                  </button>
                  <button
                    className="rpgui-button"
                    type="button"
                    onClick={() => setRenamingId(null)}
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="font-display">{list.name}</p>
                    {typeof list.gameCount === "number" && (
                      <p className="text-xs">{list.gameCount} jogos</p>
                    )}
                  </div>
                  <Link
                    className="rpgui-button"
                    href={`/backlog/lists/${list._id}`}
                  >
                    Ver jogos
                  </Link>
                  <button
                    className="rpgui-button"
                    type="button"
                    onClick={() => {
                      setRenamingId(list._id);
                      setRenamingName(list.name);
                    }}
                  >
                    Renomear
                  </button>
                  <button
                    className="rpgui-button"
                    type="button"
                    onClick={() => setDeleteTarget(list)}
                  >
                    Excluir
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Excluir lista"
          message={`Excluir a lista "${deleteTarget.name}"? Os jogos serão preservados.`}
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
