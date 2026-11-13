"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";
export function CheckEmail() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function resend(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/resend-verification", {
        method: "POST",
        body: { email: email.trim().toLowerCase() },
      });
      setMessage(
        "Se houver uma conta pendente para esse endereço, a solicitação foi processada. Isso não confirma a entrega da mensagem.",
      );
    } catch {
      setMessage("Não foi possível processar a solicitação. Tente novamente mais tarde.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={resend} className="flex flex-col gap-3">
      <p>
        Se o cadastro foi concluído, informe o endereço usado para solicitar
        outro link. A conta continuará pendente até a confirmação do e-mail.
      </p>
      <label>
        E-mail
        <RPGUInput
          className="w-full"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <RPGUIButton
        type="submit"
        title={busy ? "Solicitando…" : "Solicitar novo link"}
        disabled={busy}
      />
      {message && <p role="status">{message}</p>}
    </form>
  );
}
