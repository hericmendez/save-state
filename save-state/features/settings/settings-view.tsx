"use client";

import { useUiStore, type LayoutMode } from "@/features/shared/ui-store";
import { ExportButtons } from "./export-buttons";
import { UsernameForm } from "./username-form";
import { PasswordForm } from "./password-form";
import RPGUISelect from "@/components/RPGUI/Select";

export function SettingsView({ initialUsername }: { initialUsername: string }) {
  const layoutMode = useUiStore((state) => state.layoutMode);
  const setLayoutMode = useUiStore((state) => state.setLayoutMode);

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container  p-4">
        <h1 className="font-display text-2xl">Configurações</h1>
      </header>
      <section className="rpgui-container framed-grey flex flex-col gap-3 p-4 mx-4">
        <h2 className="font-display">Aparência</h2>
        <label className="flex flex-col gap-1">
          Modo de layout
          <RPGUISelect
            
            value={layoutMode}
            onChange={(event) =>
              setLayoutMode(event.target.value as LayoutMode)
            }
          >
            <option value="pixel-perfect">Pixel perfect</option>
            <option value="fullscreen">Tela cheia</option>
          </RPGUISelect>
        </label>
      </section>
      <section className="rpgui-container  flex flex-col gap-3 p-4">
        <h2 className="font-display">Usuário</h2>
        <UsernameForm initialName={initialUsername} />
        <div className="mt-4">
          <h3 className="font-display text-sm">Alterar Senha</h3>
          <PasswordForm />
        </div>
      </section>
      <section className="rpgui-container  flex flex-col gap-3 p-4">
        <h2 className="font-display">Exportar Dados</h2>
        <ExportButtons />
      </section>
    </div>
  );
}
