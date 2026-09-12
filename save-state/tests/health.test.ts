import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("responds without authentication", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("returns a minimal deterministic body", async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
