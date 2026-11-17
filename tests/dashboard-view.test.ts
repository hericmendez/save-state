import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAME_STATUSES } from "@/schemas/games";
import { getStatusLabel } from "@/features/games/status-labels";

const view = readFileSync("features/dashboard/dashboard.tsx", "utf8");
const insightsView = readFileSync("features/dashboard/library-insights.tsx", "utf8");

describe("personal statistics view contract", () => {
  it("renders four approved, semantically named modules", () => {
    for (const title of [
      "Status da biblioteca",
      "Distribuição de notas",
      "Mais horas registradas",
      "Mais conclusões registradas",
    ]) expect(view).toContain(title);
    expect((view.match(/<section /g) ?? [])).toHaveLength(4);
    expect(view).not.toContain("gênero mais");
    expect(view).not.toContain("plataforma mais");
  });

  it("renders the library discoveries section above the detailed modules", () => {
    expect(insightsView).toContain("Descobertas da biblioteca");
    expect(insightsView).toContain("Ainda não há descobertas suficientes");
    expect(insightsView).toContain("buildLibraryInsights");
    expect(view).toContain("<LibraryInsights stats={stats} />");
    expect(view.indexOf("<LibraryInsights")).toBeLessThan(
      view.indexOf('grid grid-cols-1 items-start'),
    );
  });

  it("labels all statuses and describes empty states", () => {
    expect(GAME_STATUSES).toHaveLength(10);
    for (const status of GAME_STATUSES) expect(getStatusLabel(status)).not.toBe(status);
    for (const emptyState of [
      "Sua biblioteca ainda está vazia.",
      "Nenhum jogo avaliado ainda.",
      "Nenhum registro disponível ainda.",
    ]) expect(view).toContain(emptyState);
  });

  it("uses the library total for status bars and keeps ratings on their own scale", () => {
    expect(view).toContain("const ratio = stats.totalGames > 0 ? count / stats.totalGames : 0");
    expect(view).toContain("ratio={ratio}");
    expect(view).not.toContain("ratio={count / max}");
    expect(view).not.toContain("const max = Math.max");
    // Rating distribution keeps its approved denominator (rated games).
    expect(view).toContain("count / maxRating");
  });

  it("enriches the modules with coverage, participation and contextual conclusions", () => {
    expect(view).toContain("Cobertura:");
    expect(view).toContain("jogos sem nota");
    expect(view).toContain("Distribuição das notas registradas");
    expect(view).toContain("Mostrar outros");
    expect(view).toContain("Total:");
    expect(view).toContain("Barras proporcionais ao total de horas registradas.");
    expect(view).toContain("participações exibidas não somam 100%");
    expect(view).toContain("sem conclusão registrada no contador");
    expect(view).toContain("permanece editável");
    expect(view).not.toContain("campos independentes");
  });

  it("keeps discovery titles balanced and responsive", () => {
    expect(insightsView).toContain("text-[0.85rem]");
    expect(insightsView).toContain("text-balance");
    expect(insightsView).toContain("break-words");
    expect(insightsView).toContain("items-start");
    expect(insightsView).toContain("sm:grid-cols-2");
    expect(insightsView).toContain("lg:grid-cols-3");
    expect(insightsView).not.toContain("truncate");
    expect(insightsView).toContain("<h3");
  });

  it("uses responsive single-to-two-column layout and text labels for chart data", () => {
    expect(view).toContain("grid-cols-1");
    expect(view).toContain("lg:grid-cols-2");
    expect(view).toContain('role="img"');
    expect(view).toContain("Nota {formatRating(rating)}/10");
  });
});
