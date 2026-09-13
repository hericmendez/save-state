"use client";

import { useState } from "react";

export function ExportButtons() {
  const [isJsonLoading, setIsJsonLoading] = useState(false);
  const [isCsvLoading, setIsCsvLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(path: string, filename: string, setLoading: (v: boolean) => void) {
    if (isJsonLoading || isCsvLoading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rpgui-container framed-grey flex flex-col gap-3 p-4">
      <p className="text-sm">Baixe seus dados. O arquivo contém apenas seus jogos e listas.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rpgui-button"
          type="button"
          disabled={isJsonLoading || isCsvLoading}
          aria-busy={isJsonLoading}
          onClick={() => handleExport("/api/auth/export", "save-state.json", setIsJsonLoading)}
        >
          {isJsonLoading ? "Baixando…" : "Baixar JSON"}
        </button>
        <button
          className="rpgui-button"
          type="button"
          disabled={isJsonLoading || isCsvLoading}
          aria-busy={isCsvLoading}
          onClick={() => handleExport("/api/auth/export/csv", "save-state.csv", setIsCsvLoading)}
        >
          {isCsvLoading ? "Baixando…" : "Baixar CSV"}
        </button>
        {(isJsonLoading || isCsvLoading) && (
          <span className="font-display text-xs" aria-live="polite">
            [ Carregando... ]
          </span>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
