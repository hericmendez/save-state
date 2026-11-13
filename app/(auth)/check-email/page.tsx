import Link from "next/link";
import { Suspense } from "react";
import { CheckEmail } from "@/features/auth/check-email";

export default function CheckEmailPage() {
  return <section className="flex flex-col gap-4 text-center"><h1 className="font-display text-xl">Confirme seu e-mail</h1><p>Você pode solicitar um novo link para qualquer conta que ainda esteja pendente. A solicitação não confirma que a mensagem foi entregue.</p><Suspense><CheckEmail /></Suspense><Link href="/login" className="underline">Voltar ao login</Link></section>;
}
