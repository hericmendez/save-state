"use client";

import { useState } from "react";
import Image from "next/image";
import { FcInfo } from "react-icons/fc";
import { FaHeart } from "react-icons/fa";
import type { ReactNode } from "react";
import type { GameCardPresentation } from "./game-card-model";

export interface GameCardFrameProps {
  presentation: GameCardPresentation;
  onDetails?: () => void;
  footerActions?: ReactNode;
}

export function GameCardFrame({
  presentation,
  onDetails,
  footerActions,
}: GameCardFrameProps) {
  // Broken remote covers degrade to the local fallback (Fase 2 keeps the
  // previous `coverUrl ?? "/yugioh.png"` contract and adds runtime safety).
  const [coverFailed, setCoverFailed] = useState(false);
  const coverSrc =
    !coverFailed && presentation.coverUrl ? presentation.coverUrl : "/yugioh.png";
  return (
    <article className="rpgui-container framed-golden relative aspect-3/4 overflow-hidden">
      <div className="absolute top-0 right-0 z-999 m-1 flex gap-1">
        {presentation.isFavorite ? (
          <button type="button" className="mx-2" title="Favorito" aria-label="Favorito">
            <FaHeart color="red" className="text-3xl" />
          </button>
        ) : null}
        {presentation.isOwned ? (
          <span
            className="rpgui-container framed-grey px-2 py-1 text-xs self-center"
            title="No backlog"
          >
            ✓
          </span>
        ) : null}
        {onDetails ? (
          <button type="button" title="Detalhes" onClick={onDetails} className="shrink-0">
            <FcInfo className="text-3xl" />
          </button>
        ) : null}
      </div>

      <Image
        src={coverSrc}
        alt=""
        aria-hidden="true"
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 16vw"
        className="object-cover"
        onError={() => setCoverFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 w-full p-0!">
        <p className="font-display text-xs">{presentation.title}</p>
        {presentation.subtitle ? <p className="text-xs">{presentation.subtitle}</p> : null}
        {presentation.metaLines.map((line) => (
          <p key={line} className="text-xs">
            {line}
          </p>
        ))}
        {presentation.isOwned && !footerActions ? (
          <p className="mt-1 text-xs">✓ No backlog</p>
        ) : null}
        {footerActions ? <div className="mt-1">{footerActions}</div> : null}
      </div>
    </article>
  );
}
