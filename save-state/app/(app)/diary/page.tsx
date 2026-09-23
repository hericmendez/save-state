import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { DiaryView } from "@/features/diary/diary-view";

export default async function DiaryPage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/diary");
  }
  return <DiaryView />;
}
