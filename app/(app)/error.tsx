"use client";

import RPGUIButton from "@/components/RPGUI/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-col gap-4">
      <div className="rpgui-container framed-grey p-6" role="alert">
        <h1 className="font-display text-2xl">Algo deu errado</h1>
        <p className="mt-2">Não foi possível carregar esta página.</p>
        <RPGUIButton type="button" title="Tentar novamente" onClick={reset} className="mt-4" />
      </div>
    </main>
  );
}
