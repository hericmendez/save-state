"use client";

import { useMemo, useState } from "react";
import RPGUIInput from "@/components/RPGUI/Input";
import { PlatformCard } from "@/features/catalog/platform-card";
import type { EditorialPlatform, PlatformAssetManifest } from "@/features/catalog/editorial-platforms";
import { resolvePlatformThumb } from "@/features/catalog/editorial-platforms";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function filterEditorialPlatforms(
  platforms: EditorialPlatform[],
  term: string,
): EditorialPlatform[] {
  const query = normalize(term.trim());
  return query
    ? platforms.filter((platform) => normalize(platform.name).includes(query))
    : platforms;
}

export function PlatformsSearch({
  platforms,
  initialItems,
  manifest,
}: {
  platforms: EditorialPlatform[];
  initialItems: EditorialPlatform[];
  manifest: PlatformAssetManifest | null;
}) {
  const [term, setTerm] = useState("");
  const filtered = useMemo(
    () => (term.trim() ? filterEditorialPlatforms(platforms, term) : initialItems),
    [platforms, initialItems, term],
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="platform-search">Pesquisar plataformas</label>
        <RPGUIInput
          id="platform-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Pesquisar plataforma pelo nome…"
        />
        {term ? (
          <button type="button" className="rpgui-button px-3 py-1" onClick={() => setTerm("")}>
            Limpar
          </button>
        ) : null}
      </div>
      {filtered.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filtered.map((platform) => (
            <PlatformCard
              key={platform.id}
              editorial={{ ...platform, thumb: resolvePlatformThumb(platform, manifest) }}
            />
          ))}
        </div>
      ) : (
        <p role="status">Nenhuma plataforma corresponde à pesquisa.</p>
      )}
    </section>
  );
}
