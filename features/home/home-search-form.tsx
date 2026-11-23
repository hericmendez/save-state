"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";

/** Home → Busca Geral. Navigates to /search reusing the catalog BFF contract. */
export function HomeSearchForm() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?search=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex min-w-0 items-start gap-2" role="search">
      <RPGUInput
        className="min-w-0 flex-1"
        density="compact"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Buscar no catálogo geral…"
        maxLength={200}
        aria-label="Buscar no catálogo geral"
        type="search"
      />
      <RPGUIButton
        type="submit"
        title="Buscar"
        size="icon"
        aria-label="Buscar"
        className="shrink-0"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      </RPGUIButton>
    </form>
  );
}
