import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { buildSecurityHeaders } from "@/lib/security-headers";

afterEach(() => vi.unstubAllEnvs());

describe("HTTP security headers", () => {
  it("sets baseline protections without adding HSTS on local HTTP", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "development",
      vercelEnv: undefined,
    });

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
    expect(headers["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });

  it("uses a restrictive report-only CSP and HSTS only for Vercel Production", () => {
    const headers = buildSecurityHeaders({
      nodeEnv: "production",
      vercelEnv: "production",
    });
    const csp = headers["Content-Security-Policy-Report-Only"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("img-src 'self' https:");
    expect(csp).not.toMatch(/'unsafe-(?:inline|eval)'|\*/);
    expect(headers["Strict-Transport-Security"]).toBe("max-age=15552000");

    const preview = buildSecurityHeaders({
      nodeEnv: "production",
      vercelEnv: "preview",
    });
    expect(preview["Strict-Transport-Security"]).toBeUndefined();
    expect(preview["Content-Security-Policy-Report-Only"]).toBe(csp);
  });

  it("is wired to all Next.js routes, including API responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const rules = await nextConfig.headers?.();
    expect(rules).toHaveLength(1);
    expect(rules?.[0].source).toBe("/:path*");
    expect(rules?.[0].headers).toEqual(
      expect.arrayContaining([
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Content-Security-Policy-Report-Only",
          value: expect.stringContaining("frame-ancestors 'none'"),
        },
        { key: "Strict-Transport-Security", value: "max-age=15552000" },
      ]),
    );
  });
});
