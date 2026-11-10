"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type { Game } from "@/features/shared/types";
import {
  EMPTY_GAME_FORM,
  GameForm,
  formToPayload,
  type GameFormState,
} from "@/features/games/game-form";
import { toPlainGame } from "@/features/games/mappers";
import { notifyCollectionsChanged } from "@/features/collections/collections-signal";

import {
  atpDetailToFormPatch,
  type AtpDetailForForm,
} from "@/features/games/metadata-search";
import { igdbDetailEndpoint } from "@/features/search/search-endpoints";
import {
  SessionExpiredError,
  fetchServerReview,
  fetchSessionIdentity,
} from "@/features/reviews/review-api-client";
import {
  findDraftByGame,
  getDraft,
  deleteDraft,
} from "@/features/reviews/draft-store";
import {
  cleanupDraftAfterSuccess,
  finalizeDraftForSubmit,
} from "@/features/reviews/review-finalize";
import type {
  OpenEditorRequest,
  ReviewFormValue,
} from "@/features/reviews/review-form-section";

function gameToForm(game: Game): GameFormState {
  const meta = game.game;
  return {
    name: meta?.name ?? "",
    cover: meta?.cover ?? "",
    genres: (meta?.genres ?? []).join(", "),
    platforms: (meta?.platforms ?? []).join(", "),
    developers: (meta?.developers ?? []).join(", "),
    publishers: (meta?.publishers ?? []).join(", "),
    releaseDate: (meta?.releaseDate ?? "").slice(0, 10),
    summary: meta?.summary ?? "",
    status: game.status ?? "backlog",
    hoursPlayed: String(game.hoursPlayed ?? 0),
    timesFinished: String(game.timesFinished ?? 0),
    rating:
      game.rating === undefined || game.rating === null
        ? ""
        : String(game.rating),
    favorite: game.favorite ?? false,
    fullyCompleted: game.fullyCompleted ?? false,
    achievements: game.achievements ?? false,
    achievementProgress:
      game.achievementProgress === undefined || game.achievementProgress === null
        ? ""
        : String(game.achievementProgress),
  };
}

export function GameFormContainer({
  editingId,
  initialGame,
  attachCollectionId,
  initialExternalId,
}: {
  editingId?: string;
  initialGame?: Game;
  attachCollectionId?: string;
  // "Edit and add" mode (Busca Geral → /backlog/new?externalId=…): loads
  // full IGDB metadata, locks it read-only, and submits through the IGDB
  // import (snapshot + all personal fields) instead of manual creation.
  // Absent = unchanged manual flow. Ignored when editing.
  initialExternalId?: string;
}) {
  const router = useRouter();
  // Blank (?externalId=) or whitespace-only values fall back to manual.
  const normalizedExternalId =
    initialExternalId !== undefined && initialExternalId.trim() !== ""
      ? initialExternalId.trim()
      : undefined;
  const externalMode = !editingId && normalizedExternalId !== undefined;

  // ---- Phase 3: mobile same-tab field preservation -----------------------
  // Keyed per form context so snapshots never leak across games. Written
  // explicitly when opening the editor in the same tab; consumed (deleted)
  // on the next mount. TTL guards against stale restores.
  const snapshotKey = editingId
    ? `save-state:game-form:edit:${editingId}`
    : externalMode
      ? `save-state:game-form:ext:${normalizedExternalId}`
      : "save-state:game-form:new";
  const NEW_DRAFT_KEY = "save-state:new-game-draft-id";
  const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

  function readFormSnapshot(): GameFormState | null {
    try {
      const raw = sessionStorage.getItem(snapshotKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        form?: GameFormState;
        savedAt?: number;
      };
      if (!parsed.form || typeof parsed.savedAt !== "number") return null;
      if (Date.now() - parsed.savedAt > SNAPSHOT_TTL_MS) {
        sessionStorage.removeItem(snapshotKey);
        return null;
      }
      sessionStorage.removeItem(snapshotKey);
      return { ...EMPTY_GAME_FORM, ...parsed.form };
    } catch {
      return null;
    }
  }

  function writeFormSnapshot(form: GameFormState) {
    try {
      sessionStorage.setItem(
        snapshotKey,
        JSON.stringify({ form, savedAt: Date.now() }),
      );
    } catch {
      // Quota/private mode: the editor still opens; fields may be lost on
      // same-tab return and the user is warned by the section copy.
    }
  }

  const [form, setForm] = useState<GameFormState>(() =>
    // A same-tab editor round-trip writes an explicit snapshot with the
    // user's latest fields; it wins over server data (which is older).
    // Otherwise the snapshot is absent and behavior is unchanged.
    (readFormSnapshot() ?? (initialGame ? gameToForm(initialGame) : EMPTY_GAME_FORM)),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalLoading, setExternalLoading] = useState(externalMode);
  const [externalFailed, setExternalFailed] = useState(false);
  const [externalId, setExternalId] = useState<string | null>(null);
  // UserGame id of a completed import in this mount. Lets a failed
  // collection attach retry without re-running the import.
  const [createdUserGameId, setCreatedUserGameId] = useState<string | null>(
    null,
  );

  // ---- Phase 3: review section state ------------------------------------
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionFailed, setSessionFailed] = useState(false);
  const [reviewValue, setReviewValue] = useState<ReviewFormValue>({
    kind: "absent",
  });
  const [reviewWarning, setReviewWarning] = useState<string | null>(null);

  const serverExcerpt =
    initialGame && typeof initialGame.reviewExcerpt === "string"
      ? initialGame.reviewExcerpt
      : null;
  const serverHasReview = (serverExcerpt ?? "").length > 0;

  // Session identity for draft isolation (the (app) layout already guards
  // the route; this is for IndexedDB scoping, never from the URL).
  useEffect(() => {
    let cancelled = false;
    fetchSessionIdentity()
      .then((session) => {
        if (!cancelled) setSessionUserId(session.id);
      })
      .catch((error) => {
        if (!cancelled && error instanceof SessionExpiredError) {
          setSessionFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Draft binding. Create mode: recover the sessionStorage link (written
  // when the draft was created; never auto-create, never overwrite).
  // Edit mode: deterministic lookup by userGameId (also on tab refocus,
  // covering new-tab editor round-trips without a remount).
  useEffect(() => {
    if (!sessionUserId) return;
    let cancelled = false;
    if (!editingId) {
      let draftId: string | null = null;
      try {
        draftId = sessionStorage.getItem(NEW_DRAFT_KEY);
      } catch {
        draftId = null;
      }
      if (!draftId) return;
      void getDraft(draftId, sessionUserId)
        .then((row) => {
          if (!cancelled && row) {
            setReviewValue((current) =>
              current.kind === "absent"
                ? { kind: "draft", draftId: row.draftId }
                : current,
            );
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    const bind = () => {
      void findDraftByGame(sessionUserId, editingId)
        .then((row) => {
          if (cancelled || !row) return;
          setReviewValue((current) =>
            current.kind === "absent"
              ? { kind: "draft", draftId: row.draftId }
              : current,
          );
        })
        .catch(() => {});
    };
    bind();
    const onVisibility = () => {
      if (document.visibilityState === "visible") bind();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sessionUserId, editingId]);

  function handleReviewChange(next: ReviewFormValue) {
    // Create mode recovers the link across reloads via sessionStorage; the
    // draft itself is never auto-created nor overwritten here.
    try {
      if (next.kind === "draft" && !editingId) {
        sessionStorage.setItem(NEW_DRAFT_KEY, next.draftId);
      } else if (next.kind === "absent" && !editingId) {
        // Dropping the link forgets the binding; the draft itself stays
        // recoverable via the editor's recovery UI.
        sessionStorage.removeItem(NEW_DRAFT_KEY);
      }
    } catch {
      // Non-fatal: binding recovery is best-effort.
    }
    setReviewWarning(null);
    setReviewValue(next);
  }

  function handleOpenReviewEditor(request: OpenEditorRequest) {
    const params = new URLSearchParams();
    if (request.draftId) params.set("draftId", request.draftId);
    else if (request.userGameId) params.set("userGameId", request.userGameId);
    else return;
    const url = `/reviews/editor?${params.toString()}`;
    const coarse =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) {
      // Desktop: the form stays mounted; open in a new tab.
      window.open(url, "_blank", "noopener");
      return;
    }
    // Mobile same-tab: persist all unsaved fields before leaving, so the
    // back-button return restores them (the route unmounts this form).
    writeFormSnapshot(form);
    router.push(url);
  }

  // Load-once IGDB detail for external mode. Personal fields keep their
  // current values (a restored same-tab snapshot or user edits typed
  // while loading); metadata arrives locked and is never user-editable.
  useEffect(() => {
    if (!externalMode || initialGame) return;
    let cancelled = false;
    setExternalLoading(true);
    setExternalFailed(false);
    setError(null);
    apiRequest<AtpDetailForForm & { id: string }>(
      igdbDetailEndpoint(normalizedExternalId as string),
    )
      .then((detail) => {
        if (cancelled) return;
        setForm((current) => ({
          ...current,
          ...atpDetailToFormPatch({ ...detail, atpId: detail.id }),
        }));
        setExternalId(detail.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setExternalFailed(true);
        setError(
          err instanceof ApiRequestError ? err.message : "Falha ao carregar",
        );
      })
      .finally(() => {
        if (!cancelled) setExternalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [externalMode, normalizedExternalId, initialGame]);

  function patch(patch: Partial<GameFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  interface ResolvedReview {
    /** Review fragment to merge into the single submit request. */
    payload: Record<string, unknown>;
    /** Linked draft to finalize after backend success (if any). */
    draftId?: string;
    revision?: number;
  }

  /**
   * Resolve the review fragment for the single submit request.
   *
   * - absent → `{}` (the server keeps the persisted review untouched).
   * - clear → `{ review: null }` (explicit removal, edit only).
   * - draft → stable read via `finalizeDraftForSubmit`; empty drafts fall
   *   back to absent, unstable/over-long/missing drafts abort the submit
   *   with a user-facing message. Nothing is deleted here.
   */
  async function resolveReviewPayload(): Promise<ResolvedReview> {
    if (reviewValue.kind === "clear") return { payload: { review: null } };
    if (reviewValue.kind === "absent") return { payload: {} };
    if (!sessionUserId) {
      throw new Error(
        "Sessão inválida para ler o rascunho. Faça login novamente.",
      );
    }
    const draftId = reviewValue.draftId;
    const outcome = await finalizeDraftForSubmit({
      draftId,
      userId: sessionUserId,
      read: getDraft,
    });
    if (outcome.kind === "absent") return { payload: {} };
    if (outcome.kind === "missing") {
      throw new Error(
        "O rascunho vinculado não foi encontrado neste dispositivo. " +
          "Nada foi enviado — recupere-o no editor ou desvincule a review.",
      );
    }
    if (outcome.kind === "unstable") {
      throw new Error(
        "O rascunho ainda está sendo editado em outra guia. " +
          "Pause a edição e tente salvar novamente.",
      );
    }
    if (outcome.kind === "too-long") {
      throw new Error(
        `A review tem ${outcome.length} caracteres e excede o limite. ` +
          "Reduza o texto no editor antes de salvar.",
      );
    }
    // Edit with a persisted review: refuse to silently supersede a NEWER
    // server copy with this local draft (explicit reconciliation instead).
    if (editingId && serverHasReview) {
      const server = await fetchServerReview(editingId).catch(() => null);
      if (server && server.status === "found" && server.review.updatedAt) {
        const serverTime = Date.parse(server.review.updatedAt);
        const draftRow = await getDraft(draftId, sessionUserId).catch(
          () => null,
        );
        if (
          draftRow &&
          Number.isFinite(serverTime) &&
          serverTime > draftRow.updatedAt
        ) {
          throw new Error(
            "A review no servidor é mais recente que este rascunho. " +
              "Abra o editor para reconciliar antes de salvar.",
          );
        }
      }
    }
    return {
      payload: { review: { content: outcome.markdown } },
      draftId: outcome.draftId,
      revision: outcome.revision,
    };
  }

  /**
   * Post-commit draft cleanup. Deletes ONLY when the persisted revision
   * still matches the submitted one; a newer revision (another tab wrote
   * during submit) is preserved for reconciliation. Never throws into the
   * success path and never runs in `finally`.
   */
  async function finalizeDraftAfterCommit(
    resolved: ResolvedReview,
  ): Promise<void> {
    if (!resolved.draftId || resolved.revision === undefined) return;
    if (!sessionUserId) return;
    const outcome = await cleanupDraftAfterSuccess({
      draftId: resolved.draftId,
      userId: sessionUserId,
      submittedRevision: resolved.revision,
      read: getDraft,
      remove: async (id, user) => deleteDraft(id, user),
    });
    if (outcome.kind === "kept-changed") {
      // Server already committed; the newer local draft stays recoverable
      // in the editor instead of being wiped by a stale finalizer.
      setReviewWarning(
        "Jogo salvo. Um rascunho mais recente foi preservado no editor " +
          "para reconciliação.",
      );
    }
  }

  function clearReviewBinding() {
    if (!editingId) {
      try {
        sessionStorage.removeItem(NEW_DRAFT_KEY);
      } catch {
        // Non-fatal.
      }
    }
  }

  async function handleSubmit() {
    setError(null);
    setReviewWarning(null);
    setIsSubmitting(true);
    try {
      // The section owns review state: formToPayload carries no review key,
      // so editing other fields cannot touch the persisted review.
      const resolved = await resolveReviewPayload();
      if (editingId) {
        const payload = { ...formToPayload(form), ...resolved.payload };
        // ATP snapshots are metadata-immutable (GAME_METADATA_IMMUTABLE):
        // send personal fields only so edits to imported games succeed.
        if (
          initialGame?.game?.source !== undefined &&
          initialGame.game.source !== "manual"
        ) {
          delete payload.game;
        }
        await apiRequest(`/api/games/${editingId}`, {
          method: "PUT",
          body: payload,
        });
        await finalizeDraftAfterCommit(resolved);
        clearReviewBinding();
        router.push("/backlog");
      } else if (externalMode) {
        // IGDB import: the server owns the snapshot (source "igdb",
        // immutable metadata); the client only supplies identity + the
        // nine personal fields. Metadata inputs are locked, never trusted.
        // Import and collection attach are separate steps: a stored
        // UserGame id lets a failed attach retry without re-importing.
        if (!externalId) {
          setError(
            externalFailed
              ? "Não foi possível carregar os dados do catálogo. Volte à Busca Geral e tente novamente."
              : "Metadados ainda carregando. Aguarde e tente de novo.",
          );
          return;
        }
        let userGameId = createdUserGameId;
        if (!userGameId) {
          const { game: _omitted, ...personal } = formToPayload(form);
          const personalWithReview = { ...personal, ...resolved.payload };
          try {
            const created = await apiRequest<Game>("/api/search/import", {
              method: "POST",
              body: {
                externalId,
                personal: personalWithReview,
                conflictPolicy: "reject-existing",
              },
            });
            userGameId = toPlainGame(created)._id;
            setCreatedUserGameId(userGameId);
          } catch (err) {
            // Personal edits stay in the form; nothing was persisted.
            setError(
              err instanceof ApiRequestError ? err.message : "Falha ao salvar",
            );
            return;
          }
        }
        if (attachCollectionId) {
          try {
            await apiRequest(
              `/api/games/${userGameId}/collections/${attachCollectionId}`,
              { method: "POST" },
            );
            notifyCollectionsChanged();
          } catch {
            setError(
              "Jogo adicionado ao Backlog, mas a associação à coleção falhou. Tente novamente para concluir a associação.",
            );
            return;
          }
        }
        await finalizeDraftAfterCommit(resolved);
        clearReviewBinding();
        router.push("/backlog");
      } else {
        const created = await apiRequest<Game>("/api/games", {
          method: "POST",
          body: { ...formToPayload(form), ...resolved.payload },
        });
        const plain = toPlainGame(created);
        await finalizeDraftAfterCommit(resolved);
        clearReviewBinding();
        if (attachCollectionId) {
          await apiRequest(
            `/api/games/${plain._id}/collections/${attachCollectionId}`,
            { method: "POST" },
          );
          notifyCollectionsChanged();
        }
        router.push("/backlog");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao salvar");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">
          {editingId ? "Editar jogo" : "Novo jogo"}
        </h1>
      </header>
      {sessionFailed && (
        <p role="alert">
          Sessão expirada. Faça login novamente para vincular rascunhos de
          review.
        </p>
      )}
      {reviewWarning && (
        <p role="status">{reviewWarning}</p>
      )}
      {externalLoading ? (
        <div className="rpgui-container framed-grey p-4 text-center">
          <p className="font-display text-sm" aria-live="polite">
            [ Carregando dados do catálogo... ]
          </p>
        </div>
      ) : null}
      <GameForm
        form={form}
        isEditing={Boolean(editingId)}
        isSubmitting={isSubmitting}
        error={error}
        onChange={patch}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        metadataLocked={
          (Boolean(editingId) &&
            initialGame?.game?.source !== undefined &&
            initialGame.game.source !== "manual") ||
          externalMode
        }
        review={{
          mode: editingId ? "edit" : "create",
          userId: sessionUserId,
          userGameId: editingId,
          serverExcerpt,
          serverHasReview,
          value: reviewValue,
          draftTitle: form.name,
        }}
        onReviewChange={handleReviewChange}
        onOpenReviewEditor={handleOpenReviewEditor}
      />
    </div>
  );
}
