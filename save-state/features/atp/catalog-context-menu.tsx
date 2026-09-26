"use client";

import { CustomContextMenu, type ContextMenuItem } from "@/features/games/context-menu";

export function CatalogMenu({
  owned,
  onDetails,
  onToggleBacklog,
  busy = false,
  children,
}: {
  owned: boolean;
  onDetails: () => void;
  onToggleBacklog: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const items: ContextMenuItem[] = [
    { key: "details", label: "Ver detalhes", onClick: onDetails },
    {
      key: "toggle",
      label: busy ? (owned ? "Removendo…" : "Adicionando…") : owned ? "Remover do Backlog" : "Adicionar ao Backlog",
      onClick: onToggleBacklog,
      disabled: busy,
    },
  ];

  return <CustomContextMenu items={items}>{children}</CustomContextMenu>;
}
