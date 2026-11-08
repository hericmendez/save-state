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
    <form onSubmit={handleSubmit} className="mt-3 flex gap-2" role="search">
      <RPGUInput
        className="flex-1"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Buscar no catálogo geral…"
        maxLength={200}
        aria-label="Buscar no catálogo geral"
        type="search"
      />
      <RPGUIButton type="submit" title="Buscar" className="self-start" />
    </form>
  );
}
