import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import { getCurrentSession } from "@/server/auth/session";
import { getGame } from "@/server/games/service";
import { GameFormContainer } from "@/features/games/game-form-container";
import { toPlainGame } from "@/features/games/mappers";

export default async function EditGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const { gameId } = await params;

  let game;
  try {
    game = await getGame(session.id, gameId);
  } catch (error) {
    if (error instanceof ApiError && error.code === "GAME_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <GameFormContainer editingId={gameId} initialGame={toPlainGame(game)} />
  );
}
