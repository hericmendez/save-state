# MOBILE-03B — Relatório da fundação RPGUI Mobile

**Data:** 21 de novembro de 2026
**Veredito:** implementação local da fundação concluída e validada de forma direcionada; **publicação bloqueada**. A suíte completa teve falhas e o Node disponível não corresponde à versão declarada pelo projeto. Não foi criado commit nem feito push.

## 1. Resumo executivo

Foi implementada uma fundação aditiva e opt-in para tipografia semântica, botões compactos/icon-only, inputs/selects compactos e superfícies RPGUI/planas. A API antiga dos componentes permanece como default. O stylesheet próprio é carregado depois do vendor; nenhum arquivo vendorizado, página ou contrato de domínio foi alterado.

O script síncrono pré-pintura agora distingue uma fonte display válida armazenada de uma preferência ausente/inválida. Para a nova classe de título funcional, a ausência/invalidez usa JetBrains Mono em viewports mobile; uma escolha display válida existente continua sendo respeitada. Os defaults e a forma persistida pelo Zustand não foram alterados.

Testes direcionados, typecheck, ESLint e uma verificação isolada no Chrome passaram. A suíte completa terminou com **1.538 testes aprovados e 3 falhas em 2 arquivos não relacionados**. O projeto declara Node 24.x, mas o ambiente forneceu Node 26.13.1. Por isso, seguindo o limite de publicação, não houve commit ou push.

## 2. Estado inicial do Git

- Diretório: `C:\Users\Heric\Documents\save-state`
- Branch: `main`
- HEAD inicial e final: `18c97ce12675cd25f63d0a891c2cd4941a74fa97`
- Índice inicialmente vazio; nenhum arquivo estava staged.
- Única alteração rastreada inicial: `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md`.
- Arquivos paralelos não rastreados incluíam relatórios DASHBOARD, GIT_DIVERGENCE, MOBILE-01, MOBILE_DYNAMIC_VIEWPORT, RC06/RC07 e `docs/RPGUI_MOBILE_03A_WINDOWS_PUBLICATION_REPORT.md`.
- `origin` continua configurado por SSH: `git@github.com:hericmendez/save-state.git`.

Nenhum arquivo paralelo foi removido, revertido, substituído ou incluído no índice. `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md` continua intacto e fora do escopo.

## 3. Ambiente e versões conferidos

- Windows, PowerShell.
- Node disponível: **v26.13.1**; `package.json` declara `node: 24.x` — divergência de runtime.
- pnpm disponível: **11.3.0**, igual ao `packageManager` declarado.
- Chrome instalado: **157.0.8103.79**.
- Dependências disponíveis localmente; nenhuma dependência ou browser foi instalada/atualizada.
- Manifesto e lockfile registram Next.js 15.5.29, React/React DOM 19.3.0, Tailwind CSS 4.3.3 e Playwright 1.64.1.
- Um processo `next dev` já estava rodando. Não foi interrompido e não foi iniciado build que pudesse concorrer pelo diretório `.next`.
- `AGENTS.md`, `docs/ARCHITECTURE.md` e `docs/DECISIONS.md` não foram encontrados nos caminhos consultados.

## 4. Referências consultadas

Foram consultados os documentos MOBILE-01, MOBILE-02, rastreabilidade, plano incremental, relatório MOBILE-02/03A e relatório de aprovação visual; os protótipos de tipografia, botões, containers, composições e CSS; o estado Git; Button, Input, Select, preferências/layout, store, layout global e testes associados.

A aprovação do proprietário na solicitação MOBILE-03B foi considerada a decisão vigente. Ressalvas mantidas: a altura visual do golden é ajustável, preferências já existentes devem continuar válidas, e não se deve redesenhar páginas nesta etapa.

## 5. Arquitetura e arquivos modificados

O stylesheet `app/rpgui-mobile.css` contém tokens e classes semânticas da aplicação e é importado em `app/layout.tsx` depois de `styles/vendor/rpgui/rpgui.css`, permitindo overrides previsíveis sem editar o vendor.

Arquivos de implementação:

```text
app/layout.tsx
app/rpgui-mobile.css
components/RPGUI/Button.tsx
components/RPGUI/Input.tsx
components/RPGUI/Select.tsx
features/shared/layout-mode.ts
features/shared/ui-store.ts
```

Arquivos de teste:

```text
tests/layout-mode.test.ts
tests/rpgui-button.test.ts
tests/rpgui-mobile-foundation.test.tsx
```

Não houve mudança nas páginas reais nem em consumidores existentes; as novas opções ficam disponíveis para as fases de migração.

## 6. Tipografia e preferências

O CSS oferece papéis explícitos:

- `.ss-page-title`, `.ss-section-title`, `.ss-card-title`
- `.ss-pixel-title`
- `.ss-body-text`, `.ss-metadata`

O script síncrono no `<head>` define `data-font-display-explicit` antes da primeira pintura. Uma fonte display válida presente no registro `save-state-ui` marca a escolha como explícita; valor ausente, inválido, JSON corrompido ou storage indisponível não marca.

Em mobile, títulos funcionais novos usam JetBrains Mono se não houver uma preferência display válida; escolhas válidas Press Start 2P, JetBrains Mono e Roboto são respeitadas. A fonte decorativa usa o papel display. Em desktop, as novas classes funcionais voltam ao papel display por padrão. A escolha de fonte do corpo continua independente.

`DEFAULT_FONT_DISPLAY`, `DEFAULT_FONT_BODY`, seletores existentes, UI de preferências e formato persistido do Zustand não foram modificados. Alterar apenas a fonte de corpo não torna a preferência display explícita. Não foi criada uma opção “Automático”.

Como o formato antigo não armazena intenção separadamente, qualquer valor display válido já persistido é tratado como escolha a preservar. Não é possível inferir se esse valor veio de uma interação explícita ou de uma persistência anterior do default sem mudar o contrato; a implementação privilegia não sobrescrever um valor válido existente.

## 7. Botões

`RPGUIButton` agora aceita `size="default" | "compact" | "icon"`. O default mantém o skin e markup existentes. `compact` e `icon` são opt-in e funcionam com botão, anchor, Next Link, golden e framed-grey.

`size="icon"` exige `aria-label` no tipo TypeScript e oculta visualmente o título sem removê-lo da árvore acessível. Props nativas, `title`, `children`, `golden`, `framed` e `className` existentes continuam disponíveis.

O golden compacto reutiliza os sprites upstream e remove somente os ornamentos laterais; a placa candidata usa 36px em um alvo de pelo menos 44px. A propriedade CSS pode ser ajustada após avaliação no contexto real; 36px não é declarada dimensão final. Estados hover, active, disabled e focus-visible têm regras próprias, sem `transform: scale()`.

## 8. Inputs e selects

`RPGUIInput` e `RPGUISelect` receberam a prop aditiva `density="default" | "compact"`. Sem a prop, mantêm suas classes/atributos anteriores. Compactados, permanecem nativos, fluidos e com `min-width: 0`; o input usa fonte de 16px, os controles têm mínimo de 44px e foco visível. Não foram modificados handlers, validações, labels ou contratos de formulários.

## 9. Containers e superfícies

Foram adicionadas classes opt-in `.ss-surface--framed`, `--framed-golden`, `--framed-grey`, `--panel` e `--flat`, além de `--compact`. Reutilizam sprites existentes quando há moldura; painel plano não tem borda ou textura. Nenhuma moldura global foi removida nem consumidor atual foi migrado.

## 10. Estratégia CSS e compatibilidade

- CSS pertence à aplicação e é escopado por classes/token semântico.
- `styles/vendor/rpgui/rpgui.css` permaneceu byte a byte inalterado.
- `app/globals.css` também permaneceu inalterado.
- Não houve cópia de sprites, fonte local duplicada, `!important` novo, seletor genérico para headings/parágrafos ou mudança de fonte global.
- A geometria tradicional do Button continua sendo a mesma quando `size` é omitido.
- A dimensão experimental compacta foi verificada no mesmo markup de teste em desktop; componentes existentes não receberam a nova prop.

## 11. Testes unitários e typecheck

Testes focados:

```text
pnpm exec vitest run tests/rpgui-button.test.ts tests/layout-mode.test.ts tests/rpgui-mobile-foundation.test.tsx
55 testes aprovados em 3 arquivos.
```

Cobertura adicionada/verificada: markup/API legada, variantes e classes, botão/link/anchor, rótulo acessível icon-only, atributos nativos de Input/Select, fontes armazenadas válidas/ausentes/inválidas, script pré-pintura e separação entre preferência de corpo/display.

`pnpm exec tsc --noEmit --pretty false`: **passou** com Node 26.13.1.

## 12. Testes visuais

O Playwright 1.64.1 controlou o Chrome instalado; nenhum browser foi instalado. Para evitar interferir no `next dev` já ativo, a verificação foi uma fixture isolada que carregou o CSS de produção e o CSS vendorizado na ordem usada pela aplicação. Não foi uma homologação de página real.

Viewports avaliados: 320×568, 360×800, 390×844, 412×915, 768×1024 e 1366×768.

Resultados:

- Sem overflow horizontal na fixture.
- Botão compacto e ícone: altura/largura mínima de 44px.
- Input compacto: 16px e largura fluida.
- Foco visível no controle de ícone.
- Botão RPGUI legado sem nova prop: 140×60px em todos os viewports.
- Título funcional default: Mono nos viewports móveis e fonte display no desktop.
- Fontes display explícitas Press Start 2P, JetBrains Mono e Roboto resolvidas conforme o atributo persistido.
- Placa golden 28px inspecionada mantendo hit target de 44px; 36px é a candidata atual. Não foi feita captura visual de página real nem comparação homologada de todos os tamanhos em dispositivo.

## 13. Lint, suíte completa e build

- ESLint dirigido aos arquivos alterados: passou.
- `pnpm lint`: **0 erros**, 7 avisos em arquivos preexistentes não relacionados (`features/atp/catalog-search.tsx` e `scripts/import-platform-images.mjs`).
- `pnpm test`: **1.538 aprovados, 3 falhos, 127 arquivos**.
  - `tests/game-grid-density.test.tsx`: 2 falhas porque `localStorage` estava `undefined` no ambiente jsdom.
  - `tests/scripts/operational-cli.test.ts`: 1 falha na expectativa de detecção de import do CLI.
- A suíte executou sob Node 26.13.1, fora do `engines.node` declarado (24.x); não foi possível confirmar se as falhas desaparecem no runtime suportado. Não foram “corrigidos” testes fora do escopo nem declarados como baseline.
- `next build` não executado: há `next dev` preexistente usando o projeto e o Node atual não corresponde ao requisito. Evitou-se concorrer pelo `.next`.

## 14. Git, diff e publicação

`git diff --check` padrão reporta CR final nas linhas adicionadas porque os arquivos do checkout usam CRLF. A verificação apropriada ao checkout, `git -c core.whitespace=cr-at-eol diff --check`, passou. `git diff --cached --check` passou; nenhum arquivo foi staged.

`git fetch origin main` falhou por `Host key verification failed`. Sem alterar configuração, `git ls-remote` HTTPS confirmou:

- HEAD local: `18c97ce12675cd25f63d0a891c2cd4941a74fa97`
- `origin/main` local: `18c97ce12675cd25f63d0a891c2cd4941a74fa97`
- `refs/heads/main` remoto via HTTPS: `18c97ce12675cd25f63d0a891c2cd4941a74fa97`
- Divergência local vs. `origin/main`: `0 0`

**Commit MOBILE-03B: não criado. Push: não executado.** A suíte completa falha e o runtime diverge da versão requerida; portanto a condição de publicação não foi satisfeita. Nenhum deploy manual foi feito. Um push futuro para `main` poderá acionar automações Vercel.

## 15. Estado final e preservação

- Branch `main`, HEAD inalterado em `18c97ce12675cd25f63d0a891c2cd4941a74fa97`.
- Nenhum arquivo staged.
- Os arquivos de implementação e testes acima estão modificados/não rastreados para revisão.
- A alteração preexistente `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md` permanece fora do escopo.
- Relatórios DASHBOARD, GIT_DIVERGENCE, MOBILE-01, MOBILE_DYNAMIC_VIEWPORT, RC06/RC07 e o relatório MOBILE-03A não foram alterados ou incluídos.
- Este relatório MOBILE-03B também foi criado após as validações, permanece não rastreado e não foi incluído em commit.
- Nenhuma página, API, schema, banco, autenticação, lockfile, `.env`, stylesheet global ou vendor foi alterado.

## 16. Limitações e riscos remanescentes

- A validação do navegador foi uma fixture isolada, não a aplicação real nem aparelho móvel.
- O Node local não atende à versão declarada e três testes fora do escopo falharam na suíte completa.
- Build não executado por risco de conflito com `next dev` existente.
- Valores display válidos em registros antigos são respeitados; sem metadado de intenção no formato atual, não é possível diferenciar preferência escolhida do default que tenha sido persistido automaticamente.
- A placa golden de 36px permanece ajustável. A adoção deve ser revista com conteúdo/componentes reais durante as fases de página.
- Não foi iniciado MOBILE-03C nem migração em massa de consumidores.

## 17. Próxima fase recomendada

Reexecutar typecheck, suíte completa e build em Node 24.x depois de coordenar o processo `next dev` ativo. Resolver ou classificar as três falhas do ambiente. Após isso, revisar visualmente esta fundação e então selecionar um componente/página piloto em uma fase separada, sem ampliar esta mudança.

## 18. Veredito final

**A fundação RPGUI Mobile está implementada localmente, opt-in e validada de forma direcionada; publicação bloqueada até validação confiável no runtime suportado e resolução/classificação das falhas da suíte completa.** Não houve commit, push, deploy nem redesign de páginas. A worktree paralela foi preservada.
