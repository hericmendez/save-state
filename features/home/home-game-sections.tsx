"use client";

import { useState } from "react";
import Link from "next/link";
import { FaGamepad } from "react-icons/fa";
import { GiBroadsword } from "react-icons/gi";
import type { Game } from "@/features/shared/types";
import { GameModal } from "@/features/games/game-modal";
import { highlightIcon, type CategoryIcon, type Highlight } from "./home-metrics";

function formatInteger(value: number): string {
  return value.toLocaleString("pt-BR");
}

/**
 * Illustrative badge for category highlights. Same box as game covers
 * (h-14 w-11) so icons and covers stay visually equivalent.
 */
function CategoryBadge({ icon }: { icon: CategoryIcon }) {
  const Icon = icon === "gamepad-2" ? FaGamepad : GiBroadsword;
  return (
    <div
      aria-hidden="true"
      className="flex h-14 w-11 shrink-0 items-center justify-center bg-black/30 text-xl"
    >
      <Icon />
    </div>
  );
}

function GameRow({
  game,
  meta,
  onOpen,
}: {
  game: Game;
  meta?: string;
  onOpen: () => void;
}) {
  const cover =
    typeof game.game?.cover === "string" && game.game.cover.length > 0
      ? game.game.cover
      : null;
  return (
    <div className="flex min-w-0 items-center gap-3 py-2">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="h-14 w-11 shrink-0 object-cover"
          loading="lazy"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-14 w-11 shrink-0 items-center justify-center bg-black/30 text-lg"
        >
          {(game.game?.name ?? "?").slice(0, 1)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="w-full text-left whitespace-normal underline break-words"
          style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
        >
          {game.game?.name ?? "Jogo"}
        </button>
        {meta && (
          <p
            className="mt-0.5 text-sm break-words"
            style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
          >
            {meta}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Nível 2 — Continuar jogando. Up to 3 `playing` games in library order.
 * Compact rows; each row opens the existing GameModal. Discreet empty
 * state that takes no unnecessary space.
 */
export function ContinuePlayingSection({
  games,
}: {
  games: Game[];
}) {
  const [selected, setSelected] = useState<Game | null>(null);
  return (
    <section
      aria-label="Continuar jogando"
      className="rpgui-container framed-grey min-w-0 p-4"
    >
      <h2 className="font-display text-lg">Continuar jogando</h2>
      {games.length === 0 ? (
        <p className="mt-2 text-sm">Nenhum jogo em andamento.</p>
      ) : (
        <div className="mt-1 divide-y divide-white/10">
          {games.map((game) => (
            <GameRow
              key={game._id}
              game={game}
              meta={
                typeof game.hoursPlayed === "number" && game.hoursPlayed > 0
                  ? `${game.hoursPlayed}h jogadas`
                  : undefined
              }
              onOpen={() => setSelected(game)}
            />
          ))}
        </div>
      )}
      <GameModal game={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

/**
 * Nível 2 — Meu Top 3. First three positions of the personal Top 10 in
 * the user's exact order (never re-ranked by rating or hours). Fewer
 * than three shows whatever is available; empty shows a discreet CTA.
 */
export function TopThreeSection({ topThree }: { topThree: Game[] }) {
  const [selected, setSelected] = useState<Game | null>(null);
  return (
    <section
      aria-label="Meu Top 3"
      className="rpgui-container framed-grey min-w-0 p-4"
    >
      <h2 className="font-display text-lg">Meu Top 3</h2>
      {topThree.length === 0 ? (
        <p className="mt-2 text-sm">
          Você ainda não definiu seu Top 10.{" "}
          <Link href="/backlog/top10" className="underline">
            Configurar minha lista
          </Link>
        </p>
      ) : (
        <>
          <ol className="mt-1 divide-y divide-white/10">
            {topThree.map((game, index) => (
              <li key={game._id} className="flex min-w-0 items-center gap-2">
                <span
                  aria-label={`Posição ${index + 1}`}
                  className="font-display shrink-0"
                >
                  #{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <GameRow
                    game={game}
                    meta={
                      typeof game.rating === "number"
                        ? `Sua nota: ${game.rating}`
                        : undefined
                    }
                    onOpen={() => setSelected(game)}
                  />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm">
            <Link href="/backlog/top10" className="underline">
              Ver Top 10 completo →
            </Link>
          </p>
        </>
      )}
      <GameModal game={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

/**
 * Nível 2 — Destaques da biblioteca. Two highlights drawn server-side
 * per page load from the six available kinds. Both live in this single
 * section; game highlights open the existing GameModal, category
 * highlights are plain text. No fabrication when data is missing.
 */
export function HighlightsSection({
  highlights,
}: {
  highlights: Highlight[];
}) {
  const [selected, setSelected] = useState<Game | null>(null);
  return (
    <section
      aria-label="Destaques da biblioteca"
      className="rpgui-container framed-grey min-w-0 p-4"
    >
      <h2 className="font-display text-lg">Destaques da biblioteca</h2>
      {highlights.length === 0 ? (
        <p className="mt-2 text-sm">
          Jogue e registre horas, notas e favoritos para ver seus destaques
          aqui.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-white/10">
          {highlights.map((highlight) =>
            "name" in highlight ? (
              <div
                key={highlight.kind}
                className="flex min-w-0 items-center gap-3 py-2"
              >
                <CategoryBadge icon={highlightIcon(highlight)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{highlight.title}</p>
                  <p
                    className="break-words"
                    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                  >
                    {highlight.name}
                  </p>
                  <p className="mt-0.5 text-sm">
                    {formatInteger(highlight.games)} jogos /{" "}
                    {formatInteger(highlight.hours)}h
                  </p>
                </div>
              </div>
            ) : (
              <div key={highlight.kind} className="min-w-0">
                <p className="pt-2 text-sm">{highlight.title}</p>
                <GameRow
                  game={highlight.game}
                  meta={highlight.metric ?? undefined}
                  onOpen={() => setSelected(highlight.game)}
                />
              </div>
            ),
          )}
        </div>
      )}
      <GameModal game={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
