/**
 * Review Editor — server read client (Phase 2).
 *
 * Read-only bridge to the Phase 1 backend. Phase 2 NEVER writes to MongoDB:
 * the only endpoints used here are `GET /api/auth/me` (reliable identity
 * for IndexedDB isolation — never a `userId` from the URL) and
 * `GET /api/games/:id` + `GET /api/games/:id/review` (server copy shown
 * next to the local draft, explicit user choice to start a local copy).
 */
export interface SessionIdentity {
  id: string;
  name: string;
  email: string;
}

export interface ServerGameSummary {
  id: string;
  name: string;
}

export interface ServerReviewCopy {
  content: string;
  excerpt: string;
  source: "review";
  updatedAt: string | null;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Sessão expirada — faça login novamente");
    this.name = "SessionExpiredError";
  }
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string };
    };
    return body?.error?.code ?? null;
  } catch {
    return null;
  }
}

/** Reliable identity for draft isolation. Throws SessionExpiredError on 401. */
export async function fetchSessionIdentity(): Promise<SessionIdentity> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) throw new SessionExpiredError();
  if (!response.ok) throw new Error(`Falha ao verificar sessão (${response.status})`);
  const body = (await response.json()) as {
    data: SessionIdentity;
  };
  if (!body?.data?.id) throw new Error("Resposta de sessão inválida");
  return body.data;
}

function toGameSummary(id: string, data: unknown): ServerGameSummary | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const name =
    typeof record.name === "string"
      ? record.name
      : typeof record.title === "string"
        ? record.title
        : "";
  if (!name) return null;
  return { id, name };
}

/**
 * Game name for the editor header (display only).
 * Returns null when the game does not exist / is not owned (404) or the
 * session expired (caller switches to the session-expired state).
 */
export async function fetchGameSummary(
  userGameId: string,
): Promise<ServerGameSummary | null> {
  const response = await fetch(
    `/api/games/${encodeURIComponent(userGameId)}`,
    { credentials: "same-origin", headers: { Accept: "application/json" } },
  );
  if (response.status === 401) throw new SessionExpiredError();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Falha ao carregar jogo (${response.status})`);
  const body = (await response.json()) as { data: unknown };
  return toGameSummary(userGameId, body?.data);
}

export type ServerReviewResult =
  | { status: "found"; review: ServerReviewCopy }
  | { status: "missing" };

/**
 * On-demand full review content. Maps the real backend contract:
 * - 200 → `{ content, excerpt, source, createdAt, updatedAt }`
 * - 404 `REVIEW_NOT_FOUND` → `{ status: "missing" }` (no persisted review)
 * - 401 → SessionExpiredError; other failures throw.
 */
export async function fetchServerReview(
  userGameId: string,
): Promise<ServerReviewResult> {
  const response = await fetch(
    `/api/games/${encodeURIComponent(userGameId)}/review`,
    { credentials: "same-origin", headers: { Accept: "application/json" } },
  );
  if (response.status === 401) throw new SessionExpiredError();
  if (response.status === 404) {
    const code = await readErrorCode(response).catch(() => null);
    void code;
    return { status: "missing" };
  }
  if (!response.ok) throw new Error(`Falha ao carregar review (${response.status})`);
  const body = (await response.json()) as { data: ServerReviewCopy };
  if (!body?.data || typeof body.data.content !== "string") {
    throw new Error("Resposta de review inválida");
  }
  return { status: "found", review: body.data };
}
