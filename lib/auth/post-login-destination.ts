const FALLBACK_DESTINATION = "/home";
const INTERNAL_ORIGIN = "https://save-state.invalid";
const AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/check-email",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);

function isSafePath(path: string): boolean {
  let decoded = path;

  // Decode repeatedly so double-encoded traversal/separators cannot reach a
  // different interpretation in a downstream router or proxy.
  for (let iteration = 0; iteration < 5; iteration += 1) {
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      /[\u0000-\u0020\u007f]/u.test(decoded) ||
      /%2f|%5c/i.test(decoded)
    ) {
      return false;
    }

    if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
      return false;
    }

    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return false;
    }

    if (next === decoded) return true;
    decoded = next;
  }

  return false;
}

function fullyDecodedPath(path: string): string | null {
  let decoded = path;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  return null;
}

/** Return a safe same-origin post-login destination, or `/home`. */
export function getSafePostLoginDestination(from: string | null): string {
  if (
    !from ||
    from.length > 2048 ||
    from !== from.trim() ||
    /[\u0000-\u0020\u007f\\]/u.test(from) ||
    !from.startsWith("/") ||
    from.startsWith("//")
  ) {
    return FALLBACK_DESTINATION;
  }

  let decodedValue: string;
  try {
    decodedValue = decodeURIComponent(from);
  } catch {
    return FALLBACK_DESTINATION;
  }
  if (/[\u0000-\u001f\u007f]/u.test(decodedValue) || decodedValue.includes("\\")) {
    return FALLBACK_DESTINATION;
  }

  const pathEnd = from.search(/[?#]/u);
  const rawPath = pathEnd === -1 ? from : from.slice(0, pathEnd);
  if (!isSafePath(rawPath)) return FALLBACK_DESTINATION;

  let destination: URL;
  try {
    destination = new URL(from, INTERNAL_ORIGIN);
  } catch {
    return FALLBACK_DESTINATION;
  }

  if (destination.origin !== INTERNAL_ORIGIN) return FALLBACK_DESTINATION;

  const decodedPath = fullyDecodedPath(rawPath);
  if (!decodedPath) return FALLBACK_DESTINATION;
  const normalizedPath = decodedPath.replace(/\/+$/u, "").toLowerCase() || "/";
  if (
    AUTH_PATHS.has(normalizedPath) ||
    normalizedPath.startsWith("/api/") ||
    normalizedPath === "/api"
  ) {
    return FALLBACK_DESTINATION;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
