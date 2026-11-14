import Link from "next/link";
import { Suspense } from "react";
import { CheckEmail } from "@/features/auth/check-email";

export default function CheckEmailPage() {
  return <section className="flex flex-col gap-4 text-center"><h1 className="font-display text-xl">Confirmar e-mail</h1><p>A confirmação é opcional; você pode entrar mesmo sem confirmar. Se quiser solicitar um novo link para uma conta ainda não confirmada, use o formulário abaixo.</p><Suspense><CheckEmail /></Suspense><Link href="/login" className="underline">Voltar ao login</Link></section>;
}
