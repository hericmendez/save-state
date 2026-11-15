"use client";

import RPGUIButton from "@/components/RPGUI/Button";
import type { AtpPreview } from "./atp-result";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <strong>{label}:</strong> {value}
    </p>
  );
}

export function CatalogDrawerContent({
  preview,
  onImport,
  importing,
  onClose,
}: {
  preview: AtpPreview;
  onImport: () => void;
  importing: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-4">
        {preview.coverUrl && (
          <div className="rpgui-container framed-grey p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.coverUrl} alt="" className="max-h-[50vh] w-full object-contain" />
          </div>
        )}
        <div className="flex flex-col gap-1 text-sm">
          {preview.year !== null && <DetailRow label="Ano" value={String(preview.year)} />}
          {preview.platforms.length > 0 && <DetailRow label="Plataformas" value={preview.platforms.join(", ")} />}
          {preview.genres.length > 0 && <DetailRow label="Gêneros" value={preview.genres.join(", ")} />}
          {preview.developers.length > 0 && <DetailRow label="Desenvolvedoras" value={preview.developers.join(", ")} />}
          {preview.publishers.length > 0 && <DetailRow label="Publicadoras" value={preview.publishers.join(", ")} />}
        </div>
        {preview.manualDuplicate ? (
          <p className="rpgui-container framed-grey p-3 text-sm">
            <strong>Atenção:</strong> você já tem o jogo manual &ldquo;{preview.manualDuplicate.name}&rdquo;. Importar
            criará um registro separado.
          </p>
        ) : null}
        {preview.owned && <p className="rpgui-container framed-grey p-3 text-sm">✓ Este jogo já está no seu backlog.</p>}
      </div>
      <div className="mt-4 flex gap-2">
        {preview.owned ? (
          <RPGUIButton type="button" title="No backlog ✓" onClick={onClose} />
        ) : (
          <RPGUIButton
            type="button"
            title={importing ? "Importando…" : "Adicionar ao Backlog"}
            onClick={onImport}
            disabled={importing}
          />
        )}
        <RPGUIButton type="button" title="Fechar" onClick={onClose} />
      </div>
    </>
  );
}
