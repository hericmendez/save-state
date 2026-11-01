import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import { getCurrentSession } from "@/server/auth/session";
import { getGameCollection, listGamesInCollection } from "@/server/collections/service";
import { BacklogView } from "@/features/games/backlog-view";
import { listGameCollections } from "@/server/collections/service";
import { toPlainGame, toPlainGameCollection } from "@/features/games/mappers";
import {
  parseLibrarySearchParams,
  toLibraryServiceFilters,
} from "@/features/games/user-game-query";

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const { listId: collectionId } = await params;

  let collection;
  try {
    collection = await getGameCollection(session.id, collectionId);
  } catch (error) {
    if (error instanceof ApiError && error.code === "LIST_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const initialQuery = parseLibrarySearchParams(await searchParams);
  const [games, collections] = await Promise.all([
    listGamesInCollection(
      session.id,
      collectionId,
      toLibraryServiceFilters(initialQuery),
    ),
    listGameCollections(session.id, { page: 1, limit: 100, withCount: false }),
  ]);

  return (
    <BacklogView
      initialGames={games.data.map(toPlainGame)}
      initialPagination={games.pagination}
      initialQuery={initialQuery}
      collections={collections.data.map(toPlainGameCollection)}
      collectionId={collectionId}
      listName={collection.name}
      emptyMessage="Esta coleção ainda não possui jogos."
    />
  );
}
