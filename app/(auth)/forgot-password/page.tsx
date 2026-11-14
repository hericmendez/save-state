"use client";

import { useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: { email } });
      setMessage("Se houver uma conta para esse endereço, enviaremos um link de recuperação.");
    } catch {
      setMessage("Não foi possível concluir a solicitação. Tente novamente mais tarde.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="font-display text-center text-xl">Recuperar senha</h1>
      {message && <p role="status">{message}</p>}
      <label>
        E-mail
        <RPGUInput
          className="w-full"
          type="email"
          maxLength={254}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      <aside
        role="note"
        aria-labelledby="recovery-development-title"
        className="rpgui-container framed-grey flex flex-col gap-1 p-3 text-sm"
      >
        <p id="recovery-development-title" className="font-display">
          Recuperação de senha em desenvolvimento
        </p>
        <p>
          Esta funcionalidade ainda está em desenvolvimento. Se você esqueceu sua
          senha e não consegue recuperar o acesso, entre em contato com o
          desenvolvedor pelo e-mail{" "}
          <a className="break-all underline" href="mailto:heric.mendez00@gmail.com">
            heric.mendez00@gmail.com
          </a>
          .
        </p>
      </aside>
      <RPGUIButton type="submit" title={busy ? "Enviando…" : "Enviar link"} disabled={busy} />
      <Link href="/login" className="text-center underline">
        Voltar ao login
      </Link>
    </form>
  );
}
