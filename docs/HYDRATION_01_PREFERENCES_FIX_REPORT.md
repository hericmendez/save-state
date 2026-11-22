# HYDRATION-01 — Correção local do mismatch de preferências

**Data:** 21 de novembro de 2026
**Estado:** implementado e validado localmente; aguardando revisão
**Publicação:** nenhuma — sem commit, push ou deploy

## 1. Causa e critérios

O HTML SSR não declara `data-layout-mode`, `data-font-display`,
`data-font-display-explicit`, `data-font-body` nem `data-grid-density`.
Antes do primeiro paint, `LAYOUT_INIT_SCRIPT` lia `save-state-ui` e gravava
esses cinco atributos em `<html>`. React 19 hidratava uma raiz diferente da
recebida do servidor e emitia o aviso de mismatch.

A correção precisava manter a leitura síncrona das preferências, o primeiro
paint correto e a compatibilidade com valores/defaults existentes, sem
suprimir o aviso, atrasar estilos até `useEffect` ou remover SSR.

## 2. Alternativas comparadas

| Alternativa | Avaliação |
|---|---|
| `suppressHydrationWarning` | Esconde o diagnóstico sem fazer SSR e cliente coincidirem; atributos divergentes também podem permanecer sem reconciliação. Rejeitada. |
| Aplicar preferências em `useEffect` | Hidratação inicial coincidiria, mas a preferência só chegaria depois do paint, causando flash de layout/fonte. Rejeitada. |
| Transportar preferências em cookie e renderizar no servidor | Dá ao SSR o estado, mas exige sincronizar/migrar o contrato atual de `localStorage`; não recupera por si só saves legados já existentes. Mais superfície e mudança de persistência sem necessidade. Rejeitada para este escopo. |
| Manter `data-*` fora do React ou remover SSR | Não elimina a divergência da raiz ou viola o requisito de SSR. Rejeitada. |
| **CSSOM em stylesheet vazio renderizado pelo servidor** | O bootstrap síncrono instala as regras antes do paint sem modificar atributos, filhos ou texto DOM hidratados. Mantém localStorage, valores, defaults e SSR. **Escolhida.** |

## 3. Implementação

- `app/layout.tsx` agora renderiza `<style id="save-state-preference-styles" />`
  antes do script síncrono no `<head>`. O stylesheet existe no HTML do servidor
  e seu conteúdo textual continua vazio durante a hidratação.
- `features/shared/layout-mode.ts` centraliza a resolução validada do snapshot
  e instala as regras por CSSOM: variáveis de geometria, fonte display/corpo,
  escala tipográfica, densidade do grid e a escolha explícita de fonte mobile.
  A mesma lógica de resolução e aplicação é serializada para o bootstrap,
  evitando dois parsers independentes.
- `app/globals.css` consome as variáveis para o shell, frame, zoom, fontes e
  breakpoints do grid. `app/rpgui-mobile.css` conserva o padrão funcional
  mobile em JetBrains Mono para saves sem escolha de display explícita.
- `features/shared/ui-store.ts` atualiza a mesma folha CSSOM em alterações
  manuais; Zustand continua persistindo no formato `save-state-ui`.
- Os testes de unidade e CSSOM foram atualizados; foi adicionada cobertura
  Playwright dedicada em `tests/hydration-preferences.spec.ts` e
  `playwright.hydration.config.ts`.

São preservados: fullscreen/pixel-perfect, breakpoint de 768 px, Press Start
2P/JetBrains Mono/Roboto, densidades 6/8/10/12, defaults, saves legados e
persistência atual. Em viewports abaixo de 768 px o layout continua
fullscreen; em desktop os valores pixel-perfect continuam equivalentes
(aspect ratio 4:3, margem 30 px, zoom 80%).

## 4. Validação

Executada com Node `v24.22.3` e pnpm `11.3.0`, sem credenciais ou banco:

| Verificação | Resultado |
|---|---|
| Playwright real em `/login`, 390 × 844 | **Passou**; HTTP 200, raiz SSR sem atributos de preferências, sem erro de hidratação, Roboto antes/depois da hidratação e layout mobile fullscreen. |
| Playwright real em `/login`, 768 × 844 | **Passou**; mesma validação e fixture CSS pixel-perfect/grade de 12 colunas. |
| Playwright real em `/login`, 1366 × 844 | **Passou**; mesma validação e fixture CSS pixel-perfect/grade de 12 colunas. |
| Testes direcionados layout, grid e navegação mobile | **52/52 passaram** em 4 arquivos. |
| Vitest completo | **1543/1543 passaram**, 128 arquivos. |
| Typecheck | Passou. |
| ESLint completo | 0 erros; 7 avisos preexistentes fora do escopo (`features/atp/catalog-search.tsx` e `scripts/import-platform-images.mjs`). |
| Build Next.js isolado | Passou; compilação e geração das 60 páginas. |
| Instalação do build isolado | `pnpm install --offline --frozen-lockfile --ignore-scripts`: 622 pacotes reutilizados do cache, **zero downloads**; lockfile não alterado. |
| `git diff --check` | Passou. |

O Playwright confirma que o `<html>` da resposta SSR não tem os atributos
`data-*` e que o stylesheet já contém regras quando a navegação termina.
Também verifica os valores computados da fonte, geometria e densidade. A
consola/page errors não contém aviso de hidratação. `/login` não monta o shell
autenticado; para verificar suas classes geométricas e o grid, a prova
Playwright acrescenta elementos de fixture à página e avalia o CSS real da
aplicação.

Uma primeira execução do Vitest completo terminou com os 1543 testes aprovados,
mas registrou uma rejeição assíncrona não tratada no teste preexistente de
concorrência `tests/search/igdb-observability.test.ts`. O arquivo isolado passou
40/40 e a execução completa seguinte passou sem erros. O build offline foi
executado em `C:\Users\Heric\AppData\Local\Temp\opencode\hydration01-isolated-513c2d1b7a2b4002bc54acd2f929cfcd`,
sem compartilhar `.next` ou `node_modules` com o checkout.

## 5. Limites e revisão pendente

Não foi feita revisão visual humana em dispositivo real; o comportamento
verificado visualmente é o do navegador Playwright/Chrome nas dimensões acima.
Não houve acesso a conta, API de escrita, banco ou ambiente de produção.

O worktree permanece sem commit e sem push. As alterações paralelas em
`docs/IGDB_PERFORMANCE_RELEASE_REPORT.md` e os relatórios não rastreados de
DASHBOARD/RC/MOBILE foram preservados e não fazem parte desta correção.
