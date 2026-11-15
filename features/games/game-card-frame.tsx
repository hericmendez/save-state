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
    <article
      className="game-card-frame rpgui-container framed-golden relative aspect-3/4 overflow-hidden"
      aria-label={presentation.title}
    >
      <div className="game-card-actions absolute top-0 right-0 z-999 m-1 flex gap-0.5">
        {presentation.isFavorite ? (
          <button
            type="button"
            className="game-card-action"
            title="Favorito"
            aria-label="Favorito"
          >
            <FaHeart color="red" className="text-xl" />
          </button>
        ) : null}
        {presentation.isOwned ? (
          <span
            className="rpgui-container framed-grey self-center px-1.5 py-1 text-[10px]"
            title="No backlog"
          >
            ✓
          </span>
        ) : null}
        {onDetails ? (
          <button
            type="button"
            title="Detalhes"
            aria-label={`Detalhes: ${presentation.title}`}
            onClick={onDetails}
            className="game-card-action shrink-0"
          >
            <FcInfo className="text-2xl" />
          </button>
        ) : null}
      </div>

      <Image
        src={coverSrc}
        alt=""
        aria-hidden="true"
        fill
        sizes="(max-width: 767px) 48vw, (max-width: 1023px) 20vw, (max-width: 1535px) 14vw, 9vw"
        className="object-cover"
        onError={() => setCoverFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="game-card-caption absolute inset-x-0 bottom-0 w-full px-1 pb-1">
        <p
          className="game-card-title text-[11px] leading-snug"
          title={presentation.title}
        >
          {presentation.title}
        </p>
        {presentation.subtitle ? (
          <p className="game-card-subtitle text-[10px] leading-snug">
            {presentation.subtitle}
          </p>
        ) : null}
        {presentation.metaLines.map((line) => (
          <p key={line} className="game-card-meta text-[10px] leading-snug">
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
