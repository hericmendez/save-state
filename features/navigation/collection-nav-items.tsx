"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import { ConfirmDialog } from "@/features/games/confirm-dialog";
import { MenuList } from "@/features/games/context-menu";
import { placeMenu } from "@/features/games/menu-position";
import {
  notifyCollectionsChanged,
  useCollectionsVersion,
} from "@/features/collections/collections-signal";
import { useCollectionModalStore } from "@/features/collections/collection-modal-store";

interface CollectionNavEntry {
  _id: string;
  name: string;
  gameCount?: number;
}

/**
 * User collections rendered directly inside the "Minhas coleções"
 * submenu (domain: GameCollection since Etapa 6).
 * Re-reads the existing /api/game-collections index on mount and on every
 * shared collections change (create/rename/delete from the modal, this
 * submenu or the lists page). Failures or an empty library render
 * nothing (the static "Todas as coleções" entry covers navigation).
 * Both desktop and mobile mount this through NavItemGroup.
 */
export function CollectionNavItems({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const [collections, setCollections] = useState<CollectionNavEntry[] | null>(
    null,
  );
  const [menuFor, setMenuFor] = useState<CollectionNavEntry | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<CollectionNavEntry | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const openEdit = useCollectionModalStore((s) => s.openEdit);
  const collectionsVersion = useCollectionsVersion();

  const load = useCallback(async () => {
    try {
      const result = await apiRequest<{ data: CollectionNavEntry[] }>(
        "/api/game-collections?limit=100&withCount=true",
      );
      setCollections(result.data);
    } catch {
      setCollections([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, collectionsVersion]);

  useEffect(() => {
    if (!menuFor) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuFor(null);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuFor(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuFor]);

  function openMenu(
    event: React.MouseEvent<HTMLButtonElement>,
    collection: CollectionNavEntry,
  ) {
    // Never navigate when opening the context menu.
    event.stopPropagation();
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuFor(collection);
    setMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
  }

  function startRename(collection: CollectionNavEntry) {
    // The shared create modal handles editing (centered on the
    // viewport, prefilled, same validation/loading/error behavior).
    setMenuFor(null);
    setMenuAnchor(null);
    openEdit(collection._id, collection.name);
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return;
    const target = deleteTarget;
    setIsDeleting(true);
    setError(null);
    try {
      await apiRequest(`/api/game-collections/${target._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setCollections((current) =>
        current === null
          ? current
          : current.filter((entry) => entry._id !== target._id),
      );
      notifyCollectionsChanged();
      // Never leave the user on a deleted list route.
      if (pathname === `/backlog/lists/${target._id}`) {
        router.push("/backlog/lists");
      }
      router.refresh();
    } catch (err) {
      setDeleteTarget(null);
      setError(
        err instanceof ApiRequestError ? err.message : "Falha ao excluir",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (!collections || collections.length === 0) return null;

  const placed = menuAnchor
    ? placeMenu({
        anchorX: menuAnchor.x,
        anchorY: menuAnchor.y,
        menuWidth: 192,
        menuHeight: 96,
        viewportWidth:
          typeof window === "undefined" ? 1024 : window.innerWidth,
        viewportHeight:
          typeof window === "undefined" ? 768 : window.innerHeight,
      })
    : null;

  return (
    <>
      <ul className="space-y-2" aria-label="Coleções do usuário">
        {collections.map((collection) => (
          <li
            key={collection._id}
            className="rpgui-container framed-grey"
            title={collection.name}
          >
            <div className="flex items-center gap-1">
              {typeof collection.gameCount === "number" ? (
                <span
                  className="shrink-0 pl-2 text-sm text-white/70 font-display tabular-nums"
                  aria-hidden="true"
                >
                  [{collection.gameCount}]
                </span>
              ) : null}
              <Link
                className="block min-w-0 flex-1 truncate px-2 py-1 text-sm text-white font-display hover:text-amber-300 hover:underline"
                href={`/backlog/lists/${encodeURIComponent(collection._id)}`}
                onClick={onNavigate}
                aria-label={
                  typeof collection.gameCount === "number"
                    ? `[${collection.gameCount}] ${collection.name}`
                    : collection.name
                }
              >
                {collection.name}
              </Link>
              <button
                type="button"
                aria-label={`Opções de ${collection.name}`}
                aria-haspopup="menu"
                aria-expanded={menuFor?._id === collection._id}
                className="shrink-0 px-3 py-2 text-white/70 font-display hover:text-amber-300"
                onClick={(event) => openMenu(event, collection)}
              >
                ⋯
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="px-2 text-xs">
          {error}
        </p>
      )}
      {menuFor &&
        placed &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[99999]"
            style={{ left: placed.x, top: placed.y }}
            role="menu"
            aria-label={`Opções de ${menuFor.name}`}
          >
            <MenuList
              items={[
                {
                  key: "rename",
                  label: "Renomear",
                  onClick: () => startRename(menuFor),
                },
                {
                  key: "delete",
                  label: "Excluir",
                  onClick: () => {
                    setMenuFor(null);
                    setMenuAnchor(null);
                    setError(null);
                    setDeleteTarget(menuFor);
                  },
                },
              ]}
              onClose={() => setMenuFor(null)}
            />
          </div>,
          document.body,
        )}
      {deleteTarget && (
        <ConfirmDialog
          title="Excluir coleção"
          message={`Excluir a coleção "${deleteTarget.name}"? Os jogos serão preservados.`}
          confirmLabel="Excluir"
          isLoading={isDeleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => !isDeleting && setDeleteTarget(null)}
        />
      )}
    </>
  );
}
