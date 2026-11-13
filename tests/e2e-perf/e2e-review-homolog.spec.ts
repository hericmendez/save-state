/**
 * Homologação funcional — Fase 2.1 do Review Editor Markdown.
 *
 * Ambiente: build de produção + MongoDB isolado (save-state-e2e).
 * Não toca no Atlas; dados descartáveis por execução.
 *
 * H1 persistência longa + reload + fechamento de guia.
 * H2 navegação durante gravação pendente.
 * H3 concorrência real em duas guias (ida e volta, resoluções explícitas).
 * H4 fidelidade Markdown (suportado + não suportado com aviso, sem descarte).
 * H5 segurança da prévia (javascript:/data:/HTML executável neutralizados).
 * H6 viewport mobile (toolbar, escrita, sem overflow).
 *
 * H7 (userGameId com review persistida no MongoDB) vive em
 * `e2e-review-homolog-replset.spec.ts` e só executa contra replica set.
 */
import { test, expect } from "@playwright/test";
import { createAuthenticatedE2EContext } from "./helpers";

const LONG_MD = `# Crônica de uma campanha longa

## Ato I — A chegada

Uma campanha **memorável**, com *reviravoltas* e momentos ~~descartáveis~~ que viraram lenda.

> "Os melhores jogos são aqueles que lembramos anos depois," disse o veterano.

### Lista de feitos

- Explorar o mapa inteiro
  - Masmorras opcionais
  - Chefes secretos
    - O chefe do lago
    - O chefe da torre
- Zerar sem usar poções
- Platinar em menos de 40 horas

1. Primeiro passo
2. Segundo passo
3. Terceiro passo com **ênfase** dentro

Código inline como \`ataque++\` e blocos com linguagem:

\`\`\`ts
function dano(base: number, crit: boolean): number {
  return crit ? base * 2 : base;
}
\`\`\`

---

Links com [formatação **ousada**](https://example.com/campanha) e imagem:

![mapa da campanha](https://example.com/mapa.png)

Quebra dura aqui.  
E continuação na linha seguinte.

Unicode: 日本語 🎮 café naïve — escapado: \\*literal\\* e \\[colchetes\\].

## Ato II — O confronto final

### Subseção profunda

#### Nível 4

##### Nível 5

###### Nível 6

Fim da crônica.`;

const UNSUPPORTED_MD = `| coluna a | coluna b |
|----------|----------|
| valor 1  | valor 2  |

- [ ] tarefa pendente
- [x] tarefa feita

Uma nota[^1] de rodapé.

[^1]: texto do rodapé.

<div class="aviso">bloco html</div>`;

async function freshUserContext(browser: any) {
  const context = await createAuthenticatedE2EContext(browser);
  const page = await context.newPage();
  return { context, page };
}

async function createDraftViaUI(page: any): Promise<void> {
  await page.goto("/reviews/editor");
  await page.getByRole("button", { name: /novo rascunho/i }).first().click();
  await expect(page.locator(".tiptap")).toBeVisible();
}

async function switchToMarkdown(page: any) {
  await page.getByRole("tab", { name: /markdown/i }).click();
  await expect(page.getByLabel(/markdown bruto/i)).toBeVisible();
}

test.describe("homologação 2.1 — persistência e recuperação", () => {
  test("H1: documento longo persiste após reload e fechamento da guia", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    await createDraftViaUI(page);
    await switchToMarkdown(page);
    await page.getByLabel(/markdown bruto/i).fill(LONG_MD);
    await expect(page.locator("body")).toContainText(/salvo neste dispositivo/i);

    // Reload: recuperar pelo link da lista (modo vazio abre recuperação).
    await page.reload();
    await page.getByRole("link", { name: /continuar escrevendo/i }).click();
    await switchToMarkdown(page);
    await expect(page.getByLabel(/markdown bruto/i)).toHaveValue(LONG_MD);

    // Fechamento da guia: nova página no MESMO contexto (mesmo IndexedDB).
    await page.close();
    const page2 = await context.newPage();
    await page2.goto("/reviews/editor");
    await page2.getByRole("link", { name: /continuar escrevendo/i }).click();
    await page2.getByRole("tab", { name: /markdown/i }).click();
    await expect(page2.getByLabel(/markdown bruto/i)).toHaveValue(LONG_MD);

    // Três modos sem perda.
    await page2.getByRole("tab", { name: /visual/i }).click();
    await expect(page2.locator(".tiptap")).toContainText("Crônica de uma campanha longa");
    await page2.getByRole("tab", { name: /prévia/i }).click();
    await expect(page2.locator("body")).toContainText("O chefe do lago");
    await page2.getByRole("tab", { name: /markdown/i }).click();
    const recovered = await page2.getByLabel(/markdown bruto/i).inputValue();
    for (const token of [
      "Crônica de uma campanha longa",
      "O chefe do lago",
      "https://example.com/mapa.png",
      "dano(base",
      "日本語 🎮",
    ]) {
      expect(recovered).toContain(token);
    }
    await context.close();
  });

  test("H2: navegação durante gravação pendente não perde conteúdo", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    await createDraftViaUI(page);
    await switchToMarkdown(page);
    await page.getByLabel(/markdown bruto/i).fill("rascunho-navegacao-pendente");
    // Navega ANTES do debounce (500 ms): flush via visibilitychange/pagehide.
    await page.getByRole("link", { name: /voltar ao save state/i }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/reviews/editor");
    await page.getByRole("link", { name: /continuar escrevendo/i }).click();
    await switchToMarkdown(page);
    await expect(page.getByLabel(/markdown bruto/i)).toHaveValue(
      "rascunho-navegacao-pendente",
    );
    await context.close();
  });
});

test.describe("homologação 2.1 — concorrência entre guias", () => {
  test("H3: conflito detectado, texto preservado, resolução explícita (ida e volta)", async ({
    browser,
  }) => {
    const { context, page: pageA } = await freshUserContext(browser);
    await createDraftViaUI(pageA);
    await switchToMarkdown(pageA);
    await pageA.getByLabel(/markdown bruto/i).fill("base-conflito");
    await expect(pageA.locator("body")).toContainText(/salvo neste dispositivo/i);
    const revText = await pageA.locator("body").innerText();
    const revMatch = /\(r(\d+)\)/.exec(revText);
    expect(revMatch).not.toBeNull();

    // Guia B abre o MESMO rascunho (mesmo IndexedDB, mesmo usuário):
    // a recuperação lista o rascunho com link direto ?draftId=.
    await pageA.getByRole("button", { name: /^rascunhos$/i }).click();
    const draftHref = await pageA
      .getByRole("link", { name: /continuar escrevendo/i })
      .first()
      .getAttribute("href");
    expect(draftHref).toContain("draftId=");
    const pageB = await context.newPage();
    await pageB.goto(draftHref!);
    await pageB.getByRole("tab", { name: /markdown/i }).click();
    await expect(pageB.getByLabel(/markdown bruto/i)).toHaveValue("base-conflito");
    // Mesma revisão nas duas guias.
    const revB = /\(r(\d+)\)/.exec(await pageB.locator("body").innerText());
    expect(revB?.[1]).toBe(revMatch?.[1]);

    // IDA: B suja primeiro (e portanto SALVA primeiro); A, que sujou em
    // seguida, tenta persistir com revisão stale e conflita. Nada é
    // sobrescrito silenciosamente: o texto de A é preservado no banner.
    await pageB.getByLabel(/markdown bruto/i).fill("base-conflito - B1");
    await pageA.getByLabel(/markdown bruto/i).fill("base-conflito - A1");
    // O conflito aparece na guia A (segunda a gravar), com o texto intacto.
    await expect(pageA.locator("body")).toContainText(/conflito entre versões/i);
    await expect(pageA.getByLabel(/markdown bruto/i)).toHaveValue(
      "base-conflito - A1",
    );

    // Resolução explícita: A descarta o texto e adota a versão salva (B1).
    await pageA
      .getByRole("button", { name: /descartar meu texto/i })
      .click();
    await expect(pageA.getByLabel(/markdown bruto/i)).toHaveValue(
      "base-conflito - B1",
    );
    await expect(pageA.locator("body")).not.toContainText(/conflito entre versões/i);

    // VOLTA: A suja primeiro (salva primeiro); B conflita e FORÇA a versão.
    await pageA.getByLabel(/markdown bruto/i).fill("base-conflito - B1 - A2");
    await pageB.getByLabel(/markdown bruto/i).fill("base-conflito - B1 - B2");
    await expect(pageB.locator("body")).toContainText(/conflito entre versões/i);
    await expect(pageB.getByLabel(/markdown bruto/i)).toHaveValue(
      "base-conflito - B1 - B2",
    );
    await pageB
      .getByRole("button", { name: /manter meu texto e sobrescrever/i })
      .click();
    await expect(pageB.locator("body")).not.toContainText(/conflito entre versões/i);
    // A recebe aviso de versão mais recente e pode carregar (sem troca silenciosa).
    await expect(pageA.locator("body")).toContainText(/versão mais recente/i);
    await pageA
      .getByRole("button", { name: /carregar versão mais recente/i })
      .click();
    await expect(pageA.getByLabel(/markdown bruto/i)).toHaveValue(
      "base-conflito - B1 - B2",
    );
    await context.close();
  });
});

test.describe("homologação 2.1 — fidelidade e segurança", () => {
  test("H4: suportado preserva semântica; não suportado avisa e não some", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    await createDraftViaUI(page);
    await switchToMarkdown(page);
    await page.getByLabel(/markdown bruto/i).fill(`${LONG_MD}\n\n${UNSUPPORTED_MD}`);
    // Aviso de incompatibilidade no modo Markdown.
    await expect(page.locator("body")).toContainText(/pode normalizar/i);

    const before = await page.getByLabel(/markdown bruto/i).inputValue();
    await page.getByRole("tab", { name: /visual/i }).click();
    await expect(page.locator(".tiptap")).toContainText("Crônica de uma campanha longa");
    await page.getByRole("tab", { name: /markdown/i }).click();
    const after = await page.getByLabel(/markdown bruto/i).inputValue();
    for (const token of [
      "Crônica de uma campanha longa",
      "O chefe do lago",
      "https://example.com/mapa.png",
      "日本語 🎮",
    ]) {
      expect(after).toContain(token);
    }
    // Conteúdo não suportado: a estrutura normaliza (tabelas viram
    // parágrafos "a | b", task-lists perdem a caixa, notas/HTML viram
    // texto), mas NENHUM texto pode sumir — o aviso prévio cobre o "não
    // silencioso" e o fallback cobre o "não descartar".
    for (const token of [
      "valor 1",
      "valor 2",
      "tarefa pendente",
      "rodapé",
      "bloco html",
    ]) {
      expect(after).toContain(token);
    }
    expect(before).toContain("valor 1");
    await context.close();
  });

  test("H5: prévia neutraliza javascript:, data: e HTML executável", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    const dialogs: string[] = [];
    page.on("dialog", (d: { message(): string }) => {
      dialogs.push(d.message());
    });
    await createDraftViaUI(page);
    await switchToMarkdown(page);
    await page.getByLabel(/markdown bruto/i).fill(
      [
        "[clique](javascript:alert(1))",
        "![evil](data:text/html,<h1>x</h1>)",
        "[ok](https://example.com/seguro)",
        "<script>window.__xss=1</script>",
        '<img src="x" onerror="window.__xss=2">',
      ].join("\n\n"),
    );
    await page.getByRole("tab", { name: /prévia/i }).click();
    await expect(page.locator(".review-prose")).toBeVisible();
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(await page.locator(".review-prose script").count()).toBe(0);
    expect(await page.locator(".review-prose img").count()).toBe(0);
    const okHref = await page
      .locator('.review-prose a:has-text("ok")')
      .getAttribute("href");
    expect(okHref).toBe("https://example.com/seguro");
    // Alt da imagem perigosa vira texto (sem perda silenciosa), sem onerror.
    await expect(page.locator(".review-prose")).toContainText("evil");
    expect(await page.locator(".review-prose [onerror]").count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
    await context.close();
  });
});

test.describe("homologação 2.1 — mobile", () => {
  test("H6: viewport mobile usa o editor sem overflow nem perda", async ({
    browser,
  }) => {
    const { context, page } = await freshUserContext(browser);
    await page.setViewportSize({ width: 390, height: 844 });
    await createDraftViaUI(page);
    await switchToMarkdown(page);
    const payload = LONG_MD.slice(0, 1500);
    await page.getByLabel(/markdown bruto/i).fill(payload);
    await expect(page.locator("body")).toContainText(/salvo neste dispositivo/i);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("tab", { name: /prévia/i }).click();
    await expect(page.locator("body")).toContainText("Crônica de uma campanha");
    await page.getByRole("tab", { name: /markdown/i }).click();
    const value = await page.getByLabel(/markdown bruto/i).inputValue();
    expect(value).toBe(payload);
    await context.close();
  });
});
