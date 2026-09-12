"use client";

import { GAME_STATUSES } from "@/schemas/games";

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
  };
  if (form.rating.trim() !== "") personal.rating = Number(form.rating);
  if (form.review.trim() !== "") personal.review = form.review.trim();
  const metadata: Record<string, unknown> = { name: form.name.trim() };
  if (form.cover.trim() !== "") metadata.cover = form.cover.trim();
  const genres = splitList(form.genres);
  if (genres.length > 0) metadata.genres = genres;
  const platforms = splitList(form.platforms);
  if (platforms.length > 0) metadata.platforms = platforms;
  const developers = splitList(form.developers);
  if (developers.length > 0) metadata.developers = developers;
  const publishers = splitList(form.publishers);
  if (publishers.length > 0) metadata.publishers = publishers;
  if (form.releaseDate.trim() !== "") metadata.releaseDate = form.releaseDate;
  if (form.summary.trim() !== "") metadata.summary = form.summary.trim();
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
}: {
  form: GameFormState;
  isEditing: boolean;
  isSubmitting: boolean;
  error: string | null;
  onChange: (patch: Partial<GameFormState>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
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
      className="rpgui-container framed-grey flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {error && <p role="alert">{error}</p>}
      {field(
        "Nome",
        <input
          className="rpgui-input w-full"
          value={form.name}
          onChange={(event) => onChange({ name: event.target.value })}
          required
          maxLength={255}
        />,
      )}
      {field(
        "Status",
        <select
          className="rpgui-dropdown w-full"
          value={form.status}
          onChange={(event) => onChange({ status: event.target.value })}
        >
          {GAME_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>,
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field(
          "Horas",
          <input
            className="rpgui-input w-full"
            type="number"
            min={0}
            value={form.hoursPlayed}
            onChange={(event) => onChange({ hoursPlayed: event.target.value })}
          />,
        )}
        {field(
          "Zerado ×",
          <input
            className="rpgui-input w-full"
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
          <input
            className="rpgui-input w-full"
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={form.rating}
            onChange={(event) => onChange({ rating: event.target.value })}
          />,
        )}
        {field(
          "Capa (URL)",
          <input
            className="rpgui-input w-full"
            value={form.cover}
            onChange={(event) => onChange({ cover: event.target.value })}
            maxLength={2048}
          />,
        )}
      </div>
      {field(
        "Gêneros (vírgula)",
        <input
          className="rpgui-input w-full"
          value={form.genres}
          onChange={(event) => onChange({ genres: event.target.value })}
        />,
      )}
      {field(
        "Plataformas (vírgula)",
        <input
          className="rpgui-input w-full"
          value={form.platforms}
          onChange={(event) => onChange({ platforms: event.target.value })}
        />,
      )}
      {field(
        "Desenvolvedoras (vírgula)",
        <input
          className="rpgui-input w-full"
          value={form.developers}
          onChange={(event) => onChange({ developers: event.target.value })}
        />,
      )}
      {field(
        "Publicadoras (vírgula)",
        <input
          className="rpgui-input w-full"
          value={form.publishers}
          onChange={(event) => onChange({ publishers: event.target.value })}
        />,
      )}
      {field(
        "Lançamento",
        <input
          className="rpgui-input w-full"
          type="date"
          value={form.releaseDate}
          onChange={(event) => onChange({ releaseDate: event.target.value })}
        />,
      )}
      {field(
        "Resumo",
        <textarea
          className="rpgui-input w-full"
          value={form.summary}
          onChange={(event) => onChange({ summary: event.target.value })}
          rows={3}
        />,
      )}
      {field(
        "Review",
        <textarea
          className="rpgui-input w-full"
          value={form.review}
          onChange={(event) => onChange({ review: event.target.value })}
          rows={3}
        />,
      )}
      <div className="flex gap-2">
        <button className="rpgui-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando…" : isEditing ? "Salvar" : "Criar jogo"}
        </button>
        {onCancel && (
          <button
            className="rpgui-button"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
