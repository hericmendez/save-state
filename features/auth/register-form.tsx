"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiRequestError, api } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";

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
      router.push("/check-email");
    } catch (err) {
      if (!(err instanceof ApiRequestError) || err.status >= 500) {
        setError(
          "Não foi possível confirmar o resultado do cadastro. Se ele foi concluído, você ainda pode solicitar um novo link de confirmação.",
        );
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="font-display text-center text-xl">Criar conta</h1>
      {error && <p role="alert">{error}</p>}
      <label>
        Nome
        <RPGUInput
          className="w-full"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={100}
          autoComplete="nickname"
        />
      </label>
      <label>
        Email
        <RPGUInput
          className="w-full"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={254}
          autoComplete="email"
          onBlur={(event) => setEmail(event.target.value.trim().toLowerCase())}
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
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirmar senha
        <RPGUInput
          className="w-full"
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          required
          autoComplete="new-password"
        />
      </label>
      <RPGUIButton
        type="submit"
        title={isLoading ? "Criando…" : "Criar conta"}
        disabled={isLoading}
      />
      <p className="text-center">
        Já se cadastrou ou não recebeu a confirmação?{" "}
        <Link href="/check-email">Solicitar outro link</Link>
      </p>
      <p className="text-center">
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </form>
  );
}
