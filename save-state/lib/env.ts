import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  APP_URL: z.string().min(1, "APP_URL is required"),
  // Reserved for Phase 9 ATP BFF integration. Optional until then.
  ATP_BASE_URL: z.string().optional(),
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
    APP_URL: source.APP_URL,
    ATP_BASE_URL: source.ATP_BASE_URL,
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
