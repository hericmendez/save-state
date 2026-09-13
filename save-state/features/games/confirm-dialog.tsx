"use client";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  onConfirm,
  onCancel,
  isLoading,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="rpgui-container framed-golden max-w-sm p-6">
        <h2 className="font-display text-lg">{title}</h2>
        <p className="mt-2">{message}</p>
        <div className="mt-4 flex gap-2">
          <button
            className="rpgui-button"
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? `${confirmLabel}…` : confirmLabel}
          </button>
          <button
            className="rpgui-button"
            type="button"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancelar
          </button>
          {isLoading && (
            <span className="font-display text-xs self-center" aria-live="polite">
              [ Carregando... ]
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
