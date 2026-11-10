"use client";

/**
 * Review Editor — screen orchestrator (Phase 2).
 *
 * Owns the draft lifecycle; the Tiptap surface (`tiptap-review-editor.tsx`,
 * lazy + `ssr: false`) only edits Markdown. Rules enforced here:
 *
 * - Identity comes from `GET /api/auth/me` — never from the URL. All
 *   IndexedDB access is scoped to that userId (logout/account-switch is
 *   detected on tab visibility: a changed identity reloads the screen so
 *   drafts can never leak across accounts on a shared browser).
 * - Phase 2 never writes to MongoDB. The server copy (when `?userGameId=`)
 *   is read-only context; starting a local copy is always explicit.
 * - Autosave (500 ms debounce) targets IndexedDB only, with OCC revisions.
 *   Conflicts preserve the unsaved text and require an explicit resolution.
 * - Cross-tab messages carry no Markdown; IndexedDB is the source of truth.
 * - On storage failure the content stays in memory with a clear warning.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./review-editor.css";
import {
  DraftConflictError,
  DraftNotFoundError,
  DraftStorageUnavailableError,
  createDraft,
  deleteDraft,
  findDraftByGame,
  getDraft,
  listDrafts,
  updateDraft,
} from "./draft-store";
import {
  isNewerDraftMessage,
  subscribeDraftUpdates,
  type DraftChannelSubscription,
} from "./draft-channel";
import {
  AUTOSAVE_DEBOUNCE_MS,
  REVIEW_DRAFT_MAX_LENGTH,
  draftPreviewText,
  draftRemainingChars,
  isDraftOverLimit,
  resolveEditorEntry,
} from "./editor-markdown";
import {
  SessionExpiredError,
  fetchGameSummary,
  fetchServerReview,
  fetchSessionIdentity,
  type ServerReviewCopy,
} from "./review-api-client";
import type {
  DraftSaveStatus,
  ReviewDraft,
  ReviewEditorEntry,
  ReviewEditorMode,
} from "./editor-types";

const TiptapReviewEditor = dynamic(
  () =>
    import("./tiptap-review-editor").then((mod) => mod.TiptapReviewEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rpgui-container framed-grey" role="status">
        <p>Carregando editor…</p>
      </div>
    ),
  },
);

interface ReviewEditorScreenProps {
  draftIdParam: string;
  userGameIdParam: string;
}

type BootState =
  | { kind: "loading" }
  | { kind: "ambiguous" }
  | { kind: "ready" }
  | { kind: "fatal"; message: string };

const SAVE_STATUS_LABELS: Record<DraftSaveStatus, string> = {
  idle: "Nenhuma alteração",
  dirty: "Alterações pendentes…",
  saving: "Salvando rascunho…",
  saved: "Rascunho salvo neste dispositivo",
  conflict: "Conflito entre versões",
  error: "Erro ao salvar",
  "session-expired": "Sessão expirada — salvamento pausado",
  "storage-unavailable": "Armazenamento indisponível — texto mantido em memória",
};

function formatTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "";
  }
}

export function ReviewEditorScreen({
  draftIdParam,
  userGameIdParam,
}: ReviewEditorScreenProps) {
  const entry: ReviewEditorEntry = useMemo(
    () =>
      resolveEditorEntry({ draftId: draftIdParam, userGameId: userGameIdParam }),
    [draftIdParam, userGameIdParam],
  );

  const [boot, setBoot] = useState<BootState>({ kind: "loading" });
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<ReviewEditorMode>("visual");
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>("idle");
  const [serverCopy, setServerCopy] = useState<ServerReviewCopy | null>(null);
  const [serverCopyMissing, setServerCopyMissing] = useState(false);
  const [gameName, setGameName] = useState<string | null>(null);
  const [existingGameDraft, setExistingGameDraft] =
    useState<ReviewDraft | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [draftList, setDraftList] = useState<ReviewDraft[]>([]);
  const [conflictPersisted, setConflictPersisted] =
    useState<ReviewDraft | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [continueOffline, setContinueOffline] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const stateRef = useRef({
    draft,
    content,
    userId,
    saveStatus,
    continueOffline,
  });
  stateRef.current = { draft, content, userId, saveStatus, continueOffline };
  const channelRef = useRef<DraftChannelSubscription | null>(null);

  const refreshDraftList = useCallback(async (ownerId: string) => {
    try {
      setDraftList(await listDrafts(ownerId));
    } catch {
      setDraftList([]);
    }
  }, []);

  const persistNow = useCallback(
    async (options?: { force?: boolean }) => {
      const snapshot = stateRef.current;
      if (!snapshot.draft || !snapshot.userId) return;
      if (snapshot.saveStatus === "session-expired" && !snapshot.continueOffline)
        return;
      if (savingRef.current && !options?.force) return;
      // Nothing new to persist.
      if (snapshot.draft.content === snapshot.content && !options?.force) {
        return;
      }
      savingRef.current = true;
      setSaveStatus("saving");
      try {
        const next = await updateDraft(
          snapshot.draft.draftId,
          snapshot.userId,
          snapshot.draft.revision,
          { content: snapshot.content },
        );
        setDraft(next);
        setConflictPersisted(null);
        setSaveStatus("saved");
        channelRef.current?.post({
          type: "draft-updated",
          draftId: next.draftId,
          revision: next.revision,
          updatedAt: next.updatedAt,
        });
        if (snapshot.userId) void refreshDraftList(snapshot.userId);
      } catch (error) {
        if (error instanceof DraftConflictError) {
          // Local text is preserved in `content`; the persisted row is
          // offered for explicit resolution (never auto-merged).
          setConflictPersisted(error.persisted);
          setSaveStatus("conflict");
        } else if (error instanceof DraftNotFoundError) {
          setFatal(
            "Este rascunho foi excluído (neste ou em outro dispositivo). " +
              "Seu texto atual foi mantido na tela — copie-o ou crie um novo rascunho.",
          );
          setSaveStatus("error");
        } else if (error instanceof DraftStorageUnavailableError) {
          setSaveStatus("storage-unavailable");
        } else {
          setSaveStatus("error");
        }
      } finally {
        savingRef.current = false;
      }
    },
    [refreshDraftList],
  );

  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus((current) =>
      current === "session-expired" || current === "storage-unavailable"
        ? current
        : "dirty",
    );
    saveTimer.current = setTimeout(() => {
      void persistNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [persistNow]);

  const handleMarkdownChange = useCallback(
    (next: string) => {
      setContent(next);
      // The save state flips to dirty immediately; persistence is async.
      if (stateRef.current.draft) scheduleAutosave();
    },
    [scheduleAutosave],
  );

  // ---- boot: identity first, then entry mode ----
  useEffect(() => {
    let cancelled = false;
    async function bootScreen() {
      if (entry.kind === "ambiguous") {
        setBoot({ kind: "ambiguous" });
        return;
      }
      let identity: string;
      try {
        const session = await fetchSessionIdentity();
        if (cancelled) return;
        identity = session.id;
        setUserId(identity);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof SessionExpiredError) {
          setSaveStatus("session-expired");
          setBoot({
            kind: "fatal",
            message: "Sessão expirada. Faça login novamente para continuar.",
          });
          return;
        }
        if (cancelled) return;
        setBoot({
          kind: "fatal",
          message: "Não foi possível verificar sua sessão. Tente recarregar.",
        });
        return;
      }

      try {
        if (entry.kind === "draft") {
          const row = await getDraft(entry.draftId, identity);
          if (cancelled) return;
          if (!row) {
            // Never create silently over an unknown id — explicit creation.
            setBoot({ kind: "ready" });
            setFatal(
              "Rascunho não encontrado neste dispositivo (ou pertence a outra conta).",
            );
            void refreshDraftList(identity);
            setRecoveryOpen(true);
            return;
          }
          setDraft(row);
          setContent(row.content);
          setSaveStatus("saved");
          if (row.userGameId) {
            void fetchGameSummary(row.userGameId)
              .then((game) => {
                if (!cancelled && game) setGameName(game.name);
              })
              .catch(() => {});
          }
        } else if (entry.kind === "game") {
          const [game, review, local] = await Promise.all([
            fetchGameSummary(entry.userGameId).catch((error) => {
              if (error instanceof SessionExpiredError) throw error;
              return null;
            }),
            fetchServerReview(entry.userGameId).catch((error) => {
              if (error instanceof SessionExpiredError) throw error;
              return { status: "missing" as const };
            }),
            findDraftByGame(identity, entry.userGameId),
          ]);
          if (cancelled) return;
          if (game) setGameName(game.name);
          if (review.status === "found") setServerCopy(review.review);
          else setServerCopyMissing(true);
          if (local) {
            setExistingGameDraft(local);
            setDraft(local);
            setContent(local.content);
            setSaveStatus("saved");
          }
          // Without a local draft nothing is created yet: the user picks
          // an explicit action below (start from server copy or blank).
        }
        if (!cancelled) {
          setBoot({ kind: "ready" });
          void refreshDraftList(identity);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof SessionExpiredError) {
          setSaveStatus("session-expired");
          setBoot({
            kind: "fatal",
            message: "Sessão expirada. Faça login novamente para continuar.",
          });
          return;
        }
        setBoot({
          kind: "fatal",
          message: "Falha ao carregar o editor. Tente recarregar a página.",
        });
      }
    }
    void bootScreen();
    return () => {
      cancelled = true;
    };
  }, [entry, refreshDraftList]);

  // ---- cross-tab notifications (no Markdown travels here) ----
  useEffect(() => {
    const subscription = subscribeDraftUpdates((message) => {
      const snapshot = stateRef.current;
      if (!snapshot.draft || message.draftId !== snapshot.draft.draftId) return;
      if (
        !isNewerDraftMessage(message, snapshot.draft.revision, snapshot.draft.updatedAt)
      )
        return;
      if (snapshot.draft.content !== snapshot.content) {
        // Local unsaved edits: never replace silently.
        setRemoteNotice(
          `Outra guia salvou uma versão mais recente (r${message.revision}). ` +
            "Seu texto atual foi preservado.",
        );
        return;
      }
      // No unsaved edits: safe to refresh from the source of truth.
      const owner = snapshot.userId;
      if (!owner) return;
      void getDraft(message.draftId, owner)
        .then((row) => {
          if (!row) return;
          setDraft(row);
          setContent(row.content);
          setSaveStatus("saved");
          setRemoteNotice(
            `Rascunho atualizado a partir de outra guia (r${row.revision}).`,
          );
        })
        .catch(() => {});
    });
    channelRef.current = subscription;
    return () => {
      subscription.unsubscribe();
      channelRef.current = null;
    };
  }, []);

  // ---- flush on hide/close; detect account switch on visible ----
  // SPA navigation (same document) fires neither `pagehide` nor
  // `visibilitychange`, so the unmount cleanup below is the safety net for
  // in-app route changes with a pending autosave.
  const persistRef = useRef(persistNow);
  persistRef.current = persistNow;
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // No `force`: clean unmounts skip the write (no spurious revision
      // bump); dirty unmounts persist once. Post-unmount setStates no-op.
      void persistRef.current();
    },
    [],
  );
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        void persistNow();
        return;
      }
      // Tab is visible again: confirm the identity did not change
      // (logout / account switch on a shared browser).
      const owner = stateRef.current.userId;
      if (!owner) return;
      void fetchSessionIdentity()
        .then((session) => {
          if (session.id !== owner) window.location.reload();
        })
        .catch(() => {
          // Offline or expired: keep local content, surface the state.
          setSaveStatus((current) =>
            current === "saved" || current === "dirty"
              ? "session-expired"
              : current,
          );
        });
    };
    const onPageHide = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void persistNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [persistNow]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const handleCreateDraft = useCallback(
    async (seed: { content: string; userGameId?: string }) => {
      if (!userId) return;
      setFatal(null);
      try {
        const row = await createDraft({
          userId,
          content: seed.content,
          ...(seed.userGameId ? { userGameId: seed.userGameId } : {}),
          ...(seed.userGameId && gameName ? { gameName } : {}),
        });
        setDraft(row);
        setContent(row.content);
        setConflictPersisted(null);
        setExistingGameDraft(null);
        setSaveStatus("saved");
        setRecoveryOpen(false);
        void refreshDraftList(userId);
      } catch (error) {
        if (error instanceof DraftStorageUnavailableError) {
          setSaveStatus("storage-unavailable");
        } else {
          setFatal("Não foi possível criar o rascunho neste dispositivo.");
        }
      }
    },
    [gameName, refreshDraftList, userId],
  );

  const handleDeleteDraft = useCallback(
    async (draftId: string) => {
      if (!userId) return;
      const ok = await deleteDraft(draftId, userId).catch(() => false);
      if (ok) {
        if (draft?.draftId === draftId) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          setDraft(null);
          setConflictPersisted(null);
          setSaveStatus("idle");
        }
        void refreshDraftList(userId);
      }
    },
    [draft, refreshDraftList, userId],
  );

  const handleLoadRemoteVersion = useCallback(async () => {
    if (!draft || !userId) return;
    const row = await getDraft(draft.draftId, userId).catch(() => null);
    if (!row) {
      setFatal("A versão mais recente não pôde ser lida.");
      return;
    }
    // Explicit user action: discard local text, adopt persisted row.
    setDraft(row);
    setContent(row.content);
    setConflictPersisted(null);
    setRemoteNotice(null);
    setSaveStatus("saved");
  }, [draft, userId]);

  const handleForceOverwrite = useCallback(async () => {
    if (!draft || !userId) return;
    const row = await getDraft(draft.draftId, userId).catch(() => null);
    if (!row) {
      setFatal("A versão mais recente não pôde ser lida.");
      return;
    }
    // Explicit overwrite: rebase onto the persisted revision, then the
    // normal OCC path writes revision+1. Never silent — this button only
    // exists inside the conflict banner.
    setDraft(row);
    try {
      const next = await updateDraft(draft.draftId, userId, row.revision, {
        content: stateRef.current.content,
      });
      setDraft(next);
      setContent(next.content);
      setConflictPersisted(null);
      setSaveStatus("saved");
      channelRef.current?.post({
        type: "draft-updated",
        draftId: next.draftId,
        revision: next.revision,
        updatedAt: next.updatedAt,
      });
      void refreshDraftList(userId);
    } catch {
      const fresh = await getDraft(draft.draftId, userId).catch(() => null);
      if (fresh) setConflictPersisted(fresh);
      setSaveStatus("conflict");
    }
  }, [draft, refreshDraftList, userId]);

  const copyLocalText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(stateRef.current.content);
      setRemoteNotice("Texto local copiado para a área de transferência.");
    } catch {
      setRemoteNotice(
        "Não foi possível acessar a área de transferência neste navegador.",
      );
    }
  }, []);

  const overLimit = isDraftOverLimit(content);
  const remaining = draftRemainingChars(content);

  if (boot.kind === "loading") {
    return (
      <div className="review-editor-shell">
        <div className="rpgui-container framed" role="status">
          <p>Carregando editor de reviews…</p>
        </div>
      </div>
    );
  }

  if (boot.kind === "ambiguous") {
    return (
      <div className="review-editor-shell">
        <div
          className="rpgui-container framed review-banner"
          data-tone="danger"
          role="alert"
        >
          <h1>Parâmetros conflitantes</h1>
          <p>
            Informe <code>draftId</code> ou <code>userGameId</code> — nunca os
            dois. Escolha um caminho:
          </p>
          <p>
            <a className="rpgui-container framed-grey review-btn" href="/reviews/editor">
              Abrir meus rascunhos
            </a>{" "}
            <a className="rpgui-container framed-grey review-btn" href="/backlog">
              Voltar ao Save State
            </a>
          </p>
        </div>
      </div>
    );
  }

  const showRecovery =
    recoveryOpen || (!draft && entry.kind !== "game") || (boot.kind === "ready" && !draft && entry.kind === "empty");

  return (
    <div className="review-editor-shell">
      <header className="rpgui-container framed-grey">
        <h1>Review Editor</h1>
        {gameName && <p aria-label="Jogo">Jogo: {gameName}</p>}
        {draft && (
          <div className="review-statusbar">
            <span role="status" aria-live="polite">
              {SAVE_STATUS_LABELS[saveStatus]}
              {saveStatus === "saved" &&
                ` — ${formatTime(draft.updatedAt)} (r${draft.revision})`}
            </span>
            <span aria-label="Contagem de caracteres">
              {overLimit ? (
                <strong>
                  Limite excedido ({content.length}/{REVIEW_DRAFT_MAX_LENGTH})
                </strong>
              ) : (
                `${content.length}/${REVIEW_DRAFT_MAX_LENGTH} caracteres`
              )}
            </span>
          </div>
        )}
        {overLimit && (
          <p role="alert">
            O rascunho ultrapassou o limite de {REVIEW_DRAFT_MAX_LENGTH}{" "}
            caracteres e não poderá ser enviado ao servidor na Fase 3. Reduza
            o texto. O conteúdo local continua preservado.
          </p>
        )}
        <nav aria-label="Editor" className="review-btn-row">
          <button
            type="button"
            className="rpgui-container framed-grey review-btn"
            aria-expanded={recoveryOpen}
            onClick={() => {
              setRecoveryOpen((open) => !open);
              if (userId) void refreshDraftList(userId);
            }}
          >
            Rascunhos
          </button>
          <Link className="rpgui-container framed-grey review-btn" href="/dashboard">
            Voltar ao Save State
          </Link>
        </nav>
      </header>

      {boot.kind === "fatal" && (
        <div className="review-banner" data-tone="danger" role="alert">
          <p>{boot.message}</p>
          {saveStatus === "session-expired" && (
            <p>
              <a className="rpgui-container framed-grey review-btn" href="/login">
                Fazer login
              </a>{" "}
              <button
                type="button"
                className="rpgui-container framed-grey review-btn"
                onClick={() => {
                  setContinueOffline(true);
                  setBoot({ kind: "ready" });
                  setSaveStatus("dirty");
                  scheduleAutosave();
                }}
              >
                Continuar sem salvar
              </button>
            </p>
          )}
        </div>
      )}

      {fatal && boot.kind === "ready" && (
        <div className="review-banner" data-tone="danger" role="alert">
          <p>{fatal}</p>
        </div>
      )}

      {remoteNotice && (
        <div className="review-banner" data-tone="info" role="status">
          <p>{remoteNotice}</p>
          <p style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="rpgui-container framed-grey review-btn" onClick={() => void handleLoadRemoteVersion()}>
              Carregar versão mais recente
            </button>
            <button type="button" className="rpgui-container framed-grey review-btn" onClick={() => void copyLocalText()}>
              Copiar meu texto
            </button>
            <button type="button" className="rpgui-container framed-grey review-btn" onClick={() => setRemoteNotice(null)}>
              Dispensar
            </button>
          </p>
        </div>
      )}

      {saveStatus === "conflict" && conflictPersisted && (
        <div className="review-banner" data-tone="danger" role="alert">
          <h2>Conflito entre versões</h2>
          <p>
            Outra guia salvou a revisão r{conflictPersisted.revision} enquanto
            você editava. <strong>Seu texto atual foi preservado</strong> e
            nada foi sobrescrito.
          </p>
          <p>
            Versão salva em {formatTime(conflictPersisted.updatedAt)}:{" "}
            <q>{draftPreviewText(conflictPersisted.content)}</q>
          </p>
          <p style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="rpgui-container framed-grey review-btn" onClick={() => void handleLoadRemoteVersion()}>
              Descartar meu texto e carregar a versão salva
            </button>
            <button type="button" className="rpgui-container framed-grey review-btn" onClick={() => void handleForceOverwrite()}>
              Manter meu texto e sobrescrever
            </button>
            <button type="button" className="rpgui-container framed-grey review-btn" onClick={() => void copyLocalText()}>
              Copiar meu texto
            </button>
          </p>
        </div>
      )}

      {saveStatus === "storage-unavailable" && (
        <div className="review-banner" data-tone="danger" role="alert">
          <p>
            Armazenamento local indisponível (modo privado ou navegador sem
            IndexedDB). Seu texto está mantido em memória nesta guia — não
            feche a página antes de copiá-lo.
          </p>
          <p>
            <button type="button" className="rpgui-container framed-grey review-btn" onClick={() => void copyLocalText()}>
              Copiar texto
            </button>
          </p>
        </div>
      )}

      {entry.kind === "game" && !draft && (
        <section className="rpgui-container framed-grey" aria-label="Cópia do servidor">
          <h2>Review no servidor</h2>
          {serverCopy ? (
            <>
              <p>
                Origem: {serverCopy.source === "review" ? "GameReview" : "texto legado"} — seu rascunho local
                não altera o servidor nesta fase.
              </p>
              <blockquote>
                <p>{draftPreviewText(serverCopy.content, 500)}</p>
              </blockquote>
              <p>
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={!userId}
                  onClick={() => void handleCreateDraft({ content: serverCopy.content, userGameId: userGameIdParam })}
                >
                  Editar cópia local
                </button>
              </p>
            </>
          ) : serverCopyMissing ? (
            <>
              <p>Nenhuma review persistida para este jogo. Comece um rascunho local em branco.</p>
              <p>
                <button
                  type="button"
                  className="rpgui-container framed-grey review-btn"
                  disabled={!userId}
                  onClick={() => void handleCreateDraft({ content: "", userGameId: userGameIdParam })}
                >
                  Criar rascunho local
                </button>
              </p>
            </>
          ) : (
            <p role="status">Consultando o servidor…</p>
          )}
          {existingGameDraft === null && draft === null && serverCopy && (
            <p>
              Não há rascunho local para este jogo ainda. A criação é sempre
              explícita — nada foi copiado automaticamente.
            </p>
          )}
        </section>
      )}

      {draft && (
        <section aria-label="Área de edição">
          <TiptapReviewEditor
            markdown={content}
            onMarkdownChange={handleMarkdownChange}
            mode={mode}
            onModeChange={setMode}
            disabled={saveStatus === "session-expired" && !continueOffline}
          />
          <p aria-label="Contagem de caracteres do rascunho">
            {remaining >= 0
              ? `${remaining} caracteres restantes`
              : `${-remaining} caracteres acima do limite`}
          </p>
        </section>
      )}

      {(showRecovery || (entry.kind === "game" && !draft)) && (
        <section className="rpgui-container framed-grey" aria-label="Recuperação de rascunhos">
          <h2>Meus rascunhos</h2>
          {draftList.length === 0 ? (
            <p>
              Nenhum rascunho neste dispositivo. Comece a escrever — o texto é
              salvo automaticamente no navegador.
            </p>
          ) : (
            <ul className="review-draft-list">
              {draftList.map((row) => (
                <li key={row.draftId} className="rpgui-container framed">
                  <p>
                    <strong>{row.gameName ?? "Rascunho sem jogo vinculado"}</strong>
                  </p>
                  <p>
                    <small>
                      Editado em {formatTime(row.updatedAt)} — r{row.revision}
                    </small>
                  </p>
                  <p>
                    <q>{draftPreviewText(row.content)}</q>
                  </p>
                  <p style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <a className="rpgui-container framed-grey review-btn" href={`/reviews/editor?draftId=${row.draftId}`}>
                      Continuar escrevendo
                    </a>
                    <button
                      type="button"
                      className="rpgui-container framed-grey review-btn"
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Excluir este rascunho? Esta ação não pode ser desfeita. (${draftPreviewText(row.content, 60)})`,
                        );
                        if (confirmed) void handleDeleteDraft(row.draftId);
                      }}
                    >
                      Excluir
                    </button>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="rpgui-container framed-grey review-btn"
              disabled={!userId}
              onClick={() =>
                void handleCreateDraft(
                  entry.kind === "game"
                    ? { content: serverCopy?.content ?? "", userGameId: userGameIdParam }
                    : { content: "" },
                )
              }
            >
              Novo rascunho
            </button>
          </p>
        </section>
      )}
    </div>
  );
}
