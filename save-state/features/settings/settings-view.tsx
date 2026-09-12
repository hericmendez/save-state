"use client";

import { useUiStore, type LayoutMode } from "@/features/shared/ui-store";

export function SettingsView() {
  const layoutMode = useUiStore((state) => state.layoutMode);
  const setLayoutMode = useUiStore((state) => state.setLayoutMode);

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Configurações</h1>
      </header>
      <section className="rpgui-container framed-golden flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1">
          Modo de layout
          <select
            className="rpgui-dropdown"
            value={layoutMode}
            onChange={(event) =>
              setLayoutMode(event.target.value as LayoutMode)
            }
          >
            <option value="pixel-perfect">Pixel perfect</option>
            <option value="fullscreen">Tela cheia</option>
          </select>
        </label>
      </section>
    </div>
  );
}
