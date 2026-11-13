import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  images: {
    // Fase 2 — remote optimization allowlist (minimal, explicit).
    // images.igdb.com: game covers/logos served by the search provider.
    // upload.wikimedia.org: editorial platform thumbs (curated JSON).
    // No other remote host is optimized; unknown hosts keep plain <img>.
    remotePatterns: [
      { protocol: "https", hostname: "images.igdb.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
    ],
  },
  async headers() {
    const securityHeaders = buildSecurityHeaders({
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return [
      {
        source: "/:path*",
        headers: Object.entries(securityHeaders).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ];
  },
  // Fase 7.1 URL normalization (Portuguese → English canonical routes).
  // Single implementation per page; these are compat-only redirects.
  async redirects() {
    return [
      {
        source: "/catalog/plataformas/:path*",
        destination: "/catalog/platforms/:path*",
        permanent: false,
      },
      {
        source: "/catalog/familias/:path*",
        destination: "/catalog/families/:path*",
        permanent: false,
      },
      {
        source: "/backlog/sem-lista/:path*",
        destination: "/backlog/without-list/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
