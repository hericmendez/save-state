import Link from "next/link";
import type { AtpPlatform } from "@/server/atp/schemas";

export function PlatformCard({ platform }: { platform: AtpPlatform }) {
  const logo = platform.thumb?.logo ?? platform.thumb?.image ?? null;
  const href = `/catalog/platforms/${encodeURIComponent(platform.id)}`;

  return (
    <Link
      href={href}
      className="rpgui-container framed-golden flex flex-col items-center p-3 text-center hover:opacity-90"
      aria-label={platform.name}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          className="mx-auto h-16 w-auto max-w-full object-contain"
          loading="lazy"
        />
      ) : (
        <div
          className="rpgui-container framed-grey mx-auto flex h-16 w-16 items-center justify-center"
          aria-hidden="true"
        >
          <span className="font-display text-xl">
            {platform.name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <span className="font-display mt-2 text-sm leading-tight">{platform.name}</span>
      <span className="mt-1 text-xs opacity-70">
        {platform.gameCount} {platform.gameCount === 1 ? "jogo" : "jogos"}
      </span>
    </Link>
  );
}

export function ConsoleCard({
  name,
  href,
}: {
  name: string;
  href?: string;
}) {
  const content = (
    <>
      <div
        className="rpgui-container framed-grey mx-auto flex h-16 w-16 items-center justify-center"
        aria-hidden="true"
      >
        <span className="font-display text-xl">{name.charAt(0).toUpperCase()}</span>
      </div>
      <span className="font-display mt-2 text-sm leading-tight text-center">{name}</span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rpgui-container framed-golden flex flex-col items-center p-3 hover:opacity-90"
        aria-label={name}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rpgui-container framed-golden flex flex-col items-center p-3">
      {content}
    </div>
  );
}
