# MOBILE-03C — Integração da navegação RPGUI Mobile

**Data:** 21 de novembro de 2026
**Status:** implementação local concluída para revisão visual do proprietário.
**Publicação:** nenhuma. Não houve commit, push ou deploy.

## 1. Objetivo e escopo

Integrar a fundação opt-in publicada em MOBILE-03B ao shell autenticado e à navegação mobile, sem migrar páginas ou alterar contratos de domínio. A mudança fica limitada a `features/navigation/`, aos testes de navegação/viewport e a este relatório.

Desktop continua usando a navegação existente. `LogoutLink` mantém o mesmo fluxo de logout; a prop `mobile` só acrescenta um alvo de toque de 44 px no drawer. Nenhuma dependência, lockfile, API, schema, configuração de Vercel ou CSS vendor foi alterado. A estrutura e as rotas de navegação, submenus, ações de coleção e suporte a nomes longos permanecem reutilizados.

## 2. Referências consultadas

Foram lidos os relatórios:

- `docs/MOBILE_01_FULL_UX_AUDIT.md`
- `docs/RPGUI_MOBILE_DESIGN_SYSTEM_PROPOSAL.md`
- `docs/RPGUI_MOBILE_PDF_TRACEABILITY.md`
- `docs/RPGUI_MOBILE_IMPLEMENTATION_PLAN.md`
- `docs/RPGUI_MOBILE_03A_VISUAL_APPROVAL_REPORT.md`
- `docs/RPGUI_MOBILE_03B_FOUNDATION_IMPLEMENTATION_REPORT.md`

Também foram inspecionados os protótipos `compositions.html`, `typography.html` e `buttons.html`, e a captura `screenshots/compositions-390.png` em `docs/prototypes/rpgui-mobile/`. A composição de 390 px reforça a necessidade de reservar espaço para o controle do menu, preservar nomes extensos e manter alvos de toque confortáveis. Os componentes usam as classes opt-in existentes em `app/rpgui-mobile.css`; o CSS vendor não foi editado.

## 3. Auditoria inicial e preservação

- Repositório: `C:\Users\Heric\Documents\save-state`; branch `main`; HEAD `bc5e837349644742f27e9eb7e2b0682946064a06`, alinhado com `origin/main`.
- Não havia alterações staged. A alteração preexistente em `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md` e os demais relatórios locais não relacionados foram preservados.
- Node verificado: `v24.22.3`, executável em `%LOCALAPPDATA%\Temp\opencode\node-v24.22.3-win-x64\node.exe`; pnpm `11.3.0`. O `node` padrão da sessão era v26.13.1, portanto as verificações foram executadas com Node 24 explicitamente à frente no PATH.
- Os processos Next existentes (PID 24692, `next dev`, e PID 7788, `next start`) não foram interrompidos. O build foi feito em uma cópia temporária independente em `%LOCALAPPDATA%\Temp\opencode\mobile03c-safe-build`, sem compartilhar o `.next` da aplicação.

## 4. Implementação

### Shell — `features/navigation/app-shell.tsx`

- O acionador deixou de ser uma `div` clicável e passou a ser um botão real com nome acessível, estado `aria-expanded`, relação `aria-controls` e referência para devolver o foco ao fechar.
- A classe compacta/icon-only da fundação mantém o acionador em pelo menos 44 × 44 px.
- Foi reservado espaço no topo do conteúdo mobile (`pt-16`) para que o acionador fixo não cubra o título/conteúdo inicial; no desktop o espaçamento novo não se aplica.
- O drawer recebe explicitamente o usuário autenticado e um callback de fechamento.

### Drawer — `features/navigation/nav-mobile.tsx`

- O drawer é modal, limitado a `86vw` até 22 rem e exibido somente abaixo do breakpoint `md` (768 px). Backdrop, controle de fechar e transição respeitam `prefers-reduced-motion`.
- O backdrop fecha o drawer; o botão de fechar e o acionador têm nomes acessíveis. O drawer fechado fica `inert` e `aria-hidden`.
- Escape fecha; Tab/Shift+Tab permanecem dentro do drawer. A abertura move foco para o primeiro controle, o fechamento restaura foco no acionador e a rolagem do body é bloqueada apenas enquanto aberto e restaurada no cleanup.
- A saudação usa `user.name`, com fallback existente de apresentação; o logout reutiliza `LogoutLink` e seu fluxo atual.
- Removido `zoom: 80%` da navegação mobile. Os mesmos itens e componentes de submenu continuam sendo renderizados, sem reimplementar rotas ou ações de coleção.

### Testes

- `tests/navigation/nav-mobile.test.tsx` cobre saudação, itens preservados, estado fechado/inert, Escape, ciclo de foco e restauração de rolagem.
- `tests/e2e-perf/matrix-viewport.spec.ts` ganhou um caso de viewport Pixel 7 para abrir por toque, conferir alvos de pelo menos 44 px, saudação/logout, fechar com Escape e restaurar foco.

## 5. Verificações e resultados

Todas as verificações abaixo usaram Node `v24.22.3`.

| Verificação | Resultado |
|---|---|
| Testes direcionados (`nav-mobile`, contrato de navegação e tipografia de submenu) | **21 passaram** |
| `pnpm typecheck` | **Passou** |
| `pnpm lint` | **Passou**, com 7 warnings preexistentes fora do escopo (1 em `features/atp/catalog-search.tsx`, 6 em `scripts/import-platform-images.mjs`) |
| `pnpm test` | **127/128 arquivos; 1543/1544 testes passaram**. Um teste de rate limit excedeu 5 s sob carga; executado isoladamente com 20 s, passou (3/3) |
| ESLint dos arquivos alterados | **Passou**, sem warnings |
| Teste direcionado final do drawer | **3/3 passou** |
| Build | **Passou** com `pnpm install --offline --frozen-lockfile --ignore-scripts` e `pnpm build` na cópia temporária isolada |
| `git diff --check` | **Passou** tratando CRLF como final de linha (`core.whitespace=cr-at-eol`) |
| E2E Playwright de viewport | **Adicionado, não executado**: requer servidor de produção, setup de autenticação e ambiente E2E configurado |

O build não reutilizou nem alterou o `.next` do workspace. Nenhum servidor ativo foi encerrado.

## 6. Limites e revisão visual

O teste Playwright de viewport está pronto para a matriz `mobile-matrix`, mas não foi executado neste ambiente. A validação automatizada não substitui a revisão visual solicitada; confirmar especialmente o acionador sobre páginas com cabeçalho próprio, o enquadramento da moldura do drawer em 320/390 px e os submenus/coleções longos em dispositivo real.

## 7. Reprodução

Na raiz do repositório, com PowerShell:

```powershell
$nodeDir = Join-Path $env:LOCALAPPDATA 'Temp\opencode\node-v24.22.3-win-x64'
$env:PATH = "$nodeDir;$env:PATH"
node --version
pnpm exec vitest run tests/navigation/nav-mobile.test.tsx tests/navigation.test.ts tests/navigation/submenu-typography.test.tsx
pnpm typecheck
pnpm lint
pnpm test
pnpm exec vitest run tests/auth/rate-limit.test.ts --testTimeout=20000
```

O teste de viewport pode ser executado em ambiente E2E configurado com o projeto `mobile-matrix` e a aplicação de produção:

```powershell
pnpm exec playwright test tests/e2e-perf/matrix-viewport.spec.ts --project=mobile-matrix
```

Para reproduzir o build sem tocar no checkout compartilhado, copie o workspace para um diretório temporário excluindo `.git`, `node_modules`, `.next` e arquivos `.env*` locais; então execute `pnpm install --offline --frozen-lockfile --ignore-scripts` e `pnpm build` nessa cópia.
