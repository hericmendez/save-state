import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGames } from "@/server/games/service";
import { listGameCollections } from "@/server/collections/service";
import { BacklogView } from "@/features/games/backlog-view";
import { toPlainGame, toPlainGameCollection } from "@/features/games/mappers";
import {
  parseLibrarySearchParams,
  toLibraryServiceFilters,
} from "@/features/games/user-game-query";

export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog");
  }

  const initialQuery = parseLibrarySearchParams(await searchParams);
  const [games, collections] = await Promise.all([
    listGames(session.id, toLibraryServiceFilters(initialQuery)),
    listGameCollections(session.id, { page: 1, limit: 100, withCount: false }),
  ]);

  return (
    <BacklogView
      initialGames={games.data.map(toPlainGame)}
      initialPagination={games.pagination}
      initialQuery={initialQuery}
      collections={collections.data.map(toPlainGameCollection)}
    />
  );
}
