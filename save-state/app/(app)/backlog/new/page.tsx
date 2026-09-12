import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { GameFormContainer } from "@/features/games/game-form-container";

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: Promise<{ listId?: string }>;
}) {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog/new");
  }
  const { listId } = await searchParams;
  return <GameFormContainer attachListId={listId} />;
}
