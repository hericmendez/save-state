export interface SecurityHeaderEnvironment {
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
}

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // The review editor accepts remote HTTPS image URLs by design. Narrowing
  // this requires a product change (allowlist or image proxy), not CSP guesswork.
  "img-src 'self' https:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
].join("; ");

/** Central policy shared by Next.js headers config and focused tests. */
export function buildSecurityHeaders({
  nodeEnv,
  vercelEnv,
}: SecurityHeaderEnvironment): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "X-Frame-Options": "DENY",
  };

  // Preview gets the report-only policy for browser validation. Dev is left
  // alone because Next's HMR uses a WebSocket and local iteration is not CSP QA.
  if (nodeEnv === "production") {
    headers["Content-Security-Policy-Report-Only"] = CSP_REPORT_ONLY;
  }

  // Only the canonical Vercel Production environment is known to be HTTPS.
  // Deliberately omit includeSubDomains and preload until separately approved.
  if (vercelEnv === "production") {
    headers["Strict-Transport-Security"] = "max-age=15552000";
  }

  return headers;
}
