import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGameCollections } from "@/server/collections/service";
import { CollectionsManager } from "@/features/collections/collections-manager";
import { toPlainGameCollection } from "@/features/games/mappers";

export default async function CollectionsPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog/lists");
  }

  const collections = await listGameCollections(session.id, {
    page: 1,
    limit: 100,
    withCount: true,
  });

  return <CollectionsManager initialCollections={collections.data.map(toPlainGameCollection)} />;
}
