"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import { ConfirmDialog } from "./confirm-dialog";
import {
  NOTES_MAX_LENGTH,
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type UserGameNote,
} from "./notes";

function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteForm({
  initialContent = "",
  label,
  submitLabel,
  savingLabel,
  busy,
  error,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  initialContent?: string;
  label: string;
  submitLabel: string;
  savingLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (content: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [content, setContent] = useState(initialContent);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const remaining = NOTES_MAX_LENGTH - content.length;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (content.trim().length === 0) {
      setValidationError("Escreva alguma coisa antes de salvar.");
      return;
    }
    if (content.length > NOTES_MAX_LENGTH) {
      setValidationError(
        `A anotação pode ter no máximo ${NOTES_MAX_LENGTH} caracteres.`,
      );
      return;
    }
    setValidationError(null);
    onSubmit(content);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm">
        {label}
      </label>
      <textarea
        id={fieldId}
        ref={inputRef}
        value={content}
        maxLength={NOTES_MAX_LENGTH + 1}
        rows={3}
        disabled={busy}
        onChange={(event) => setContent(event.target.value)}
        className="rpgui-container framed-grey w-full p-2 text-sm"
      />
      <div className="flex items-center justify-between text-xs opacity-70">
        <span>{remaining} caracteres restantes</span>
      </div>
      {validationError && (
        <p role="alert" className="text-sm">
          {validationError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <RPGUIButton
          type="submit"
          title={busy ? savingLabel : submitLabel}
          disabled={busy}
          aria-busy={busy}
        />
        {onCancel && (
          <RPGUIButton
            type="button"
            title="Cancelar"
            onClick={onCancel}
            disabled={busy}
          />
        )}
        {busy && (
          <span className="font-display text-xs self-center" aria-live="polite">
            [ Carregando... ]
          </span>
        )}
      </div>
    </form>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) return error.message;
  return fallback;
}

/**
 * Notes section for the game detail modal.
 *
 * Mounted only while the modal is open, so notes are never fetched with
 * the modal closed. Pagination appends older pages ("Carregar mais").
 */
export function GameNotesSection({
  userGameId,
  autoFocusNew = false,
}: {
  userGameId: string;
  autoFocusNew?: boolean;
}) {
  const [notes, setNotes] = useState<UserGameNote[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  // Bumped after each successful create so the new-note form remounts empty.
  const [formKey, setFormKey] = useState(0);
  // Tracks the mounted game across async boundaries (stale-append guard).
  const userGameIdRef = useRef(userGameId);
  userGameIdRef.current = userGameId;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      // Fresh game context: stale page cursors must not skip the new list.
      setPage(1);
      setHasMore(false);
      try {
        const result = await listNotes(userGameId, 1);
        if (cancelled) return;
        setNotes(result.data);
        setPage(result.pagination.page);
        setHasMore(result.pagination.hasNextPage);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadError(errorMessage(error, "Não foi possível carregar as anotações."));
        setStatus("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userGameId]);

  async function handleCreate(content: string) {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createNote(userGameId, content);
      setNotes((current) => [created, ...current]);
      setFormKey((key) => key + 1);
    } catch (error) {
      setCreateError(errorMessage(error, "Falha ao salvar a anotação."));
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(noteId: string, content: string) {
    if (savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await updateNote(userGameId, noteId, content);
      setNotes((current) =>
        current.map((note) => (note._id === noteId ? updated : note)),
      );
      setEditingId(null);
    } catch (error) {
      setEditError(errorMessage(error, "Falha ao salvar a edição."));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete(noteId: string) {
    if (deletingId) return;
    setDeletingId(noteId);
    setDeleteError(null);
    try {
      await deleteNote(userGameId, noteId);
      setNotes((current) => current.filter((note) => note._id !== noteId));
      setConfirmingDeleteId(null);
    } catch (error) {
      setDeleteError(errorMessage(error, "Falha ao excluir a anotação."));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleLoadMore() {
    if (loadingMore || !hasMore) return;
    // Capture the game context: a game switch mid-request must not append
    // another game's notes into this list.
    const gameId = userGameId;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const result = await listNotes(gameId, nextPage);
      setNotes((current) =>
        // Ignore the response if the game changed while loading.
        gameId === userGameIdRef.current
          ? [...current, ...result.data]
          : current,
      );
      if (gameId === userGameIdRef.current) {
        setPage(result.pagination.page);
        setHasMore(result.pagination.hasNextPage);
      }
    } catch (error) {
      if (gameId === userGameIdRef.current) {
        setLoadError(errorMessage(error, "Não foi possível carregar mais anotações."));
      }
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section aria-label="Anotações" className="mt-4">
      <h3 className="font-display text-lg">Anotações</h3>
      {status === "loading" && (
        <p className="mt-2 text-sm" aria-busy="true">
          [ Carregando... ]
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="mt-2 text-sm">
          {loadError}
        </p>
      )}
      {status === "ready" && (
        <>
          <NoteForm
            key={formKey}
            label="Nova anotação"
            submitLabel="Salvar anotação"
            savingLabel="Salvando…"
            busy={creating}
            error={createError}
            onSubmit={(content) => void handleCreate(content)}
            autoFocus={autoFocusNew}
          />
          {deleteError && (
            <p role="alert" className="mt-2 text-sm">
              {deleteError}
            </p>
          )}
          {notes.length === 0 ? (
            <p className="mt-3 text-sm opacity-70">
              Nenhuma anotação ainda. Escreva a primeira acima.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {notes.map((note) => (
                <li
                  key={note._id}
                  className="rpgui-container framed-grey p-3"
                >
                  {editingId === note._id ? (
                    <NoteForm
                      initialContent={note.content}
                      label="Editar anotação"
                      submitLabel="Salvar edição"
                      savingLabel="Salvando…"
                      busy={savingEdit}
                      error={editError}
                      onSubmit={(content) =>
                        void handleSaveEdit(note._id, content)
                      }
                      onCancel={() => {
                        setEditingId(null);
                        setEditError(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">
                        {note.content}
                      </p>
                      <p className="mt-1 text-xs opacity-70">
                        {formatNoteDate(note.createdAt)}
                        {note.updatedAt !== note.createdAt
                          ? " (editada)"
                          : ""}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <RPGUIButton
                          type="button"
                          title="Editar"
                          aria-label={`Editar anotação de ${formatNoteDate(note.createdAt)}`}
                          onClick={() => {
                            setEditingId(note._id);
                            setEditError(null);
                          }}
                          disabled={savingEdit || deletingId !== null}
                        />
                        <RPGUIButton
                          type="button"
                          title="Excluir"
                          aria-label={`Excluir anotação de ${formatNoteDate(note.createdAt)}`}
                          onClick={() => setConfirmingDeleteId(note._id)}
                          disabled={savingEdit || deletingId !== null}
                        />
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <div className="mt-2">
              <RPGUIButton
                type="button"
                title={loadingMore ? "Carregando…" : "Carregar mais"}
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                aria-busy={loadingMore}
              />
            </div>
          )}
          {loadError && status === "ready" && (
            <p role="alert" className="mt-2 text-sm">
              {loadError}
            </p>
          )}
        </>
      )}
      {confirmingDeleteId && (
        <ConfirmDialog
          title="Excluir anotação"
          message="Tem certeza? Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          onConfirm={() => void handleConfirmDelete(confirmingDeleteId)}
          onCancel={() => setConfirmingDeleteId(null)}
          isLoading={deletingId !== null}
        />
      )}
    </section>
  );
}
