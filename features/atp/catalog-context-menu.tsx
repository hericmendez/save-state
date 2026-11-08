"use client";

import { CustomContextMenu, type ContextMenuItem } from "@/features/games/context-menu";

export function CatalogMenu({
  owned,
  onDetails,
  onToggleBacklog,
  onEditAndAdd,
  busy = false,
  editBusy = false,
  children,
}: {
  owned: boolean;
  onDetails: () => void;
  onToggleBacklog: () => void;
  onEditAndAdd?: () => void;
  busy?: boolean;
  editBusy?: boolean;
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
  if (onEditAndAdd) {
    items.push({
      key: "edit-add",
      label: editBusy ? "Carregando…" : "Editar jogo e adicionar",
      onClick: onEditAndAdd,
      disabled: editBusy,
    });
  }

  return <CustomContextMenu items={items}>{children}</CustomContextMenu>;
}
