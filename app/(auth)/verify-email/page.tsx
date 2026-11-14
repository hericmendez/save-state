import { VerifyEmail } from "@/features/auth/verify-email";
import { Suspense } from "react";
export const metadata = { referrer: "no-referrer" as const };
export default function VerifyEmailPage() { return <Suspense fallback={<p role="status">Carregando…</p>}><VerifyEmail /></Suspense>; }
