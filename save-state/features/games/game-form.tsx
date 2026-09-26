//features/games/game-form.tsx
"use client";

import { GAME_STATUSES } from "@/schemas/games";
import { getStatusLabel } from "@/features/games/status-labels";
import { GameCoverSearch } from "@/features/games/game-cover-search";
import { GameMetadataSearch } from "@/features/games/game-metadata-search";

// RPGUI components
import RPGUIInput from "@/components/RPGUI/Input";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUISelect from "@/components/RPGUI/Select";
import RPGUITextArea from "@/components/RPGUI/TextArea";

export interface GameFormState {
  name: string;
  cover: string;
  genres: string;
  platforms: string;
  developers: string;
  publishers: string;
  releaseDate: string;
  summary: string;
  status: string;
  hoursPlayed: string;
  timesFinished: string;
  rating: string;
  review: string;
  favorite: boolean;
  fullyCompleted: boolean;
  achievements: boolean;
  achievementProgress: string;
}

export const EMPTY_GAME_FORM: GameFormState = {
  name: "",
  cover: "",
  genres: "",
  platforms: "",
  developers: "",
  publishers: "",
  releaseDate: "",
  summary: "",
  status: "backlog",
  hoursPlayed: "0",
  timesFinished: "0",
  rating: "",
  review: "",
  favorite: false,
  fullyCompleted: false,
  achievements: false,
  achievementProgress: "",
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function formToPayload(form: GameFormState): Record<string, unknown> {
  const personal: Record<string, unknown> = {
    status: form.status,
    hoursPlayed: Number(form.hoursPlayed) || 0,
    timesFinished: Number(form.timesFinished) || 0,
    favorite: form.favorite,
    fullyCompleted: form.fullyCompleted,
    achievements: form.achievements,
  };

  if (form.achievements && form.achievementProgress.trim() !== "") {
    personal.achievementProgress = Number(form.achievementProgress);
  } else if (!form.achievements) {
    personal.achievementProgress = null;
  }

  if (form.rating.trim() !== "") {
    personal.rating = Number(form.rating);
  }

  if (form.review.trim() !== "") {
    personal.review = form.review.trim();
  }

  const metadata: Record<string, unknown> = {
    name: form.name.trim(),
  };

  if (form.cover.trim() !== "") {
    metadata.cover = form.cover.trim();
  }

  const genres = splitList(form.genres);
  if (genres.length > 0) metadata.genres = genres;

  const platforms = splitList(form.platforms);
  if (platforms.length > 0) metadata.platforms = platforms;

  const developers = splitList(form.developers);
  if (developers.length > 0) metadata.developers = developers;

  const publishers = splitList(form.publishers);
  if (publishers.length > 0) metadata.publishers = publishers;

  if (form.releaseDate.trim() !== "") {
    metadata.releaseDate = form.releaseDate;
  }

  if (form.summary.trim() !== "") {
    metadata.summary = form.summary.trim();
  }

  return { game: metadata, ...personal };
}

export function GameForm({
  form,
  isEditing,
  isSubmitting,
  error,
  onChange,
  onSubmit,
  onCancel,
  metadataLocked,
}: {
  form: GameFormState;
  isEditing: boolean;
  isSubmitting: boolean;
  error: string | null;
  onChange: (patch: Partial<GameFormState>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  // True when editing an ATP snapshot: catalog metadata is read-only
  // (GAME_METADATA_IMMUTABLE); only personal fields stay editable.
  metadataLocked?: boolean;
}) {
  function field(label: string, node: React.ReactNode) {
    return (
      <label className="flex flex-col gap-1">
        {label}
        {node}
      </label>
    );
  }

  return (
    <form
      className=" flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {error && <p role="alert">{error}</p>}

      {metadataLocked && (
        <p>Dados do catálogo (importado via ATP) — somente leitura.</p>
      )}
      <h1 className="font-display text-xl">Dados do Jogo</h1>
      <hr  className="mb-2"/>
      {field(
        "Nome",
        <div className="flex flex-col md:flex-row gap-1 justify-between ">
          <RPGUIInput
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            required
            maxLength={255}
            disabled={metadataLocked}
          />

          {!metadataLocked && (
            <div className="ms-2">
              <GameMetadataSearch query={form.name} onApply={onChange} />
            </div>
          )}
        </div>,
      )}
      {field(
        "Capa (URL)",
        <div className="flex flex-col md:flex-row gap-1 justify-between ">
          <RPGUIInput
            value={form.cover}
            onChange={(event) => onChange({ cover: event.target.value })}
            maxLength={2048}
            disabled={metadataLocked}
          />

          {!metadataLocked && (
            <div className="mt-2">
              <GameCoverSearch
                query={form.name}
                onSelect={(url) => onChange({ cover: url })}
              />
            </div>
          )}
        </div>,
      )}
  {field(
        "Gêneros (vírgula)",
        <RPGUIInput
          value={form.genres}
          onChange={(event) => onChange({ genres: event.target.value })}
          disabled={metadataLocked}
        />,
      )}

      {field(
        "Plataformas (vírgula)",
        <RPGUIInput
          value={form.platforms}
          onChange={(event) => onChange({ platforms: event.target.value })}
          disabled={metadataLocked}
        />,
      )}

      {field(
        "Desenvolvedoras (vírgula)",
        <RPGUIInput
          value={form.developers}
          onChange={(event) => onChange({ developers: event.target.value })}
          disabled={metadataLocked}
        />,
      )}

      {field(
        "Publicadoras (vírgula)",
        <RPGUIInput
          value={form.publishers}
          onChange={(event) => onChange({ publishers: event.target.value })}
          disabled={metadataLocked}
        />,
      )}

      {field(
        "Lançamento",
        <RPGUIInput
          type="date"
          value={form.releaseDate}
          onChange={(event) =>
            onChange({ releaseDate: event.target.value })
          }
          disabled={metadataLocked}
        />,
      )}


      {field(
        "Resumo",
        <RPGUITextArea
          value={form.summary}
          onChange={(event) => onChange({ summary: event.target.value })}
          rows={6}
          disabled={metadataLocked}
        />,
      )}

      <div className="grid grid-cols-2 gap-3">

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.achievements}
            onChange={(event) =>
              onChange({ achievements: event.target.checked })
            }
          />
          Possui Conquistas (Achievements, Troféus, etc)
        </label>

        {form.achievements &&
          field(
            "Progresso conquistas (0-100)",
            <RPGUIInput
              type="number"
              min={0}
              max={100}
              value={form.achievementProgress}
              onChange={(event) =>
                onChange({ achievementProgress: event.target.value })
              }
            />,
          )}
      </div>
  <h1 className="font-display text-xl mt-5">Dados do Jogador</h1>
      <hr  className="mb-2"/>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field(
          "Horas",
          <RPGUIInput
            type="number"
            min={0}
            value={form.hoursPlayed}
            onChange={(event) => onChange({ hoursPlayed: event.target.value })}
          />,
        )}

        {field(
          "Zerado ×",
          <RPGUIInput
            type="number"
            min={0}
            step={1}
            value={form.timesFinished}
            onChange={(event) =>
              onChange({ timesFinished: event.target.value })
            }
          />,
        )}

        {field(
          "Nota (0–10)",
          <RPGUIInput
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={form.rating}
            onChange={(event) => onChange({ rating: event.target.value })}
          />,
        )}
        {field(
          "Status",
          <RPGUISelect
            className="w-full"
            value={form.status}
            onChange={(event) => onChange({ status: event.target.value })}
          >
            {GAME_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status)}
              </option>
            ))}
          </RPGUISelect>,
        )}
      </div>
            <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.favorite}
            onChange={(event) => onChange({ favorite: event.target.checked })}
          />
          Favorito
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.fullyCompleted}
            onChange={(event) =>
              onChange({ fullyCompleted: event.target.checked })
            }
          />
          100% completo
        </label>

       
      </div>
      {field(
        "Review",
        <RPGUITextArea
          value={form.review}
          placeholder="Suas experiências pessoais com o jogo"
          onChange={(event) => onChange({ review: event.target.value })}
          rows={6}
        />,
      )}

      <div className="flex gap-2">
        <RPGUIButton
          type="submit"
          title={
            isSubmitting ? "Salvando…" : isEditing ? "Salvar" : "Criar jogo"
          }
          disabled={isSubmitting}
        />

        {onCancel && (
          <RPGUIButton
            type="button"
            title="Cancelar"
            onClick={onCancel}
            disabled={isSubmitting}
          />
        )}
      </div>
    </form>
  );
}
