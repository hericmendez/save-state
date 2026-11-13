"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import Link from "next/link";
export function VerifyEmail() {
  const router = useRouter(); const params = useSearchParams();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function confirm() { const token = params.get("token"); if (!token) { setMessage("Link inválido ou expirado."); return; } setBusy(true); try { await apiRequest("/api/auth/verify-email", { method: "POST", body: { token } }); window.history.replaceState({}, "", "/verify-email"); setMessage("E-mail confirmado! Você já pode entrar."); } catch { setMessage("Link inválido ou expirado. Solicite um novo link."); } finally { setBusy(false); } }
  const confirmed = message.includes("confirmado");
  return <section className="flex flex-col gap-4 text-center"><h1 className="font-display text-xl">Ativar conta</h1>{message ? <p role="status">{message}</p> : <p>Confirme que este endereço de e-mail é seu.</p>} {!message && <RPGUIButton type="button" title={busy ? "Confirmando…" : "Confirmar e-mail"} disabled={busy} onClick={confirm} />} {confirmed ? <button className="underline" onClick={() => router.push("/login")}>Ir para login</button> : message ? <Link className="underline" href="/check-email">Solicitar outro link de confirmação</Link> : null}</section>;
}
