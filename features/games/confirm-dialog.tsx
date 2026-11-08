"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import RPGUIButton from "@/components/RPGUI/Button";

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
  // Portal to the viewport: callers mount this dialog deep inside
  // zoomed/scrollable containers (sidebar, drawers), where a plain
  // `fixed` element would be trapped by the ancestor instead of
  // centering on the screen. SSR-safe: portals need `document`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  return createPortal(
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
          <RPGUIButton
            type="button"
            title={isLoading ? `${confirmLabel}…` : confirmLabel}
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
          />
          <RPGUIButton
            type="button"
            title="Cancelar"
            onClick={onCancel}
            disabled={isLoading}
          />
          {isLoading && (
            <span className="font-display text-xs self-center" aria-live="polite">
              [ Carregando... ]
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
