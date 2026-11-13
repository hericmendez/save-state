"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiRequestError, api } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";
import { getSafePostLoginDestination } from "@/lib/auth/post-login-destination";
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await api.login(email, password);
      router.refresh();
      router.push(getSafePostLoginDestination(searchParams.get("from")));
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Login failed",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="font-display text-center text-xl">Entrar</h1>
      {searchParams.get("passwordReset") === "1" && (
        <p role="status">Senha redefinida com sucesso. Entre usando sua nova senha.</p>
      )}
      {searchParams.get("passwordChanged") === "1" && (
        <p role="status">Senha alterada com sucesso. As sessões anteriores foram encerradas; entre novamente com sua nova senha.</p>
      )}
      {searchParams.get("logout") === "unconfirmed" && (
        <p role="alert">Não foi possível confirmar o encerramento das sessões em outros dispositivos. Este navegador foi desconectado; entre novamente e tente sair outra vez se necessário.</p>
      )}
      {searchParams.get("loggedOut") === "1" && (
        <p role="status">Você saiu da sua conta.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <label>
        Email
        <RPGUInput
          className="w-full"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label>
        Senha
        <RPGUInput
          className="w-full"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <RPGUIButton
        type="submit"
        title={isLoading ? "Entrando…" : "Entrar"}
        disabled={isLoading}
      />
      <Link className="text-center underline" href="/forgot-password">Esqueci minha senha</Link>
      <Link className="text-center underline" href="/check-email">Precisa confirmar o e-mail? Solicitar outro link</Link>
      <p className="text-center">
        Sem conta? <Link href="/register">Criar conta</Link>
      </p>
    </form>
  );
}
