/**
 * Regressão: catálogo por plataforma não carregava na navegação client-side.
 *
 * Causa raiz (features/atp/catalog-search.tsx):
 *  1. `useState(seededQuery)` consumia as props de contexto fixo
 *     (`fixedPlatforms`/`fixedPlatformIds`) só no primeiro mount. Nenhum
 *     efeito observava `fixed.*` ou o pathname; o único resync pós-mount
 *     era keyed em `[searchParams]` — que não contém o pathname. Trocar
 *     /catalog/platforms/a → /catalog/platforms/b reutiliza a instância
 *     (mesmo segmento dinâmico), então nada refazia a busca: a UI mantinha
 *     os jogos da plataforma anterior (ou o vazio) até o F5.
 *  2. Em dev (StrictMode), o cleanup de unmount abortava o primeiro fetch
 *     e o efeito de mount não refazia (firstLoad já consumido).
 *  3. `commitQuery` executava efeitos colaterais dentro do updater do
 *     setQuery — double-invocado pelo StrictMode, disparava a busca 2x.
 *
 * Estes testes montam o componente real sob StrictMode (como no dev) com
 * `next/navigation` e `/api/search` mockados, e cobrem: primeira navegação,
 * acesso direto/remount (F5), troca entre plataformas, troca com filtros
 * ativos e respostas fora de ordem.
 */

// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";

// ---- next/* mocks -------------------------------------------------------
// useSearchParams retorna um snapshot ESTÁVEL (como o Next real, que
// memoiza por query string): nova identidade a cada render mascararia o
// defeito — o efeito de searchParams passaria a re-executar em qualquer
// re-render, inclusive na troca de plataforma.
let mockPathname = "/catalog/platforms/plataforma-a";
const mockSearchParams = new URLSearchParams("");
const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src?: string; alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} />
  ),
}));

// ---- api-client mock (respeita AbortSignal como o fetch real) ------------
function abortError() {
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
}

type Resolver = (value: unknown) => void;
const searchCalls: string[] = [];
let searchResolvers: Resolver[] = [];

vi.mock("@/lib/api-client", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  apiRequest: (path: string, init?: { signal?: AbortSignal }) =>
    new Promise((resolve, reject) => {
      searchCalls.push(path);
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const onAbort = () => reject(abortError());
      signal?.addEventListener("abort", onAbort, { once: true });
      searchResolvers.push((value: unknown) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      });
    }),
}));

import { CatalogSearch } from "@/features/atp/catalog-search";
import type { AtpSearchPage } from "@/features/atp/atp-result";

function pageFor(names: string[]): AtpSearchPage {
  return {
    data: names.map((name) => ({
      atpId: `atp-${name}`,
      name,
      year: 2000,
      platforms: [],
      genres: [],
      owned: false,
      coverUrl: null,
    })),
    pagination: {
      page: 1,
      limit: 20,
      total: names.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

async function resolveLatest(page: AtpSearchPage) {
  const resolver = searchResolvers[searchResolvers.length - 1];
  if (!resolver) throw new Error("no pending search request");
  await act(async () => {
    resolver(page);
  });
}

async function waitForSearchCall(
  predicate: (call: string) => boolean,
): Promise<string> {
  let found: string | undefined;
  await waitFor(() => {
    found = searchCalls.find(predicate);
    if (!found) throw new Error("waiting for search call");
  });
  return found as string;
}

function renderPlatform(
  platform: "Plataforma A" | "Plataforma B",
  ids: number[],
) {
  return render(
    <StrictMode>
      <CatalogSearch
        fixedPlatforms={[platform]}
        fixedPlatformIds={ids}
        initialContextName={platform}
      />
    </StrictMode>,
  );
}

beforeEach(() => {
  searchCalls.length = 0;
  searchResolvers = [];
  mockReplace.mockClear();
  mockPush.mockClear();
  mockPathname = "/catalog/platforms/plataforma-a";
});

afterEach(() => {
  cleanup();
});

describe("catalog platform navigation", () => {
  it("primeira navegação client-side: busca dispara e renderiza os jogos", async () => {
    renderPlatform("Plataforma A", [100]);

    const first = await waitForSearchCall((call) =>
      call.includes("platform=Plataforma+A"),
    );
    expect(first).toContain("platformIds=100");
    await resolveLatest(pageFor(["Jogo A1", "Jogo A2"]));
    await screen.findByText("Jogo A1");
    await screen.findByText("Jogo A2");
  });

  it("acesso direto à URL e F5 (remount): busca dispara com o contexto da rota", async () => {
    mockPathname = "/catalog/platforms/plataforma-b";
    const first = renderPlatform("Plataforma B", [200]);
    await waitForSearchCall((call) =>
      call.includes("platform=Plataforma+B"),
    );
    await resolveLatest(pageFor(["Jogo B1"]));
    await screen.findByText("Jogo B1");

    // F5 = remount completo com o mesmo contexto: refaz a busca do zero.
    first.unmount();
    searchCalls.length = 0;
    searchResolvers = [];
    renderPlatform("Plataforma B", [200]);
    const reloaded = await waitForSearchCall((call) =>
      call.includes("platform=Plataforma+B"),
    );
    expect(reloaded).toContain("platformIds=200");
    await resolveLatest(pageFor(["Jogo B1"]));
    await screen.findByText("Jogo B1");
  });

  it("troca entre plataformas na mesma instância: refaz a busca e atualiza a UI", async () => {
    const { rerender } = renderPlatform("Plataforma A", [100]);
    await waitForSearchCall((call) =>
      call.includes("platform=Plataforma+A"),
    );
    await resolveLatest(pageFor(["Jogo A1"]));
    await screen.findByText("Jogo A1");
    const replaceBeforeSwitch = mockReplace.mock.calls.length;

    mockPathname = "/catalog/platforms/plataforma-b";
    rerender(
      <StrictMode>
        <CatalogSearch
          fixedPlatforms={["Plataforma B"]}
          fixedPlatformIds={[200]}
          initialContextName="Plataforma B"
        />
      </StrictMode>,
    );

    const switched = await waitForSearchCall((call) =>
      call.includes("platform=Plataforma+B"),
    );
    expect(switched).toContain("platformIds=200");
    // A URL acompanha o novo contexto (sem reload forçado).
    expect(mockReplace.mock.calls.length).toBeGreaterThan(replaceBeforeSwitch);
    await resolveLatest(pageFor(["Jogo B1"]));
    await screen.findByText("Jogo B1");
    expect(screen.queryByText("Jogo A1")).toBeNull();
  });

  it("troca de plataforma com filtros ativos: preserva o filtro e reseta a página", async () => {
    const { rerender } = renderPlatform("Plataforma A", [100]);
    await waitForSearchCall((call) =>
      call.includes("platform=Plataforma+A"),
    );
    await resolveLatest(pageFor(["Jogo A1"]));
    await screen.findByText("Jogo A1");

    fireEvent.change(screen.getByLabelText("Inicial do jogo"), {
      target: { value: "M" },
    });
    await waitForSearchCall((call) => call.includes("initial=M"));
    // Uma única requisição para a troca de inicial (sem duplicadas).
    expect(
      searchCalls.filter((call) => call.includes("initial=M")),
    ).toHaveLength(1);
    await resolveLatest(pageFor(["Mario-like"]));
    await screen.findByText("Mario-like");

    mockPathname = "/catalog/platforms/plataforma-b";
    rerender(
      <StrictMode>
        <CatalogSearch
          fixedPlatforms={["Plataforma B"]}
          fixedPlatformIds={[200]}
          initialContextName="Plataforma B"
        />
      </StrictMode>,
    );

    const switched = await waitForSearchCall(
      (call) =>
        call.includes("platform=Plataforma+B") && call.includes("initial=M"),
    );
    expect(switched).toContain("platformIds=200");
    // Página reseta: o BFF recebe page=1 (nunca a página antiga).
    expect(switched).toMatch(/[?&]page=1(&|$)/);
    await resolveLatest(pageFor(["Metroid-like"]));
    await screen.findByText("Metroid-like");
    expect(screen.queryByText("Mario-like")).toBeNull();
  });

  it("respostas fora de ordem: a busca mais recente vence", async () => {
    const { rerender } = renderPlatform("Plataforma A", [100]);
    await waitForSearchCall((call) =>
      call.includes("platform=Plataforma+A"),
    );

    // A resposta antiga resolve ANTES da troca ser processada (o abort
    // chega tarde): o guard de requestId deve descartá-la.
    await resolveLatest(pageFor(["Jogo A1"]));
    mockPathname = "/catalog/platforms/plataforma-b";
    rerender(
      <StrictMode>
        <CatalogSearch
          fixedPlatforms={["Plataforma B"]}
          fixedPlatformIds={[200]}
          initialContextName="Plataforma B"
        />
      </StrictMode>,
    );
    await waitForSearchCall((call) =>
      call.includes("platform=Plataforma+B"),
    );
    await resolveLatest(pageFor(["Jogo B1"]));

    await screen.findByText("Jogo B1");
    expect(screen.queryByText("Jogo A1")).toBeNull();
  });
});
