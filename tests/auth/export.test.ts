/**
 * Fase 9B — export API coverage gap: the routes had real UI usage
 * (settings export buttons) but no dedicated tests.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as exportJson } from "@/app/api/auth/export/route";
import { GET as exportCsv } from "@/app/api/auth/export/csv/route";
import { exportToCsv, type ExportPayload } from "@/server/export/service";
import {
  TEST_USER,
  clearDatabase,
  markTestUserVerified,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const response = await login(
    postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
  );
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

function authed(path: string, token: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `token=${token}` },
  });
}

/** Small independent RFC-4180-style reader for validating actual cell values. */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

describe("GET /api/auth/export", () => {
  it("requires authentication", async () => {
    const response = await exportJson(
      new NextRequest("http://localhost/api/auth/export"),
    );
    expect(response.status).toBe(401);
  });

  it("returns the caller payload as a JSON attachment", async () => {
    const token = await tokenFor();
    const response = await exportJson(authed("/api/auth/export", token));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toContain(
      "attachment",
    );
    const body = await response.json();
    expect(body.user.email).toBe(TEST_USER.email);
    expect(typeof body.exportedAt).toBe("string");
    expect(Array.isArray(body.games)).toBe(true);
    expect(Array.isArray(body.collections)).toBe(true);
  });

  it("exports collections with collectionIds (new format)", async () => {
    const token = await tokenFor();
    const authedPost = (path: string, body: unknown) =>
      new NextRequest(`http://localhost${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `token=${token}`,
        },
        body: JSON.stringify(body),
      });
    const { POST: createGame } = await import("@/app/api/games/route");
    const gameId = (
      (await (
        await createGame(authedPost("/api/games", { game: { name: "Export Me" } }))
      ).json()) as { data: { _id: string } }
    ).data._id;
    const { POST: createCollection } = await import(
      "@/app/api/game-collections/route"
    );
    const created = await createCollection(
      authedPost("/api/game-collections", { name: "Exportados" }),
    );
    expect(created.status).toBe(201);
    const collectionId = ((await created.json()) as { data: { _id: string } }).data._id;
    const { POST: attach } = await import(
      "@/app/api/games/[gameId]/collections/[collectionId]/route"
    );
    const attached = await attach(
      authedPost(
        `/api/games/${gameId}/collections/${collectionId}`,
        {},
      ),
      { params: Promise.resolve({ gameId, collectionId }) },
    );
    expect(attached.status).toBe(204);

    const response = await exportJson(authed("/api/auth/export", token));
    const body = await response.json();
    expect(body.collections).toEqual([{ id: collectionId, name: "Exportados" }]);
    expect(body.games).toHaveLength(1);
    expect(body.games[0].collectionIds).toEqual([collectionId]);
    expect(body.games[0]).not.toHaveProperty("listIds");
  });
});

describe("GET /api/auth/export/csv", () => {
  it("requires authentication", async () => {
    const response = await exportCsv(
      new NextRequest("http://localhost/api/auth/export/csv"),
    );
    expect(response.status).toBe(401);
  });

  it("returns CSV with the expected content type", async () => {
    const token = await tokenFor();
    const response = await exportCsv(authed("/api/auth/export/csv", token));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    const text = await response.text();
    expect(text.split("\n")[0]).toContain("userId");
    expect(text.split("\n")[0]).toContain("collectionIds");
    expect(text.split("\n")[0]).not.toContain("listIds");
  });

  it("neutralizes formula-like strings while preserving CSV cells and legitimate data", () => {
    const values = [
      "=1+1",
      "+SUM(1,2)",
      "-1+2",
      "@SUM(A1:A2)",
      "  =1+1",
      "\t=1+1",
      "\r=1+1",
      "\n=1+1",
      "\u2003=1+1",
      "\u0085=1+1",
      "Texto normal",
      "Jogo, com vírgula",
      'Texto "entre aspas"',
      "Texto com quebra\nde linha",
      "",
      "日本語 🎮",
      "'=já textual",
      "\n=1+1\ntexto",
    ];
    const payload: ExportPayload = {
      exportedAt: "2026-11-11T00:00:00.000Z",
      user: { id: "u1", name: "Pessoa, Normal", email: "person@example.test" },
      games: values.map((value, index) => ({
        id: `g${index}`,
        game: { name: value },
        status: "backlog",
        hoursPlayed: index === 2 ? -1 : index,
        timesFinished: 0,
        finished: false,
        favorite: false,
        fullyCompleted: false,
        achievements: false,
        achievementProgress: null,
        achievementsCompleted: false,
        rating: null,
        review: value,
        collectionIds: [],
      })),
      collections: [],
    };

    const rows = parseCsv(exportToCsv(payload));
    const headers = rows[0];
    const gameNameIndex = headers.indexOf("gameName");
    const reviewIndex = headers.indexOf("review");
    const hoursIndex = headers.indexOf("hoursPlayed");

    expect(rows).toHaveLength(values.length + 1);
    values.forEach((value, index) => {
      const expected = /^[\s\u0000-\u001f\u007f-\u009f\ufeff]*[=+\-@]/.test(value)
        ? `'${value}`
        : value;
      expect(rows[index + 1][gameNameIndex]).toBe(expected);
      expect(rows[index + 1][reviewIndex]).toBe(expected);
      expect(rows[index + 1]).toHaveLength(headers.length);
    });
    // Negative numeric primitives remain numeric; strings that look like
    // formulas are neutralized in text columns only.
    expect(rows[3][hoursIndex]).toBe("-1");
    expect(rows[1][headers.indexOf("userName")]).toBe("Pessoa, Normal");
    expect(rows[1][headers.indexOf("gameId")]).toBe("g0");
  });

  it("exports reviews from GameReview (single source) with CSV-safe quoting", async () => {
    const token = await tokenFor();
    const authedPost = (path: string, body: unknown) =>
      new NextRequest(`http://localhost${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `token=${token}`,
        },
        body: JSON.stringify(body),
      });
    const { POST: createGame } = await import("@/app/api/games/route");
    const plain = (
      (await (
        await createGame(authedPost("/api/games", { game: { name: "Sem Review" } }))
      ).json()) as { data: { _id: string } }
    ).data._id;
    const markdown = '# Jogo "incrível", sim\n\nNota: 10/10 —日本語 🎮';
    const withReview = (
      (await (
        await createGame(
          authedPost("/api/games", {
            game: { name: "Com Review" },
            status: "finished",
            review: { content: markdown },
          }),
        )
      ).json()) as { data: { _id: string } }
    ).data._id;
    const injectedGameResponse = await createGame(
      authedPost("/api/games", {
        game: { name: "=1+1" },
        status: "finished",
        review: { content: "=HYPERLINK(\"https://example.test\")" },
      }),
    );
    expect(injectedGameResponse.status).toBe(201);
    const injectedGameId = ((await injectedGameResponse.json()) as {
      data: { _id: string };
    }).data._id;
    expect(plain).toBeTruthy();
    expect(withReview).toBeTruthy();
    expect(injectedGameId).toBeTruthy();

    const response = await exportCsv(authed("/api/auth/export/csv", token));
    expect(response.status).toBe(200);
    const text = await response.text();
    const rows = parseCsv(text);
    const header = rows[0];
    expect(header).toContain("review");
    // Com review: conteúdo completo entre aspas (multiline, vírgulas,
    // aspas duplicadas e unicode preservados, sem N+1 na origem).
    expect(text).toContain('"# Jogo ""incrível"", sim');
    expect(text).toContain("日本語 🎮");
    const gameNameIndex = header.indexOf("gameName");
    const reviewIndex = header.indexOf("review");
    const gameIdIndex = header.indexOf("gameId");
    const injectedRow = rows.find((row) => row[gameIdIndex] === injectedGameId);
    expect(injectedRow?.[gameNameIndex]).toBe("'=1+1");
    expect(injectedRow?.[reviewIndex]).toBe("'=HYPERLINK(\"https://example.test\")");
    expect(injectedRow).toHaveLength(header.length);

    // CSV-only neutralization: the JSON contract returns the original content.
    const jsonResponse = await exportJson(authed("/api/auth/export", token));
    const jsonPayload = await jsonResponse.json();
    const jsonGame = jsonPayload.games.find(
      (game: { id: string }) => game.id === injectedGameId,
    );
    expect(jsonGame.game.name).toBe("=1+1");
    expect(jsonGame.review).toBe("=HYPERLINK(\"https://example.test\")");
    // Sem review: célula vazia (nunca o espelho legado, nunca "undefined").
    expect(text).not.toContain("undefined");
    const semReviewBlock = text.slice(text.indexOf("Sem Review"));
    expect(semReviewBlock).toBeTruthy();
  });
});
