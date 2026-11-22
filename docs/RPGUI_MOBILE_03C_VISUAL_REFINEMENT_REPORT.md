# MOBILE-03C — Relatório de refinamento visual mobile

**Data:** 21 de novembro de 2026
**Resultado:** refinamento visual e validação local concluídos; proprietário aprovou visualmente a implementação real em Android.
**Publicação:** nenhuma. Alterações permanecem locais e sem staging.

## Escopo e preservação

Refinei somente a densidade visual do shell e da navegação MOBILE-03C. Não redesenhei páginas, alterei rotas, auth, APIs, dependências, preferências ou CSS vendor; os sprites RPGUI originais permanecem intactos. A variante compacta de `NavItem` é opt-in via prop `mobile`, mantendo o consumidor desktop na variante anterior.

Foram preservadas alterações paralelas preexistentes na worktree, incluindo os relatórios IGDB/MOBILE/RC/DASHBOARD, `features/navigation/nav-desktop.tsx` e `tests/e2e-perf/matrix-viewport.spec.ts`. Nenhum arquivo foi staged; não houve commit, push ou deploy.

## Refinamentos implementados

- `features/navigation/nav-mobile.tsx`: identidade/saudação mais compacta; cabeçalho de Fechar separado da região rolável.
- `features/navigation/nav-item.tsx`: botões dourados compactos somente no mobile e linhas secundárias planas para submenus, sem alterar a variante desktop.
- `features/navigation/collection-nav-items.tsx`: apresentação compacta e alvos de coleção mantidos em pelo menos 44 px.
- `features/navigation/app-shell.tsx`: reserva superior do shell mantida para evitar colisão do conteúdo com o acionador fixo.
- `app/rpgui-mobile.css`: estilos limitados ao shell mobile; placa dourada pintada com 28 px, dentro de controles de 44 px. Os botões RPGUI compactos respeitam a fonte funcional configurada em vez de forçar a fonte pixelada.

O teste automatizado agora verifica que o botão usa JetBrains Mono na configuração da fixture. A decisão de preservar a reserva de 16 px do shell evita a sobreposição observada quando a reserva era zero.

## Evidência visual e medições

Fixture isolada importa os componentes reais do shell/navegação e CSS da aplicação, em Chrome instalado, sem credenciais, conta, banco ou dados de produção. Os sprites originais foram copiados para o diretório temporário da fixture apenas para resolver o caminho de assets do Vite. As fontes locais `next/font` foram fornecidas à fixture para a verificação tipográfica.

Em 390×844:

- Distância entre o fim do acionador e o título do primeiro bloco: **42 px**, cerca de **48 px menor** que os ~90 px da captura de referência anterior.
- O primeiro conteúdo conserva **7 px** de clearance após a caixa do acionador; sem colisão.
- Cabeçalho de Fechar: **54 px**; início da área rolável coincide com o fim do cabeçalho.
- Oito itens principais visíveis sem rolar; todos com altura **44 px**.
- Placa do sprite dourado: `100% 28px`; controle interativo permanece com 44 px.
- Tipografia do botão compacto: JetBrains Mono conforme a configuração funcional da fixture.

Capturas novas em `docs/RPGUI_MOBILE_03C_REFINED_VISUAL_EVIDENCE/`:

1. `390-closed.png`
2. `390-open.png`
3. `390-submenu-expanded.png`
4. `390-long-collection-visible.png`
5. `320-open.png`
6. `412-open.png`
7. `768-desktop.png`
8. `1366-desktop.png`

As capturas desktop foram comparadas visualmente com a referência anterior; não foi identificado desvio do shell desktop. Elas continuam sendo uma fixture de conteúdo demonstrativo, não screenshots de sessão autenticada.

O proprietário confirmou a revisão visual da implementação real em Android: menu compacto, submenus, nomes de coleções e espaçamento superior foram considerados satisfatórios. Essa aprovação visual não substitui o diagnóstico independente do indicador `1 Issue`, registrado no relatório final de release.

## Validação executada

Ambiente: Node **v24.22.3**, pnpm **11.3.0**, Playwright **1.64.1**, Chrome instalado **157.0.8103.79**. Nenhum browser foi baixado.

| Verificação | Resultado |
|---|---|
| Fixture MOBILE-03C refinada, matriz 320×568, 360×800, 390×844, 412×915, 768×1024 e 1366×768 | **2/2 testes passaram** |
| Comportamentos na fixture | Abertura/fechamento, submenus, backdrop, Escape, foco, rolagem, alvos de toque, overflow e resize mobile→desktop verificados |
| Suíte Vitest completa | **1544/1544 testes em 128 arquivos passaram** |
| Typecheck | Passou |
| ESLint | **0 erros; 7 warnings** já existentes fora do escopo: 1 em `features/atp/catalog-search.tsx`, 6 em `scripts/import-platform-images.mjs` |
| Build de produção | Passou em cópia isolada temporária, compilação, tipos e geração estática de 60 páginas |
| `git diff --check` (tratando CRLF) | Passou |
| Fontes Next públicas | `/login` serviu recursos locais `next/font`; JetBrains Mono carregou |

O build isolado foi executado em `%LOCALAPPDATA%\Temp\opencode\mobile03c-refine-build-8487b40bf44b4bae83911128b5ce4bce`, sem reutilizar nem substituir o `.next` do checkout. Lint foi executado separadamente; o build usou `--no-lint`.

## Limitações e revisão necessária

- A rota autenticada não foi testada: `/home` redireciona para `/login`. O setup E2E oficial exige opt-ins explícitos para banco efêmero e reset, ausentes nesta execução. Não se usou storage state nem credenciais reais.
- A checagem de fontes da rota Next ocorreu em `/login`, não no shell autenticado. A fixture recebeu cópias locais das fontes e confirmou a fonte funcional dos botões, mas não substitui verificação do shell real.
- Playwright/Chrome desktop emula viewports; não representa aparelho Android físico, teclado virtual, leitor de tela nem comportamento de safe-area em hardware.
- As capturas Playwright continuam sem representar aparelho Android, teclado virtual, leitor de tela ou safe-area em hardware. A revisão Android do proprietário foi concluída e aprovada; o diagnóstico runtime do `1 Issue` é tratado separadamente e não foi mascarado.

## Como reproduzir a fixture

Com Node 24 no PATH, fixture Vite temporária em `127.0.0.1:4173` e Chrome instalado:

```powershell
pnpm exec playwright test `
  --config=docs/RPGUI_MOBILE_03C_REFINED_VISUAL_EVIDENCE/playwright.refined.config.mjs `
  --project=mobile03c-refined-fixture
```

O spec e a configuração ficam junto às capturas no diretório `docs/RPGUI_MOBILE_03C_REFINED_VISUAL_EVIDENCE/`. A fixture temporária não usa servidor autenticado nem dados externos.

## Estado final

Branch `main`, HEAD permanece `bc5e837349644742f27e9eb7e2b0682946064a06` nesta etapa do registro. As mudanças desta tarefa seguem locais; alterações paralelas foram preservadas. A revisão visual Android do proprietário foi aprovada. O diagnóstico/publicação ficam registrados em `docs/RPGUI_MOBILE_03C_FINAL_RELEASE_REPORT.md`.
