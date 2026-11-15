import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import {
  listEditorialPlatforms,
  type PlatformAssetManifest,
} from "@/features/catalog/editorial-platforms";

/**
 * Atribuições das imagens editoriais das plataformas.
 *
 * Lista, por plataforma, a origem, a licença e a autoria de cada cópia
 * local em `public/platforms/` (ver `scripts/import-platform-images.mjs`
 * e `public/platforms/manifest.json`). Logos de marcas são exibidos de
 * forma nominativa apenas para identificação da plataforma, sem sugerir
 * endosso.
 */
export default async function PlatformAttributionsPage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog/platforms/atribuicoes");
  }

  let manifest: PlatformAssetManifest | null = null;
  try {
    const raw = readFileSync(
      join(process.cwd(), "public", "platforms", "manifest.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as Partial<PlatformAssetManifest>;
    if (parsed && typeof parsed === "object" && parsed.files) {
      manifest = parsed as PlatformAssetManifest;
    }
  } catch {
    manifest = null;
  }

  const platforms = listEditorialPlatforms();

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Atribuições das imagens</h1>
        <p className="mt-2 text-sm">
          Origem, licença e autoria das imagens das plataformas.{" "}
          <Link href="/catalog/platforms" className="underline">
            Voltar às plataformas
          </Link>
        </p>
      </header>

      {platforms.map((platform) => {
        const logo = manifest?.files[`${platform.id}/logo`];
        const image = manifest?.files[`${platform.id}/image`];
        return (
          <section
            key={platform.id}
            aria-label={`Atribuições de ${platform.name}`}
            className="rpgui-container framed-grey p-4"
          >
            <h2 className="font-display text-lg">{platform.name}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(
                [
                  ["Logo", logo],
                  ["Fotografia", image],
                ] as const
              ).map(([label, entry]) => (
                <li key={label}>
                  {label}:{" "}
                  {entry ? (
                    <>
                      {entry.license}
                      {entry.author ? ` — ${entry.author}` : ""}
                      {entry.page ? (
                        <>
                          {" · "}
                          <a
                            href={entry.page}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            arquivo original
                          </a>
                        </>
                      ) : null}
                      {entry.licenseUrl ? (
                        <>
                          {" · "}
                          <a
                            href={entry.licenseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            texto da licença
                          </a>
                        </>
                      ) : null}
                    </>
                  ) : (
                    "imagem remota (ver JSON editorial)"
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
