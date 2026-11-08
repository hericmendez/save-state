import type { NextConfig } from "next";

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
