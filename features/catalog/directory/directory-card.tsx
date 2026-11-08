import Link from "next/link";
import type { DirectoryEntry, DirectoryStatus } from "./types";

const STATUS_LABEL: Record<DirectoryStatus, string> = {
  active: "Ativa",
  discontinued: "Descontinuada",
};

/**
 * Generic directory card: links to the entry detail, shows image or a
 * text placeholder, and always pairs the status dot with a text label
 * (status never depends on color alone).
 */
export function DirectoryCard({
  entry,
  href,
  subtitle,
}: {
  entry: DirectoryEntry;
  href: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="rpgui-container framed-golden flex flex-col p-4"
      aria-label={
        entry.status
          ? `${entry.name} — ${STATUS_LABEL[entry.status]}`
          : entry.name
      }
    >
      {entry.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.image}
          alt=""
          aria-hidden="true"
          className="mx-auto h-24 w-auto max-w-full object-contain"
          loading="lazy"
        />
      ) : (
        <div
          className="rpgui-container framed-grey mx-auto flex h-24 w-24 items-center justify-center"
          aria-hidden="true"
        >
          <span className="font-display text-2xl">
            {entry.name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <h2 className="font-display mt-3 text-center text-lg">{entry.name}</h2>
      {subtitle && <p className="text-center text-sm">{subtitle}</p>}
      {entry.status && (
        <p className="mt-1 text-center text-sm">
          <span aria-hidden="true">
            {entry.status === "active" ? "● " : "○ "}
          </span>
          {STATUS_LABEL[entry.status]}
        </p>
      )}
    </Link>
  );
}
