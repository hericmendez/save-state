"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { SearchPlatform } from "@/server/search/types";
import {
  editorialPlatformHref,
  type EditorialPlatform,
} from "./editorial-platforms";

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

function isSvgSrc(src: string): boolean {
  // Next's optimizer rejects SVG upstream unless dangerouslyAllowSVG is set
  // (400 by design). Editorial logos are mostly Wikimedia SVGs, which need
  // no optimization anyway — vectors scale natively. Serve them direct.
  return src.split("?")[0].split("#")[0].toLowerCase().endsWith(".svg");
}

function CardLogo({ name, logo }: { name: string; logo: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!logo || failed) {
    return (
      <div
        className="rpgui-container framed-grey flex h-16 w-16 items-center justify-center"
        aria-hidden="true"
      >
        <span className="font-display text-xl">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <span className="relative block h-24 w-full">
      <Image
        src={logo}
        alt={`${name} logo`}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 16vw"
        className="object-contain"
        loading="lazy"
        unoptimized={isSvgSrc(logo)}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function CardImage({ image }: { image: CardImage | null }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Image not found
      </div>
    );
  }
  return (
    <Image
      src={image.src}
      alt={image.alt}
      fill
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 16vw"
      className="object-contain"
      loading="lazy"
      unoptimized={isSvgSrc(image.src)}
      onError={() => setFailed(true)}
    />
  );
}

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
          <CardLogo name={name} logo={logo ?? null} />
        </div>

        <div className="relative mt-2 aspect-video rounded-md bg-slate-100">
          <CardImage image={image ?? null} />
        </div>
      </div>

      <div className="space-y-2 p-4 text-left">
        <h2 className="font-bold text-white">{name}</h2>

        {meta && <div className="space-y-1 text-sm">{meta}</div>}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rpgui-container framed-grey block overflow-hidden rounded-lg border p-1! hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={name}
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="rpgui-container framed-grey overflow-hidden rounded-lg border p-1!">
      {content}
    </article>
  );
}

type PlatformCardProps = {
  platform?: SearchPlatform;
  editorial?: EditorialPlatform;
  name?: string;
  manufacturer?: string;
};

function formatReleaseYear(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Ano desconhecido";
  }
  return String(value);
}

export function PlatformCard({
  platform,
  editorial,
  name,
  manufacturer,
}: PlatformCardProps) {
  if (editorial) {
    const href = editorialPlatformHref(editorial);
    return (
      <PlatformCardBase
        name={editorial.name}
        logo={editorial.thumb.logo}
        image={
          editorial.thumb.image
            ? { src: editorial.thumb.image, alt: editorial.name }
            : null
        }
        href={href}
        meta={
          <>
            <p className="text-gray-300">
              {editorial.company || "Empresa desconhecida"} (
              {formatReleaseYear(editorial.releaseYear)})
            </p>
            <p className="text-gray-300">
              Tipo: {editorial.type || "Tipo desconhecido"}
            </p>
          </>
        }
      />
    );
  }

  const displayName = platform?.name ?? name ?? "Plataforma";

  const logo = platform?.thumb?.logo ?? null;
  const image = platform?.thumb?.image ?? null;

  const href = platform
    ? `/catalog/platforms/${encodeURIComponent(platform.id)}`
    : undefined;

  return (
    <PlatformCardBase
      name={displayName}
      logo={logo}
      image={image ? { src: image, alt: displayName } : null}
      href={href}
      meta={
        <>
          {platform ? (
            <>
              <p className="text-gray-300">
                {platform.company || manufacturer || "Empresa"} (
                {formatReleaseYear(platform.releaseYear)})
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
