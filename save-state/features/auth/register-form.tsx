"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiRequestError, api } from "@/lib/api-client";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await api.register(name, email, password);
      // Registration does not establish a session; sign in afterwards.
      await api.login(email, password);
      router.refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Registration failed",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rpgui-content flex flex-col gap-4">
      <h1 className="font-display text-center text-xl">Criar conta</h1>
      {error && <p role="alert">{error}</p>}
      <label>
        Nome
        <input
          className="rpgui-input w-full"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={100}
          autoComplete="nickname"
        />
      </label>
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
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirmar senha
        <input
          className="rpgui-input w-full"
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          required
          autoComplete="new-password"
        />
      </label>
      <button className="rpgui-button" type="submit" disabled={isLoading}>
        {isLoading ? "Criando…" : "Criar conta"}
      </button>
      <p className="text-center">
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </form>
  );
}
