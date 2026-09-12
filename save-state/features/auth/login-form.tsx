"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiRequestError, api } from "@/lib/api-client";

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
      router.push(searchParams.get("from") ?? "/dashboard");
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
      {error && <p role="alert">{error}</p>}
      <label>
        Email
        <input
          className="rpgui-input w-full"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label>
        Senha
        <input
          className="rpgui-input w-full"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <button
        className="rpgui-button"
        type="submit"
        disabled={isLoading}
      >
        {isLoading ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-center">
        Sem conta? <Link href="/register">Criar conta</Link>
      </p>
    </form>
  );
}
