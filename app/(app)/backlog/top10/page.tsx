import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { getTop10, getTop10Candidates } from "@/server/top10/service";
import { toPlainGame } from "@/features/games/mappers";
import { Top10View } from "@/features/top10/top10-view";

export default async function Top10Page() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog/top10");
  }

  const [top10, candidates] = await Promise.all([
    getTop10(session.id),
    getTop10Candidates(session.id),
  ]);

  return (
    <Top10View
      initialTop10={top10.map(toPlainGame)}
      initialCandidates={candidates.map(toPlainGame)}
    />
  );
}
