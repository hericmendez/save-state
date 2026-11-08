import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  APP_URL: z.string().min(1, "APP_URL is required"),
  // Reserved for Phase 9 ATP BFF integration. Optional until then.
  ATP_BASE_URL: z.string().optional(),
  // Etapa 2 — engine-agnostic search. IGDB is the default provider;
  // ATP remains available as an alternative. Validated here (and only
  // here for SEARCH_METHOD) so no caller spreads process.env checks.
  SEARCH_METHOD: z.enum(["IGDB", "ATP"]).optional().default("IGDB"),
  // Twitch OAuth credentials for IGDB (Client ID doubles as IGDB
  // Client-ID header — no separate IGDB_CLIENT_ID variable).
  // Optional at boot so existing ATP-only dev setups keep working;
  // the IGDB provider validates them when actually selected.
  TWITCH_CLIENT_ID: z.string().trim().min(1).optional(),
  TWITCH_CLIENT_SECRET: z.string().trim().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

/**
 * Validate and return the server-only environment.
 * Never import this module (or values derived from it) into client code.
 * Pass a custom record in tests to avoid depending on process.env.
 */
export function loadServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  if (cachedEnv && source === process.env) return cachedEnv;
  const parsed = serverEnvSchema.safeParse({
    MONGODB_URI: source.MONGODB_URI,
    JWT_SECRET: source.JWT_SECRET,
    JWT_EXPIRES_IN: source.JWT_EXPIRES_IN,
    APP_URL: source.APP_URL,
    ATP_BASE_URL: source.ATP_BASE_URL,
    SEARCH_METHOD: source.SEARCH_METHOD,
    TWITCH_CLIENT_ID: source.TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET: source.TWITCH_CLIENT_SECRET,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  if (source === process.env) cachedEnv = parsed.data;
  return parsed.data;
}

/** Test-only hook: clear the cached environment between test cases. */
export function __resetServerEnvCache(): void {
  cachedEnv = undefined;
}
