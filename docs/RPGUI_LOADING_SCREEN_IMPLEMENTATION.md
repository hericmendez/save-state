# RPGUI Loading Screen — Relatório Técnico de Implementação

Data: 2026-11-08. Escopo: componente reutilizável de Loading Screen animado
(RPGUIProgressBar) + integração aos boundaries de carregamento do Save State.
Nenhum commit, push ou deploy foi executado. Nenhum `.env`/segredo foi
alterado. Nenhum contrato de API, modelo, autenticação ou integração
IGDB/ATP foi modificado.

Convenções deste relatório:

- **FATO**: verificado diretamente (arquivo, comando, saída).
- **INFERÊNCIA**: conclusão razoável a partir de fatos, marcada como tal.
- **RECOMENDAÇÃO**: ação futura sugerida, não executada.

---

## 1. Auditoria inicial (resumo)

**FATO** — `RPGUIProgressBar` (`components/RPGUI/ProgressBar.tsx`): `value`/`max`,
cores blue/red/green/purple, clamp visual, mas `aria-valuenow` sempre presente
(anunciaria porcentagem fictícia no modo indeterminado). Nenhum outro módulo
o importava.

**FATO** — `loading.tsx` existentes: apenas 2 (`dashboard`, `backlog`),
placeholders estáticos com `h1` + texto.

**FATO** — Suspense/fallbacks granulares preservados e intocados:
`catalog/platforms/[platformId]/page.tsx` (fallback inline "Carregando
catálogo…" — streaming da identidade editorial) e `login/page.tsx`
(`useSearchParams`). Loaders booleanos preservados: `Collection`
("[ Carregando... ]"), `catalog-search` (race com `requestId`), export-buttons,
drawers/modais, `confirm-dialog`.

**FATO** — RPGUI: `.rpgui-progress*` com track/edges/fill por imagem
(`styles/vendor/rpgui/rpgui.css` ~L729); fill usa `transition: width 200ms`.
Nenhuma lib de animação nova foi instalada (a animação usa
`requestAnimationFrame` nativo).

**FATO** — Conflitos mapeados: drawers/modais/overlay usam `z-9999`–`z-99999`.
O LoadingScreen padrão é inline (`fullscreen=false`); a variante fullscreen
usa `z-50`, documentada como abaixo do chrome interativo.

---

## 2. Arquivos criados e modificados

Criados (todos verificados no filesystem após a escrita):

- `components/RPGUI/LoadingScreen.tsx` — componente reutilizável (default
  export), modos indeterminado/controlado, `"use client"`.
- `components/RPGUI/loading-progress.ts` — helpers puros testáveis
  (`LOADING_SCREEN_DEFAULT_MESSAGE/MAX`, `REDUCED_MOTION_STATIC_VALUE`,
  `clampLoadingValue`, `indeterminateProgressAt`, `prefersReducedMotion`).
- `app/(app)/loading.tsx` — fallback compartilhado das rotas autenticadas.
- `docs/RPGUI_LOADING_SCREEN_IMPLEMENTATION.md` — este relatório.

Modificados:

- `components/RPGUI/ProgressBar.tsx` — prop `indeterminate` (omite
  `aria-valuenow`); bloco co-locado removido após a extração; voltou a ser
  server-compatible (sem hooks, sem `"use client"`).
- `features/shared/layout-mode.ts` — seção temporária de helpers removida;
  resta um comentário apontando o módulo definitivo.
- `app/(app)/dashboard/loading.tsx`, `app/(app)/backlog/loading.tsx` —
  `h1` de contexto preservado + `<LoadingScreen message=...>` (mensagens
  "Loading dashboard... Please wait" / "Loading your games... Please wait").
- `features/navigation/loading-overlay.tsx` — mesmo contrato
  (`useUiStore`, `if (!isLoading)`, backdrop `z-[9999]`); miolo virou
  `<LoadingScreen/>` com a mensagem padrão "Loading... Please wait".
- `tests/loading-ux.test.ts` — +11 testes (helpers, curva, cleanup,
  reduced-motion, boundaries, overlay, semântica indeterminada).

---

## 3. Arquitetura e API pública do componente

```tsx
// Indeterminado (padrão; o Next desmonta ao concluir — sem isLoading=false,
// sem setInterval, sem porcentagem fictícia): barra 8% -> assíntota 90%
// com desaceleração 1-e^(-t/3.5s).
<LoadingScreen />
<LoadingScreen message="..." color="green|blue|red|purple" fullscreen={false} className="..." />
// Controlado (estado real conhecido; puramente apresentacional, sem timers):
<LoadingScreen mode="controlled" value={n} max={m} />
```

- Centralizado horizontal/vertical (`flex`, `min-h-[40vh]` evita layout
  shift); `max-w-xl` + `framed-grey` + `font-display` = identidade RPGUI.
- Acessibilidade: wrapper `role="status"` + `aria-live="polite"` +
  `aria-label=message`; indeterminado omite `aria-valuenow`; nenhum número
  é renderizado como texto.
- `prefers-reduced-motion`: sem `matchMedia` no SSR; com preferência, valor
  estático 35, zero `requestAnimationFrame`. Cleanup `cancelAnimationFrame`
  (StrictMode-safe). `route loading.tsx` continuam Server Components
  (import server→client permitido).

---

## 4. Rotas e carregamentos

Passaram a usar o LoadingScreen: `/dashboard`, `/backlog*` (boundaries
específicos com mensagem contextual) e todas as demais rotas autenticadas
via `app/(app)/loading.tsx` (catalog, platforms, lists, settings, ...).
Autenticação intocada: `(app)/layout.tsx` ainda redireciona sem sessão; o
fallback não renderiza conteúdo protegido.

Preservados (justificativa): Suspense granular da página de plataforma
(streaming — melhor que fullscreen); loaders inline de coleção/busca/export/
diálogos (feedback local, sem bloquear a UI); página de login (fora do
escopo auth). Nenhum skeleton útil foi substituído por overlay.

---

## 5. Testes executados e resultados

- `vitest run tests/loading-ux.test.ts tests/layout-mode.test.ts` →
  **50/50 passaram** (loading-ux 16/16: curva monótona/desacelerante/<100%/
  assíntota 90%, clamp, `prefersReducedMotion` sem browser, rAF+cleanup,
  reduced-motion, boundaries, overlay, ProgressBar indeterminado;
  layout-mode 34/34, sem regressão).
- Regressão: `navigation, rpgui-guard, dashboard-view, collection-query,
  home-redesign` → **59/59 passaram**.
- `tsc --noEmit` → único erro é pré-existente em `vitest.config.ts`
  (arquivo não tocado: chave `oxc` desconhecida pelos tipos do vite
  instalado — mesma causa-raiz das falhas de import `.tsx` abaixo);
  zero erros em qualquer arquivo criado/modificado pela tarefa.
  (Nota metodológica: leituras anteriores de exit code via pipeline
  `| Select-Object` refletiam o exit do `Select`, não da ferramenta;
  revalidados sem pipe.)
- `eslint` nos 9 arquivos tocados → **exit 0** (genuíno, sem pipe).
- `pnpm build` (cópia isolada em Temp, vide §6) → **exit 0** (genuíno,
  sem pipe); todas as rotas compilaram, incluindo os novos boundaries.
- Playwright (Chrome do sistema, `next start` da cópia, banco e2e local):
  **2/2 passaram** — (1) transição real Home→Backlog exibe
  "Loading your games... Please wait" com `progressbar` visível e
  `aria-valuenow` nulo, some após carregar, URL `/backlog`; (2) Dashboard
  com `reducedMotion: reduce` exibe/some "Loading dashboard... Please
  wait", URL `/dashboard`. Registro+login via UI funcionaram; os 3
  usuários de teste `loading-screen-*@example.com` foram removidos do
  banco local após a validação (remanescentes: 0).

---

## 6. Limitações, pendências e ambiente

**FATO** — O workspace carrega rótulo de integridade Alto
(`Mandatory Label\High (NW)`); processos do agente rodam em integridade
média. Criação de arquivos em subprojetos era bloqueada (`EPERM`);
contornada sem elevação via staging na raiz + `Move-Item` (verificado:
criar→mover→editar→remover funcionam; apenas criação direta em subdir
falha). Nenhuma ACL foi alterada. Caminhos bloqueados registrados:
`components/RPGUI/`, `app/(app)/`, `tests/`, `.next/trace`,
`.next/package.json` (este último impede `next build`/`next dev`/`pnpm`
completo dentro do workspace).

**FATO** — `pnpm build` e `next dev`/`next start` não executam dentro do
workspace (EPERM em `.next/trace`); validados em cópia isolada em Temp
(robocopy sem `node_modules/.next/.git/.env` + `pnpm install --offline`),
removida após o uso. Download de browsers Playwright indisponível
(`EAI_AGAIN` em `cdn.playwright.dev`); usado o Chrome do sistema via
`channel: "chrome"`.

**FATO** — O banco de desenvolvimento é Atlas (`.env`); a validação E2E
usou apenas o mongod local (`save-state-e2e` como URI, db pinado
`save-state` pelo app). Nenhum documento de dev/prod foi tocado; nenhum
seed executado; apenas índices/coleções do fluxo normal do app no banco
local + 3 usuários de teste, removidos (restam 0).

**INFERÊNCIA** — `.tsx` value-imports não são transformados pelo setup
atual do vitest (falha pré-existente: `rpgui-button.test.ts`,
`edit-and-add-form.test.ts`); por isso os helpers testáveis moram em
`.ts` (`loading-progress.ts`) — padrão consistente com o resto da suíte.

**RECOMENDAÇÃO** — (1) Normalizar a integridade/ACL da árvore (elevado,
uma vez) para desbloquear `pnpm`/`next`/criação direta; (2) nº build
validar `outputFileTracingRoot` (warning de múltiplos lockfiles é
pré-existente e inofensivo); (3) considerar Lighthouse/manual em
dispositivo real para transições rápidas (flicker) e modo
`pixel-perfect` vs `fullscreen`; (4) futura extração de skeletons por
rota continua opcional — o compartilhado cobre o mínimo com folga.
