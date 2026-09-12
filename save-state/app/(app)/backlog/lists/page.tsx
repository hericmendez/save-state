import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGameLists } from "@/server/lists/service";
import { ListsManager } from "@/features/lists/lists-manager";
import { toPlainGameList } from "@/features/games/mappers";

export default async function ListsPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog/lists");
  }

  const lists = await listGameLists(session.id, {
    page: 1,
    limit: 100,
    withCount: true,
  });

  return <ListsManager initialLists={lists.data.map(toPlainGameList)} />;
}
