import { vi } from "vitest";

// `server-only` is a bundler-time boundary guard that throws when imported
// outside React Server Component transforms. Under vitest (plain Node
// ESM, no Next transform) every test file counts as server-side, so the
// guard is stubbed to a no-op here. Production bundles keep the real guard.
vi.mock("server-only", () => ({}));
