import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
