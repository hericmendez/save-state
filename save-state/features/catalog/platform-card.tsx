
import Link from "next/link";
import type { SearchPlatform } from "@/server/search/types";

type CardImage = {
  src: string;
  alt: string;
};

type PlatformCardBaseProps = {
  name: string;
  logo?: string | null;
  image?: CardImage | null;
  meta?: React.ReactNode;
  href?: string;
};

function PlatformCardBase({
  name,
  logo,
  image,
  meta,
  href,
}: PlatformCardBaseProps) {
  const content = (
    <>
      <div className="overflow-hidden">
        <div className="flex h-24 items-center justify-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={`${name} logo`}
              className="max-h-24 max-w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div
              className="rpgui-container framed-grey flex h-16 w-16 items-center justify-center"
              aria-hidden="true"
            >
              <span className="font-display text-xl">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 aspect-video rounded-md bg-slate-100">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt={image.alt}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Image not found
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 p-4 text-left">
        <h2 className="font-bold text-white">{name}</h2>

        {meta && (
          <div className="space-y-1 text-sm">
            {meta}
          </div>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block overflow-hidden rounded-lg border rpgui-container framed-grey p-1! hover:opacity-70"
        aria-label={name}
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="overflow-hidden rounded-lg border rpgui-container framed-grey p-1!">
      {content}
    </article>
  );
}

type PlatformCardProps = {
  platform?: SearchPlatform;
  name?: string;
  manufacturer?: string;
};

export function PlatformCard({
  platform,
  name,
  manufacturer,
}: PlatformCardProps) {
  const displayName = platform?.name ?? name ?? "Plataforma";

  const logo = platform?.thumb?.logo ?? null;
  const image = platform?.thumb?.image ?? null;
  console.log("platform ==> ", platform);

  const href = platform
    ? `/catalog/platforms/${encodeURIComponent(platform.id)}`
    : undefined;

  return (
    <PlatformCardBase
      name={displayName}
      logo={logo}
      image={
        image
          ? {
              src: image,
              alt: displayName,
            }
          : null
      }
      href={href}
      meta={
        <>
          {platform ? (
            <>
              <p className="text-gray-300">
                {platform.company || manufacturer || "Empresa"}{" "}
                ({platform.releaseYear ?? "Ano desconhecido"})
              </p>

              <p className="text-gray-300">
                Tipo: {platform.type || "Tipo desconhecido"}
              </p>

              <p className="text-gray-300">
                {platform.gameCount}{" "}
                {platform.gameCount === 1 ? "jogo" : "jogos"}
              </p>
            </>
          ) : (
            <p className="text-gray-300">
              {manufacturer ?? "Empresa desconhecida"}
            </p>
          )}
        </>
      }
    />
  );
}

