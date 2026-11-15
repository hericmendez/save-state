"use client";

import { CustomContextMenu, type ContextMenuItem } from "@/features/games/context-menu";

export function CatalogMenu({
  owned,
  onDetails,
  onToggleBacklog,
  onEditAndAdd,
  collections,
  collectionsLoadFailed = false,
  onAddToCollection,
  busy = false,
  editBusy = false,
  children,
}: {
  owned: boolean;
  onDetails: () => void;
  onToggleBacklog: () => void;
  onEditAndAdd?: () => void;
  collections: { _id: string; name: string }[];
  collectionsLoadFailed?: boolean;
  onAddToCollection: (collectionId: string) => void;
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
    {
      key: "add-to-collection",
      label: "Adicionar a…",
      disabled: busy,
      children:
        collections.length === 0
          ? [
              {
                key: "collections-empty",
                label: collectionsLoadFailed
                  ? "(não foi possível carregar)"
                  : "(nenhuma coleção)",
              },
            ]
          : collections.map((collection) => ({
              key: `collection-${collection._id}`,
              label: collection.name,
              onClick: () => onAddToCollection(collection._id),
            })),
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
