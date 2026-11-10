import { describe, expect, it } from "vitest";
import { toPlainGame } from "@/features/games/mappers";

function rawGame(game: unknown) {
  return { _id: "68f1a2b3c4d5e6f708192a3b", game };
}

describe("toPlainGame cover passthrough", () => {
  it("preserves a cover URL for the details modal", () => {
    const plain = toPlainGame(
      rawGame({ name: "Chrono Trigger", cover: "https://img.example/c.jpg" }),
    );
    expect(plain.game?.cover).toBe("https://img.example/c.jpg");
  });

  it("maps null cover to undefined (modal renders nothing)", () => {
    const plain = toPlainGame(rawGame({ name: "No Cover", cover: null }));
    expect(plain.game?.cover).toBeUndefined();
  });

  it("maps a missing cover key to undefined", () => {
    const plain = toPlainGame(rawGame({ name: "No Cover" }));
    expect(plain.game?.cover).toBeUndefined();
  });
});

describe("toPlainGame review excerpt passthrough (Phase 3)", () => {
  it("carries the server excerpt to the edit form without full fetch", () => {
    const plain = toPlainGame({
      _id: "68f1a2b3c4d5e6f708192a3b",
      reviewExcerpt: "prévia do texto",
      game: { name: "Jogo" },
    });
    expect(plain.reviewExcerpt).toBe("prévia do texto");
  });

  it("maps missing excerpt to undefined", () => {
    const plain = toPlainGame(
      rawGame({ name: "Jogo", cover: null }),
    );
    expect(plain.reviewExcerpt).toBeUndefined();
  });
});
