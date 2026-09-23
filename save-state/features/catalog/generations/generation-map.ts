/**
 * Consoles / Generations — editorial configuration (Fase 8).
 *
 * SINGLE SOURCE of generation/console identity. No backend, no Mongo, no
 * ATP mutation: generations are a Save State editorial layer over the
 * catalog. Each console optionally maps onto ATP platform NAMES (the only
 * key the ATP games filter accepts — see server/atp/client.ts); a console
 * with an empty mapping is valid and renders an editorial state.
 *
 * Mapping names are best-effort (unverifiable without a live catalog):
 * unknown names degrade gracefully to "no games", never to errors.
 */

export interface EditorialConsole {
  /** Stable slug unique within its generation (e.g. "playstation-5"). */
  id: string;
  /** Editorial display name. */
  name: string;
  manufacturer: string;
  /**
   * ATP platform names for the games lookup (comma-joined into ONE BFF
   * call — never one request per console). Empty = no catalog mapping.
   */
  atpPlatforms: string[];
}

export interface EditorialGeneration {
  /** Stable slug (e.g. "gen-9"). */
  id: string;
  /** Display name (e.g. "Geração 9"). */
  name: string;
  shortName: string;
  /** Editorial order: HIGHER = more recent. UI renders 9 → 1. */
  order: number;
  /** One-line original description (no third-party content). */
  description: string;
  consoles: EditorialConsole[];
}

export const GENERATIONS: EditorialGeneration[] = [
  {
    id: "gen-9",
    name: "Geração 9",
    shortName: "Gen 9",
    order: 9,
    description: "A geração atual: SSDs, ray tracing e mundos sem loading.",
    consoles: [
      {
        id: "playstation-5",
        name: "PlayStation 5",
        manufacturer: "Sony",
        atpPlatforms: ["PlayStation 5"],
      },
      {
        id: "xbox-series",
        name: "Xbox Series X|S",
        manufacturer: "Microsoft",
        atpPlatforms: ["Xbox Series"],
      },
    ],
  },
  {
    id: "gen-8",
    name: "Geração 8",
    shortName: "Gen 8",
    order: 8,
    description: "O salto para o HD completo e os mundos abertos online.",
    consoles: [
      {
        id: "playstation-4",
        name: "PlayStation 4",
        manufacturer: "Sony",
        atpPlatforms: ["PlayStation 4"],
      },
      {
        id: "xbox-one",
        name: "Xbox One",
        manufacturer: "Microsoft",
        atpPlatforms: ["Xbox One"],
      },
      {
        id: "nintendo-switch",
        name: "Nintendo Switch",
        manufacturer: "Nintendo",
        atpPlatforms: ["Nintendo Switch"],
      },
      {
        id: "wii-u",
        name: "Wii U",
        manufacturer: "Nintendo",
        atpPlatforms: ["Wii U"],
      },
    ],
  },
  {
    id: "gen-7",
    name: "Geração 7",
    shortName: "Gen 7",
    order: 7,
    description: "Alta definição, controles por movimento e lojas digitais.",
    consoles: [
      {
        id: "playstation-3",
        name: "PlayStation 3",
        manufacturer: "Sony",
        atpPlatforms: ["PlayStation 3"],
      },
      {
        id: "xbox-360",
        name: "Xbox 360",
        manufacturer: "Microsoft",
        atpPlatforms: ["Xbox 360"],
      },
      {
        id: "wii",
        name: "Wii",
        manufacturer: "Nintendo",
        atpPlatforms: ["Wii"],
      },
    ],
  },
  {
    id: "gen-6",
    name: "Geração 6",
    shortName: "Gen 6",
    order: 6,
    description: "A era dos DVDs, do online nos consoles e dos 128 bits.",
    consoles: [
      {
        id: "playstation-2",
        name: "PlayStation 2",
        manufacturer: "Sony",
        atpPlatforms: ["PlayStation 2"],
      },
      {
        id: "xbox",
        name: "Xbox",
        manufacturer: "Microsoft",
        atpPlatforms: ["Xbox"],
      },
      {
        id: "gamecube",
        name: "GameCube",
        manufacturer: "Nintendo",
        atpPlatforms: ["GameCube"],
      },
      {
        id: "dreamcast",
        name: "Dreamcast",
        manufacturer: "Sega",
        atpPlatforms: ["Dreamcast"],
      },
    ],
  },
  {
    id: "gen-5",
    name: "Geração 5",
    shortName: "Gen 5",
    order: 5,
    description: "O 3D chega de verdade, com CDs e analógicos.",
    consoles: [
      {
        id: "playstation",
        name: "PlayStation",
        manufacturer: "Sony",
        atpPlatforms: ["PlayStation"],
      },
      {
        id: "nintendo-64",
        name: "Nintendo 64",
        manufacturer: "Nintendo",
        atpPlatforms: ["Nintendo 64"],
      },
      {
        id: "sega-saturn",
        name: "Sega Saturn",
        manufacturer: "Sega",
        atpPlatforms: ["Sega Saturn"],
      },
    ],
  },
  {
    id: "gen-4",
    name: "Geração 4",
    shortName: "Gen 4",
    order: 4,
    description: "A guerra dos 16 bits entre Nintendo e Sega.",
    consoles: [
      {
        id: "super-nintendo",
        name: "Super Nintendo",
        manufacturer: "Nintendo",
        atpPlatforms: ["Super Nintendo Entertainment System"],
      },
      {
        id: "mega-drive",
        name: "Mega Drive",
        manufacturer: "Sega",
        atpPlatforms: ["Sega Mega Drive"],
      },
    ],
  },
  {
    id: "gen-3",
    name: "Geração 3",
    shortName: "Gen 3",
    order: 3,
    description: "A retomada pós-crash, liderada pelos 8 bits.",
    consoles: [
      {
        id: "nes",
        name: "Nintendo Entertainment System",
        manufacturer: "Nintendo",
        atpPlatforms: ["Nintendo Entertainment System"],
      },
      {
        id: "master-system",
        name: "Master System",
        manufacturer: "Sega",
        atpPlatforms: ["Sega Master System"],
      },
      {
        id: "atari-7800",
        name: "Atari 7800",
        manufacturer: "Atari",
        atpPlatforms: ["Atari 7800"],
      },
    ],
  },
  {
    id: "gen-2",
    name: "Geração 2",
    shortName: "Gen 2",
    order: 2,
    description: "Cartuchos, joysticks e o boom — e o crash — do Atari.",
    consoles: [
      {
        id: "atari-2600",
        name: "Atari 2600",
        manufacturer: "Atari",
        atpPlatforms: [],
      },
      {
        id: "intellivision",
        name: "Intellivision",
        manufacturer: "Mattel",
        atpPlatforms: [],
      },
      {
        id: "colecovision",
        name: "ColecoVision",
        manufacturer: "Coleco",
        atpPlatforms: [],
      },
    ],
  },
  {
    id: "gen-1",
    name: "Geração 1",
    shortName: "Gen 1",
    order: 1,
    description: "O começo de tudo: Pong, Odyssey e os Telejogos.",
    consoles: [
      {
        id: "odyssey",
        name: "Magnavox Odyssey",
        manufacturer: "Magnavox",
        atpPlatforms: [],
      },
      {
        id: "telejogo",
        name: "Telejogo",
        manufacturer: "Philco/Ford",
        atpPlatforms: [],
      },
      {
        id: "pong",
        name: "Pong (arcade/dedicados)",
        manufacturer: "Atari",
        atpPlatforms: [],
      },
    ],
  },
];

/** Editorial order: most recent first (9 → 1). Never alphabetical. */
export function listGenerations(): EditorialGeneration[] {
  return [...GENERATIONS].sort((a, b) => b.order - a.order);
}

export function findGeneration(
  generationId: string,
): EditorialGeneration | undefined {
  return GENERATIONS.find((generation) => generation.id === generationId);
}

export function findConsole(
  generationId: string,
  consoleId: string,
): EditorialConsole | undefined {
  return findGeneration(generationId)?.consoles.find(
    (console) => console.id === consoleId,
  );
}

/**
 * Deduplicated ATP platform names for a generation, in console order.
 * ONE BFF call with the comma-joined value — never N requests.
 */
export function generationAtpPlatforms(
  generation: EditorialGeneration,
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const console of generation.consoles) {
    for (const name of console.atpPlatforms) {
      const trimmed = name.trim();
      if (trimmed !== "" && !seen.has(trimmed)) {
        seen.add(trimmed);
        names.push(trimmed);
      }
    }
  }
  return names;
}

export function generationHasAtpMapping(
  generation: EditorialGeneration,
): boolean {
  return generationAtpPlatforms(generation).length > 0;
}
