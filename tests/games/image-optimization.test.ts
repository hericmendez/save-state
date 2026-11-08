/**
 * Fase 2 — otimização de imagens e streaming (contratos-fonte + unidades puras).
 *
 * `.tsx` não admite import de valor no vitest deste repo (`jsx: preserve`),
 * então comportamento de render recebe asserções de padrão (convenção do
 * repo) e a lógica pura, testes unitários reais.
 */

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { sizedIgdbImageUrl } from "@/features/games/game-card-model";

function hasPatterns(path: string, patterns: string[]): boolean {
  const content = readFileSync(path, "utf8");
  return patterns.every((pattern) => content.includes(pattern));
}

describe("sizedIgdbImageUrl", () => {
  it("rewrites known IGDB variants", () => {
    expect(
      sizedIgdbImageUrl(
        "https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg",
        "t_cover_small",
      ),
    ).toBe("https://images.igdb.com/igdb/image/upload/t_cover_small/abc.jpg");
  });

  it("passes through other sources and null untouched", () => {
    expect(sizedIgdbImageUrl(null, "t_cover_small")).toBeNull();
    expect(
      sizedIgdbImageUrl("https://example.com/cover.jpg", "t_cover_small"),
    ).toBe("https://example.com/cover.jpg");
    expect(sizedIgdbImageUrl("/yugioh.png", "t_cover_small")).toBe(
      "/yugioh.png",
    );
  });

  it("normalizes any IGDB size segment to the requested variant", () => {
    expect(
      sizedIgdbImageUrl(
        "https://images.igdb.com/igdb/image/upload/t_original/abc.jpg",
        "t_cover_small",
      ),
    ).toBe("https://images.igdb.com/igdb/image/upload/t_cover_small/abc.jpg");
  });
});

describe("next/image allowlist (Fase 2)", () => {
  it("restricts remote optimization to the needed hosts", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("remotePatterns");
    expect(config).toContain("images.igdb.com");
    expect(config).toContain("upload.wikimedia.org");
  });
});

describe("grid cover rendering (Fase 2)", () => {
  const p = "features/games/game-card-frame.tsx";

  it("sizes the cover with fill + responsive sizes", () => {
    expect(
      hasPatterns(p, [
        'from "next/image"',
        "fill",
        "sizes=",
        "object-cover",
        "onError",
      ]),
    ).toBe(true);
  });

  it("keeps the local fallback and hidden decorative alt", () => {
    expect(hasPatterns(p, ["/yugioh.png", 'alt=""', 'aria-hidden="true"'])).toBe(
      true,
    );
  });

  it("applies no blanket priority", () => {
    expect(hasPatterns(p, ["priority"])).toBe(false);
  });
});

describe("table thumb rendering (Fase 2)", () => {
  for (const p of [
    "features/atp/catalog-table-row.tsx",
    "features/games/backlog-table-row.tsx",
  ]) {
    it(`${p} uses fixed-size next/image with the small IGDB variant`, () => {
      expect(
        hasPatterns(p, [
          'from "next/image"',
          "width={32}",
          "height={40}",
          'loading="lazy"',
          'sizedIgdbImageUrl(',
          '"t_cover_small"',
          "/yugioh.png",
        ]),
      ).toBe(true);
    });

    it(`${p} keeps raw <img> out and priority off`, () => {
      const content = readFileSync(p, "utf8");
      expect(content).not.toContain("<img");
      expect(content).not.toContain("priority");
    });
  }
});

describe("platform card rendering (Fase 2)", () => {
  const p = "features/catalog/platform-card.tsx";

  it("renders logo and photo with next/image fill + sizes", () => {
    expect(
      hasPatterns(p, [
        'from "next/image"',
        "fill",
        "sizes=",
        "object-contain",
        "relative mt-2 aspect-video",
      ]),
    ).toBe(true);
  });

  it("preserves error fallbacks, alt text and no layout shift", () => {
    // Containers reserve space (h-24 / aspect-video); failures render
    // the same placeholders as before instead of broken images.
    expect(
      hasPatterns(p, [
        "setFailed(true)",
        "Image not found",
        "charAt(0).toUpperCase()",
        "loading=",
      ]),
    ).toBe(true);
    expect(readFileSync(p, "utf8")).not.toContain("<img");
  });

  it("bypasses the optimizer for SVG logos (regression fix)", () => {
    // Next's image optimizer rejects SVG upstream with 400 unless
    // dangerouslyAllowSVG is set (54/64 editorial logos are Wikimedia SVGs).
    // Vectors need no optimization; unoptimized keeps <Image> sizing/fill.
    expect(
      hasPatterns(p, [
        "isSvgSrc",
        'endsWith(".svg")',
        "unoptimized={isSvgSrc(",
      ]),
    ).toBe(true);
  });
});
