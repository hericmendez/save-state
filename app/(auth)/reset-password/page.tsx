import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { Suspense } from "react";
export const metadata = { referrer: "no-referrer" as const };
export default function ResetPasswordPage(){return <Suspense fallback={<p role="status">Carregando…</p>}><ResetPasswordForm/></Suspense>;}
