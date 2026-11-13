import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as platforms } from "@/app/api/atp/platforms/route";
import { listAtpPlatforms } from "@/server/atp/client";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

// Module-level assignment (mirrors tests/atp/client.test.ts and the
// transitive import in tests/atp/bff.test.ts): must execute before
// startTestDatabase() → connectDatabase() → loadServerEnv() caches env.
process.env.ATP_BASE_URL = "http://atp.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PLATFORM_PAGE = {
  data: [
    {
      id: "nintendo-switch",
      name: "Nintendo Switch",
      company: "Nintendo",
      releaseYear: 2017,
      status: "active",
      family: "Nintendo",
      type: "handheld",
      thumb: { logo: "https://img.example/switch-logo.png", image: null },
      gameCount: 42,
    },
  ],
  pagination: { page: 2, limit: 10, total: 25, totalPages: 3 },
};

beforeAll(async () => {
  await startTestDatabase();
  process.env.ATP_BASE_URL = "http://atp.test";
});
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  process.env.ATP_BASE_URL = "http://atp.test";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const response = await login(postRequest("/api/auth/login", {
    email: TEST_USER.email,
    password: TEST_USER.password,
  }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

function authed(path: string, token: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `token=${token}` },
  });
}

describe("listAtpPlatforms", () => {
  it("builds the real ATP platforms URL with all parameters", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        seen.push(String(input));
        return jsonResponse(PLATFORM_PAGE);
      }),
    );
    const result = await listAtpPlatforms({
      companyName: "Nintendo",
      platformStatus: "active",
      page: 2,
      limit: 10,
      sort: "name",
      order: "desc",
    });
    expect(seen).toEqual([
      "http://atp.test/api/v1/platforms/summary?page=2&limit=10&companyName=Nintendo&platformStatus=active&sort=name&order=desc",
    ]);
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(25);
  });

  it("omits unset optional parameters", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        seen.push(String(input));
        return jsonResponse(PLATFORM_PAGE);
      }),
    );
    await listAtpPlatforms({ page: 1, limit: 20 });
    expect(seen).toEqual(["http://atp.test/api/v1/platforms/summary?page=1&limit=20"]);
  });
});

describe("GET /api/atp/platforms", () => {
  it("requires authentication", async () => {
    const response = await platforms(
      new NextRequest("http://localhost/api/atp/platforms"),
    );
    expect(response.status).toBe(401);
  });

  it("passes query and pagination through from ATP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        expect(String(input)).toContain("companyName=Nintendo");
        expect(String(input)).toContain("sort=gameCount");
        return jsonResponse(PLATFORM_PAGE);
      }),
    );
    const token = await tokenFor();
    const response = await platforms(
      authed("/api/atp/platforms?companyName=Nintendo&sort=gameCount&order=desc", token),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Nintendo Switch");
    // Canonical ATP thumb contract: object (nullable members), not string.
    expect(body.data[0].thumb).toEqual({
      logo: "https://img.example/switch-logo.png",
      image: null,
    });
    expect(body.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
  });

  it("rejects invalid sort fields with INVALID_QUERY", async () => {
    const token = await tokenFor();
    const response = await platforms(
      authed("/api/atp/platforms?sort=bogus", token),
    );
    expect(response.status).toBe(400);
  });

  it("rejects legacy string thumbs (canonical contract is the object)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: [{ ...PLATFORM_PAGE.data[0], thumb: "https://img.example/x.png" }],
          pagination: PLATFORM_PAGE.pagination,
        }),
      ),
    );
    const token = await tokenFor();
    const response = await platforms(authed("/api/atp/platforms", token));
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
  });
});
