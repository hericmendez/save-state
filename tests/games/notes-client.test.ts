import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import {
  NOTES_MAX_LENGTH,
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from "@/features/games/notes";
import { NOTE_CONTENT_MAX_LENGTH } from "@/schemas/notes";

interface SeenRequest {
  path: string;
  init?: { method?: string; body?: unknown };
}

let seen: SeenRequest[] = [];

function mockFetchOnce(status: number, body: unknown): void {
  (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      seen.push({ path: path as string, init });
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
      };
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  seen = [];
});

describe("notes client contract", () => {
  it("shares the backend max length", () => {
    expect(NOTES_MAX_LENGTH).toBe(NOTE_CONTENT_MAX_LENGTH);
    expect(NOTES_MAX_LENGTH).toBe(20000);
  });

  it("lists notes with the page query and passes pagination through", async () => {
    const page = {
      data: [
        {
          _id: "n1",
          content: "hello",
          createdAt: "2026-09-21T12:00:00.000Z",
          updatedAt: "2026-09-21T12:00:00.000Z",
        },
      ],
      pagination: {
        page: 2,
        limit: 20,
        total: 21,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    };
    mockFetchOnce(200, page);
    const result = await listNotes("game1", 2);
    expect(seen[0].path).toBe("/api/games/game1/notes?page=2");
    expect(result).toEqual(page);
  });

  it("creates with POST and trims whitespace", async () => {
    mockFetchOnce(201, { data: { _id: "n1" } });
    await createNote("game1", "  hello  ");
    expect(seen[0].path).toBe("/api/games/game1/notes");
    expect(seen[0].init?.method).toBe("POST");
    expect(JSON.parse(seen[0].init?.body as string)).toEqual({
      content: "hello",
    });
  });

  it("edits with PATCH and trims whitespace", async () => {
    mockFetchOnce(200, { data: { _id: "n1" } });
    await updateNote("game1", "note9", "  edited  ");
    expect(seen[0].path).toBe("/api/games/game1/notes/note9");
    expect(seen[0].init?.method).toBe("PATCH");
    expect(JSON.parse(seen[0].init?.body as string)).toEqual({
      content: "edited",
    });
  });

  it("deletes with DELETE and resolves on 204", async () => {
    mockFetchOnce(204, null);
    await expect(deleteNote("game1", "note9")).resolves.toBeUndefined();
    expect(seen[0].path).toBe("/api/games/game1/notes/note9");
    expect(seen[0].init?.method).toBe("DELETE");
  });

  it("surfaces backend errors through ApiRequestError", async () => {
    mockFetchOnce(404, {
      error: { code: "NOTE_NOT_FOUND", message: "Note not found" },
    });
    const error = await listNotes("game1", 1).catch((e) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(404);
    expect((error as ApiRequestError).message).toBe("Note not found");
  });

  it("encodes ids in paths", async () => {
    mockFetchOnce(204, null);
    await deleteNote("a/b", "c?d");
    expect(seen[0].path).toBe("/api/games/a%2Fb/notes/c%3Fd");
  });
});
