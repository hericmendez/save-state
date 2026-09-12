/**
 * Same-origin browser API helper for Client Component mutations.
 * Server Components must call services directly instead of using this.
 */

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (json as { error?: { message?: string } } | null)?.error?.message ??
      `HTTP ${res.status}`;
    throw new ApiRequestError(res.status, message);
  }
  if (json !== null && typeof json === "object" && "pagination" in json) {
    return json as T;
  }
  return ((json as { data?: T } | null)?.data ?? json) as T;
}

export async function apiRequest<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers:
      init?.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return parseResponse<T>(res);
}

export const api = {
  register: (name: string, email: string, password: string) =>
    apiRequest<{ id: string; name: string; email: string }>(
      "/api/auth/register",
      { method: "POST", body: { name, email, password } },
    ),
  login: (email: string, password: string) =>
    apiRequest<{ id: string; name: string; email: string }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  logout: () => apiRequest<{ message: string }>("/api/logout", { method: "POST" }),
};
