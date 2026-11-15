import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import { getCurrentSession } from "@/server/auth/session";
import { getUserById, toSafeUser } from "@/server/auth/service";
import { AppShell } from "@/features/navigation/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const user = await getUserById(session.id);
  if (!user) {
    throw new ApiError("USER_NOT_FOUND", "Authenticated user no longer exists", 404);
  }
  return <AppShell user={toSafeUser(user)}>{children}</AppShell>;
}
