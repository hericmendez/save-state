"use client";

/**
 * Phase 3 — "Minha review" section shared by NewGame and EditGame.
 *
 * Controlled component: the parent form owns the `ReviewFormValue`
 * (absent / linked draft / pending removal) and the editor navigation.
 * This section owns draft reads, previews, the BroadcastChannel
 * subscription and the remove/undo UI — never a full Tiptap bundle and
 * never a MongoDB write.
 *
 * - Empty draft content at submit is handled by the finalizer (absent),
 *   never by this UI.
 * - `clear` only marks removal as pending: the server changes solely via
 *   the form's single submit request (`review: null`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDraft,
  deleteDraft,
  findDraftByGame,
  getDraft,
} from "./draft-store";
import {
  isNewerDraftMessage,
  subscribeDraftUpdates,
} from "./draft-channel";
import {
  draftPreviewText,
  REVIEW_DRAFT_MAX_LENGTH,
} from "./editor-markdown";
import {
  SessionExpiredError,
  fetchServerReview,
} from "./review-api-client";
import type { ReviewDraft } from "./editor-types";

export type ReviewFormValue =
  | { kind: "absent" }
  | { kind: "draft"; draftId: string }
  | { kind: "clear" };

export interface OpenEditorRequest {
  draftId?: string;
  userGameId?: string;
}

export interface ReviewFormSectionProps {
  mode: "create" | "edit";
  /** Session identity from the parent (null while loading). */
  userId: string | null;
  /** Edit mode: the UserGame being edited. */
  userGameId?: string;
  /** Plain-text preview already available (no full fetch). */
  serverExcerpt?: string | null;
  /** Whether a persisted review exists (legacy or GameReview). */
  serverHasReview: boolean;
  value: ReviewFormValue;
  onChange(value: ReviewFormValue): void;
  /** Parent builds the URL and chooses new-tab vs same-tab navigation. */
  onOpenEditor(request: OpenEditorRequest): void;
  /** Display-only title for a fresh draft (e.g. the form game name). */
  draftTitle?: string;
  disabled?: boolean;
}

function formatTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "";
  }
}

export function ReviewFormSection({
  mode,
  userId,
  userGameId,
  serverExcerpt,
  serverHasReview,
  value,
  onChange,
  onOpenEditor,
  draftTitle,
  disabled = false,
}: ReviewFormSectionProps) {
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [draftMissing, setDraftMissing] = useState(false);
  const [draftRemovedElsewhere, setDraftRemovedElsewhere] = useState(false);
  const [foundLocalDraft, setFoundLocalDraft] = useState<ReviewDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmingRemoveDraft, setConfirmingRemoveDraft] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [previousValue, setPreviousValue] = useState<ReviewFormValue | null>(null);
  const [viewingServer, setViewingServer] = useState(false);
  const [serverFull, setServerFull] = useState<string | null>(null);
  const [serverFullError, setServerFullError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const valueRef = useRef(value);
  valueRef.current = value;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const boundDraftId = value.kind === "draft" ? value.draftId : null;

  const refreshDraft = useCallback(
    async (draftId: string) => {
      const owner = userIdRef.current;
      if (!owner) return;
      try {
        const row = await getDraft(draftId, owner);
        if (!row) {
          setDraft(null);
          setDraftMissing(true);
          return;
        }
        setDraft(row);
        setDraftMissing(false);
        setDraftRemovedElsewhere(false);
      } catch {
        setLocalError("Não foi possível ler o rascunho neste dispositivo.");
      }
    },
    [],
  );

  // Bind the linked draft; in edit mode also probe for an unlinked local
  // draft (recovery offer — never auto-bound, never auto-merged).
  useEffect(() => {
    let cancelled = false;
    setFoundLocalDraft(null);
    if (!userId) {
      setDraft(null);
      return;
    }
    if (boundDraftId) {
      void refreshDraft(boundDraftId);
      return;
    }
    setDraft(null);
    setDraftMissing(false);
    if (mode === "edit" && userGameId) {
      void findDraftByGame(userId, userGameId)
        .then((row) => {
          if (!cancelled) setFoundLocalDraft(row);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [mode, userId, userGameId, value.kind, boundDraftId, refreshDraft]);

  // Cross-tab updates for the bound draft (or its deletion elsewhere).
  useEffect(() => {
    const current = valueRef.current;
    if (current.kind !== "draft") return;
    const draftId = current.draftId;
    const subscription = subscribeDraftUpdates((message) => {
      if (message.draftId !== draftId) return;
      const owner = userIdRef.current;
      if (!owner) return;
      void getDraft(draftId, owner)
        .then((row) => {
          if (!row) {
            setDraft(null);
            setDraftRemovedElsewhere(true);
            return;
          }
          setDraft((prev) => {
            if (
              prev &&
              !isNewerDraftMessage(message, prev.revision, prev.updatedAt)
            ) {
              return prev;
            }
            return row;
          });
        })
        .catch(() => {});
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshDraft(draftId);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [boundDraftId, refreshDraft]);

  useEffect(() => {
    if (viewingServer && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [viewingServer]);

  const handleCreateDraft = useCallback(async () => {
    if (!userId || busy || disabled) return;
    setBusy(true);
    setLocalError(null);
    try {
      const row = await createDraft({
        userId,
        content: "",
        ...(draftTitle && draftTitle.trim()
          ? { gameName: draftTitle.trim() }
          : {}),
      });
      onChange({ kind: "draft", draftId: row.draftId });
      onOpenEditor({ draftId: row.draftId });
    } catch {
      setLocalError(
        "Não foi possível criar o rascunho neste dispositivo. " +
          "Verifique o armazenamento do navegador.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, draftTitle, onChange, onOpenEditor, userId]);

  const handleDeleteDraft = useCallback(async () => {
    if (!userId) return;
    const current = valueRef.current;
    if (current.kind !== "draft") return;
    setBusy(true);
    try {
      await deleteDraft(current.draftId, userId);
    } catch {
      // Best effort: unlink anyway so the form is never stuck.
    } finally {
      setConfirmingRemoveDraft(false);
      setBusy(false);
      setDraft(null);
      onChange({ kind: "absent" });
    }
  }, [onChange, userId]);

  const handleViewServer = useCallback(async () => {
    if (!userGameId) return;
    setViewingServer(true);
    setServerFull(null);
    setServerFullError(null);
    try {
      const result = await fetchServerReview(userGameId);
      if (result.status === "found") setServerFull(result.review.content);
      else setServerFullError("A review persistida não foi encontrada.");
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        setServerFullError("Sessão expirada. Faça login novamente.");
      } else {
        setServerFullError("Não foi possível carregar a review.");
      }
    }
  }, [userGameId]);

  const excerpt = (serverExcerpt ?? "").trim();

  return (
    <section aria-label="Minha review" className="flex flex-col gap-2">
      <h2 className="font-display text-xl mt-5">Minha review</h2>
      <hr className="mb-2" />

      {localError && (
        <p role="alert">{localError}</p>
      )}

      {value.kind === "clear" ? (
        <div className="rpgui-container framed-grey p-4 flex flex-col gap-2">
          <p>
            <strong>Remoção pendente.</strong> A review será removida apenas
            ao salvar o formulário. Nada mudou no servidor ainda.
          </p>
          <div className="review-btn-row">
            <button
              type="button"
              className="rpgui-container framed-grey review-btn"
              disabled={disabled}
              onClick={() => {
                onChange(previousValue ?? { kind: "absent" });
                setPreviousValue(null);
                setConfirmingClear(false);
              }}
            >
              Desfazer remoção
            </button>
          </div>
        </div>
      ) : value.kind === "draft" ? (
        <div className="rpgui-container framed-grey p-4 flex flex-col gap-2">
          {draftMissing || draftRemovedElsewhere ? (
            <>
              <p role="alert">
                O rascunho vinculado não foi encontrado neste dispositivo
                (pode ter sido excluído em outra guia). Nenhum conteúdo foi
                enviado ao servidor.
              </p>
              <div className="review-btn-row">
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={disabled || busy || !userId}
                  onClick={() => void handleCreateDraft()}
                >
                  Criar novo rascunho
                </button>
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={disabled}
                  onClick={() => {
                    setDraftMissing(false);
                    setDraftRemovedElsewhere(false);
                    onChange({ kind: "absent" });
                  }}
                >
                  Desvincular
                </button>
              </div>
            </>
          ) : draft ? (
            <>
              <p>
                <strong>Rascunho local</strong> (não salvo no servidor) —{" "}
                {draft.content.trim() ? (
                  <q>{draftPreviewText(draft.content)}</q>
                ) : (
                  <em>rascunho em branco</em>
                )}
              </p>
              <p aria-label="Estado do rascunho">
                <small>
                  Atualizado em {formatTime(draft.updatedAt)} (r{draft.revision}
                  ) · {draft.content.length}/{REVIEW_DRAFT_MAX_LENGTH}{" "}
                  caracteres
                </small>
              </p>
              <div className="review-btn-row">
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={disabled}
                  onClick={() => onOpenEditor({ draftId: draft.draftId })}
                >
                  Continuar escrevendo
                </button>
                {!confirmingRemoveDraft ? (
                  <>
                    <button
                      type="button"
                      className="rpgui-container framed-grey review-btn"
                      disabled={disabled}
                      onClick={() => onChange({ kind: "absent" })}
                    >
                      Desvincular
                    </button>
                    <button
                      type="button"
                      className="rpgui-container framed-grey review-btn"
                      disabled={disabled || busy}
                      onClick={() => setConfirmingRemoveDraft(true)}
                    >
                      Excluir rascunho
                    </button>
                  </>
                ) : (
                  <>
                    <span role="alert">Excluir este rascunho?</span>
                    <button
                      type="button"
                      className="rpgui-container framed-grey review-btn"
                      disabled={disabled || busy}
                      onClick={() => void handleDeleteDraft()}
                    >
                      Confirmar exclusão
                    </button>
                    <button
                      type="button"
                      className="rpgui-container framed-grey review-btn"
                      disabled={disabled || busy}
                      onClick={() => setConfirmingRemoveDraft(false)}
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p role="status">Carregando rascunho…</p>
          )}
        </div>
      ) : mode === "create" ? (
        <div className="rpgui-container framed-grey p-4 flex flex-col gap-2">
          <p>
            A review é opcional. O editor salva rascunhos automaticamente
            neste dispositivo — você pode começar agora e terminar depois.
          </p>
          <div>
            <button
              type="button"
              className="rpgui-container framed-grey review-btn"
              disabled={disabled || busy || !userId}
              onClick={() => void handleCreateDraft()}
            >
              Escrever review
            </button>
          </div>
          {!userId && (
            <p role="alert">
              Verificando sua sessão para isolar o rascunho…
            </p>
          )}
        </div>
      ) : (
        <div className="rpgui-container framed-grey p-4 flex flex-col gap-2">
          {foundLocalDraft && (
            <div role="status" className="flex flex-col gap-2">
              <p>
                <strong>Há um rascunho local</strong> editado em{" "}
                {formatTime(foundLocalDraft.updatedAt)}
                {serverHasReview
                  ? " além da review salva no servidor. Nada foi mesclado."
                  : "."}{" "}
                <q>{draftPreviewText(foundLocalDraft.content)}</q>
              </p>
              <div className="review-btn-row">
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={disabled}
                  onClick={() => {
                    onChange({
                      kind: "draft",
                      draftId: foundLocalDraft.draftId,
                    });
                    onOpenEditor({ draftId: foundLocalDraft.draftId });
                  }}
                >
                  Continuar rascunho
                </button>
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={disabled || busy}
                  onClick={() => {
                    if (!userId) return;
                    setBusy(true);
                    void deleteDraft(foundLocalDraft.draftId, userId)
                      .catch(() => {})
                      .finally(() => {
                        setBusy(false);
                        setFoundLocalDraft(null);
                      });
                  }}
                >
                  Descartar rascunho
                </button>
              </div>
            </div>
          )}
          {serverHasReview ? (
            <>
              <p>
                <strong>Review salva no servidor</strong> —{" "}
                {excerpt ? <q>{excerpt}</q> : <em>(prévia indisponível)</em>}
              </p>
              <div className="review-btn-row">
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={disabled}
                  onClick={() => void handleViewServer()}
                >
                  Ver review
                </button>
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={disabled}
                  onClick={() => {
                    if (foundLocalDraft) {
                      onChange({
                        kind: "draft",
                        draftId: foundLocalDraft.draftId,
                      });
                      onOpenEditor({ draftId: foundLocalDraft.draftId });
                    } else {
                      onOpenEditor({ userGameId });
                    }
                  }}
                >
                  Editar review
                </button>
                {!confirmingClear ? (
                  <button
                    type="button"
                    className="rpgui-container framed-grey review-btn"
                    disabled={disabled}
                    onClick={() => setConfirmingClear(true)}
                  >
                    Remover review
                  </button>
                ) : (
                  <>
                    <span role="alert">
                      Marcar a review para remoção ao salvar?
                    </span>
                    <button
                      type="button"
                      className="rpgui-container framed-grey review-btn"
                      disabled={disabled}
                      onClick={() => {
                        setPreviousValue(value);
                        setConfirmingClear(false);
                        onChange({ kind: "clear" });
                      }}
                    >
                      Confirmar remoção
                    </button>
                    <button
                      type="button"
                      className="rpgui-container framed-grey review-btn"
                      disabled={disabled}
                      onClick={() => setConfirmingClear(false)}
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            !foundLocalDraft && (
              <>
                <p>
                  A review é opcional. O editor salva rascunhos
                  automaticamente neste dispositivo.
                </p>
                <div>
                  <button
                    type="button"
                    className="rpgui-container framed-grey review-btn"
                    disabled={disabled || busy || !userId}
                    onClick={() => void handleCreateDraft()}
                  >
                    Escrever review
                  </button>
                </div>
              </>
            )
          )}
        </div>
      )}

      {viewingServer && (
        <div
          className="rpgui-container framed p-4 flex flex-col gap-2"
          role="dialog"
          aria-label="Review salva no servidor"
          onKeyDown={(event) => {
            if (event.key === "Escape") setViewingServer(false);
          }}
        >
          <h3>Review salva no servidor</h3>
          {serverFullError ? (
            <p role="alert">{serverFullError}</p>
          ) : serverFull === null ? (
            <p role="status">Carregando…</p>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap" }}>{serverFull}</pre>
          )}
          <div>
            <button
              ref={closeButtonRef}
              type="button"
              className="rpgui-container framed-grey review-btn"
              onClick={() => setViewingServer(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
