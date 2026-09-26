"use client";

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

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={presentation.coverUrl || "/yugioh.png"}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 w-full p-0!">
        <h3 className="font-display text-xs">{presentation.title}</h3>
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
