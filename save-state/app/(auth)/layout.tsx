import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOTE: redirect() throws, so it must not sit inside a try/catch that
  // would swallow it — resolve the session to null instead.
  const session = await getCurrentSession().catch(() => null);
  if (session) {
    redirect("/dashboard");
  }
  return (
    <main className="rpgui-container framed-grey flex min-h-screen items-center justify-center">
      <div className="rpgui-container framed-golden w-full max-w-md p-6">
        {children}
      </div>
    </main>
  );
}
