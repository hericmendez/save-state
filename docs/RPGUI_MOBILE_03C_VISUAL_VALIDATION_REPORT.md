# MOBILE-03C-VIS — Validação funcional e visual da navegação mobile

**Data:** 21 de novembro de 2026
**Veredito:** validação funcional concluída em fixture isolada, com correções MOBILE-03C pontuais; **aguardando aprovação visual do proprietário**.
**Publicação:** não houve commit, push ou deploy.

## 1. Objetivo

Validar o shell e drawer mobile MOBILE-03C em Chrome/Playwright, cobrir as seis larguras requeridas, capturar a implementação renderizada e classificar o timeout anterior da suíte. A aplicação autenticada real não foi homologada: o teste de navegador usou os componentes e CSS reais da navegação montados numa fixture local, sem conta, cookie, banco ou API real.

O relatório anterior `docs/RPGUI_MOBILE_03C_NAVIGATION_IMPLEMENTATION_REPORT.md` foi lido integralmente e **não foi substituído nem editado**. Esta validação encontrou e corrigiu três problemas localizados dentro do shell mobile; não iniciou MOBILE-03D nem alterou páginas/domínios.

## 2. Estado inicial do Git

- Repositório: `C:\Users\Heric\Documents\save-state`
- Branch `main`; HEAD `bc5e837349644742f27e9eb7e2b0682946064a06`, alinhado com `origin/main`.
- Índice sem arquivos staged.
- Worktree inicialmente já continha a implementação MOBILE-03C, `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md` modificado e relatórios MOBILE/RC/DASHBOARD/GIT paralelos não rastreados.
- Todos esses arquivos paralelos foram preservados. Não houve limpeza, reset, alteração de `.env` ou uso do estado de autenticação persistido.

## 3. Ambiente e auditoria

- Node efetivo: `v24.22.3` em `%LOCALAPPDATA%\Temp\opencode\node-v24.22.3-win-x64\node.exe`.
- pnpm `11.3.0`; Playwright `1.64.1`; Chrome instalado `157.0.8103.79`.
- O Chromium gerenciado pelo Playwright não está instalado. O runner isolado foi configurado para usar o Chrome instalado, sem baixar browsers.
- Processos Next preexistentes: PID 21632 (`next dev`) e PID 14772 (Next server em `localhost:3000`). Ambos foram deixados em execução. O servidor Vite de fixture, iniciado nesta revisão em `127.0.0.1:4173`, foi encerrado ao final.
- `http://localhost:3000/home` responde com redirecionamento `307` para `/login`; `/api/health` responde `200`.
- O Playwright de produção exige `globalSetup` com opt-ins explícitos (`E2E_DATABASE_EPHEMERAL`, `E2E_ALLOW_DATABASE_RESET`, `E2E_MONGODB_URI`) e banco local de teste, que não estavam configurados. Esse setup pode limpar o banco efêmero autorizado. Por isso, o runner padrão com reset de banco não foi iniciado. O arquivo de storage state existente não foi usado.

### Observação sobre o build citado no relatório anterior

Na auditoria do transcript da execução anterior, o comando que pretendia validar o build na cópia temporária criou/copiei os arquivos para `%LOCALAPPDATA%\Temp\opencode\mobile03c-safe-build`, mas não mudou o diretório de trabalho antes de executar `pnpm install`/`pnpm build`. A cópia não contém `.next`, enquanto havia `.next` no checkout. Assim, **não é possível confirmar a alegação do relatório anterior de que aquele build foi isolado**; o comando registrado aponta que o build foi executado a partir do checkout. Não repetimos o build nesta validação: havia servidores Next ativos e a tarefa não exigia build sem alteração relevante de regressão.

## 4. Arquivos examinados

Documentos obrigatórios:

- `docs/RPGUI_MOBILE_03C_NAVIGATION_IMPLEMENTATION_REPORT.md`
- `docs/RPGUI_MOBILE_03A_VISUAL_APPROVAL_REPORT.md`
- `docs/RPGUI_MOBILE_03B_FOUNDATION_IMPLEMENTATION_REPORT.md`
- `docs/RPGUI_MOBILE_PDF_TRACEABILITY.md`
- `docs/prototypes/rpgui-mobile/compositions.html`
- `docs/prototypes/rpgui-mobile/screenshots/compositions-390.png`

Código e testes:

- `features/navigation/app-shell.tsx`
- `features/navigation/nav-mobile.tsx`
- `features/navigation/nav-desktop.tsx`
- `features/navigation/nav-item.tsx`
- `features/navigation/nav-structure.ts`
- `features/navigation/collection-nav-items.tsx`
- `features/navigation/content.tsx`
- `app/rpgui-mobile.css`, `app/globals.css` e `styles/vendor/rpgui/rpgui.css` (leitura; vendor não foi alterado)
- `tests/navigation/nav-mobile.test.tsx`
- `tests/e2e-perf/matrix-viewport.spec.ts`
- `playwright.config.ts`, `tests/e2e-perf/global-setup.ts`, `tests/e2e-perf/auth.setup.ts` e helpers de fixture

## 5. Estratégia Playwright e proveniência

Foi montada uma fixture temporária em `%LOCALAPPDATA%\Temp\opencode\mobile03c-vis-fixture`, servida localmente por Vite e aberta no Chrome instalado. A fixture importa e renderiza o **AppShell, Content, NavMobile, NavItem, NAV_STRUCTURE, CollectionNavItems, RPGUIButton e NavDesktop reais**, com Tailwind/RPGUI CSS, wallpaper e sprite existentes.

Foram isolados apenas os pontos que dependem de Next.js/serviços: hooks de `next/navigation`, `next/link`, `LoadingOverlay`, `useResponsiveLayout` e `CollectionCreateModal`. A busca GET de coleções foi atendida por uma resposta local de teste contendo uma coleção longa; nenhum dado veio do servidor da aplicação. A saudação usa `MOBILE 03C REVIEW PLAYER`, nome fictício. O logout real é renderizado e acessível, mas não foi acionado porque não existe sessão para encerrar. Nenhuma credencial real foi usada.

Dois testes foram executados sob configurações Playwright próprias, documentadas em `docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/`:

1. O teste original adicionado em `tests/e2e-perf/matrix-viewport.spec.ts`, selecionado por `--grep "drawer abre"`, executou **1/1 aprovado** contra a fixture (configuração sem global setup, banco, servidor Next ou storage state).
2. `mobile03c-fixture.spec.ts` executou **1 teste abrangente aprovado**, verificando a matriz, interações, alvos, desktop, transição de breakpoint e gerando as capturas. Foi repetido depois das correções finais.

Portanto, o teste pendente foi executado funcionalmente em fixture segura, mas **não** contra a aplicação autenticada real. Os caminhos das configurações e comandos reproduzíveis estão na seção 7.

## 6. Problemas observados e correções limitadas

O navegador evidenciou três comportamentos que não apareciam nos testes jsdom:

1. **Drawer não fixava nem ocupava a largura esperada.** A regra não important do vendor `.rpgui-container.framed-grey` ganhava de `fixed`; o painel aparecia em fluxo e estreito. Aplicado `!fixed` e a cor de base opaca `!bg-[#15171a]` ao painel para separar visualmente o drawer do wallpaper/backdrop.
2. **Variantes `md:hidden` não ocultavam os elementos RPGUI no desktop.** Aplicado `md:!hidden` ao acionador, backdrop e painel, conferido em 768 e 1366 px.
3. **Redimensionar com o drawer aberto podia deixar o estado modal/scroll lock ativo no desktop.** O shell agora fecha o drawer quando cruza para `innerWidth >= 768`; ao cruzar, foco vai para o primeiro link da navegação desktop. Fechamentos ainda em mobile retornam foco ao acionador.

Durante a verificação de rolagem, o controle Fechar não permanecia visível ao rolar o drawer. Ele agora usa posicionamento sticky no topo. Os alvos da navegação dinâmica de coleções no mobile receberam altura/largura mínima de 44 px de forma condicional a `onNavigate`; o desktop não recebe a alteração.

Essas correções estão limitadas a `features/navigation/app-shell.tsx`, `features/navigation/nav-mobile.tsx` e `features/navigation/collection-nav-items.tsx`. Não houve mudança em páginas, APIs, auth, schema, vendor, dependências ou lockfiles.

## 7. Resultados por viewport e comportamento

Viewports executados: **320×568, 360×800, 390×844, 412×915, 768×1024 e 1366×768**.

| Viewport | Menu fechado | Menu aberto | Overflow horizontal | Captura |
|---|---|---|---|---|
| 320×568 | acionador visível, `aria-expanded=false`, painel inert/oculto | drawer dentro da viewport, scroll interno disponível | nenhum (>1 px) | `320-open.png` |
| 360×800 | mesmo contrato mobile | Escape fecha e devolve foco | nenhum (>1 px) | sem PNG específico |
| 390×844 | fechado e conteúdo sem colisão | backdrop, painel, saudação, logout e submenus | nenhum (>1 px) | fechado, aberto, submenu e coleção longa |
| 412×915 | mesmo contrato mobile | drawer e alvos acessíveis | nenhum (>1 px) | `412-open.png` |
| 768×1024 | trigger mobile oculto; NavDesktop real visível | estado desktop sem drawer mobile | nenhum (>1 px) | `768-desktop.png` |
| 1366×768 | trigger mobile oculto; NavDesktop real visível | estado desktop sem drawer mobile | nenhum (>1 px) | `1366-desktop.png` |

### Menu, teclado, backdrop e rolagem

- Trigger mobile: visível abaixo de 768 px, nome acessível, alvo medido ≥44×44 px, `aria-expanded` muda `false → true → false`.
- Título de fixture e trigger: retângulos não se intersectam em cada largura mobile.
- Abrir move foco ao botão Fechar. O botão tem alvo ≥44×44 px e permanece em viewport durante a rolagem interna.
- Tab e Shift+Tab percorrem o drawer e fazem wrap para a outra extremidade. Fechado, o painel possui `aria-hidden=true` e `inert`; não aparece na árvore de roles nem aceita foco.
- Backdrop fecha por clique fora da área do painel. Escape fecha e restaura foco no trigger.
- Enquanto aberto, `body` recebe `overflow:hidden`; após backdrop, Escape ou mudança para desktop, o estilo anterior é restaurado.
- Ao cruzar de 390 px aberto para 768 px, o estado fecha, o backdrop/painel deixam de atuar, scroll destrava e foco é direcionado ao primeiro link desktop. Teste também a condição móvel inicial e desktop inicial.

### Saudação, logout, submenus e alvos

- Saudação mostra o usuário fictício de fixture; link “Sair” está acessível. O POST de logout não foi enviado.
- `Buscar Jogos` e `Minhas coleções` expandem; links estáticos de navegação e criação continuam presentes.
- `CollectionNavItems` real renderiza nome fictício longo com quebra de palavras e `<wbr>`. O item cabe sem overflow horizontal; seu link e ação de opções passam no limite de 44×44 px no drawer.
- Todos os links e botões presentes no drawer, incluindo a ação dinâmica, foram medidos: nenhum alvo ficou abaixo de 44×44 px depois das correções. Botões de grupo também mantêm dimensão legível.
- Desktop usa o `NavDesktop` real nesta fixture e mantém links/estrutura. Não se testou o logout em sessão nem navegação de rota através de servidor Next.

## 8. Screenshots gerados

PNG reais de Chrome, capturados da fixture dos componentes MOBILE-03C e CSS da aplicação; DPR 1. Eles **não** representam dados de conta real nem uma página autenticada de produção.

Diretório: `docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/`

1. 390 px — fechado: [`390-closed.png`](RPGUI_MOBILE_03C_VISUAL_EVIDENCE/390-closed.png)
2. 390 px — aberto: [`390-open.png`](RPGUI_MOBILE_03C_VISUAL_EVIDENCE/390-open.png)
3. 390 px — submenu expandido: [`390-submenu-expanded.png`](RPGUI_MOBILE_03C_VISUAL_EVIDENCE/390-submenu-expanded.png)
4. 320 px — aberto: [`320-open.png`](RPGUI_MOBILE_03C_VISUAL_EVIDENCE/320-open.png)
5. 412 px — aberto: [`412-open.png`](RPGUI_MOBILE_03C_VISUAL_EVIDENCE/412-open.png)
6. 768 px — desktop: [`768-desktop.png`](RPGUI_MOBILE_03C_VISUAL_EVIDENCE/768-desktop.png)
7. 1366 px — desktop: [`1366-desktop.png`](RPGUI_MOBILE_03C_VISUAL_EVIDENCE/1366-desktop.png)

Evidência adicional de nome longo com drawer rolado e botão Fechar sticky: [`390-long-collection-visible.png`](RPGUI_MOBILE_03C_VISUAL_EVIDENCE/390-long-collection-visible.png). Todas essas capturas foram geradas nesta execução; não foram colocadas nem sobrescreveram os 24 PNGs de MOBILE-03A.

## 9. Comparação com a referência MOBILE-03A

`compositions-390.png` demonstra acionador em faixa própria, conteúdo sem sobreposição, controles de pelo menos 44 px e linha de item com nome longo. A fixture MOBILE-03C confirma a reserva superior: o título começa abaixo do trigger; confirma também drawer com limite de largura, fechamento, rolagem interna e nome longo quebrando dentro da moldura.

Diferenças: o protótipo é uma composição estática de conteúdo geral; as capturas MOBILE-03C mostram o shell/menu real, painel RPGUI opaco e navegação real com uma coleção fictícia. A fixture não substitui a referência nem valida uma página de produção. Os PNGs desktop mostram o componente desktop real, mas o conteúdo principal continua sendo conteúdo demonstrativo.

## 10. Timeout da suíte completa

Teste identificado: `tests/auth/rate-limit.test.ts` → `authentication rate limiting` → `is bypassed in test environments`. Timeout Vitest padrão: **5.000 ms**. A primeira execução completa anterior registrou **10.586 ms** para esse teste e timeout; a execução isolada anterior passou.

Nesta validação:

- `pnpm exec vitest run tests/auth/rate-limit.test.ts --testTimeout=5000`: **3/3 passou**; arquivo executou em 8,52 s incluindo hooks/importação; duração agregada informada para testes 5,28 s.
- Nova suíte completa em Node 24: **128/128 arquivos, 1544/1544 testes passaram**, duração de parede 105,70 s. Vitest informou 659,19 s agregados de testes e 293,70 s de importação, evidência de paralelismo relevante entre arquivos.

O teste faz cadastro, verificação e várias tentativas de login sequenciais — trabalho com banco efêmero e hashing de senha — dentro do limite de 5 s. A falha anterior é classificada como **timeout transitório por contenção de recursos sob concorrência**, não falha funcional reproduzível: passou isolado com o limite original e passou novamente na suíte completa. Não aumentamos timeout global nem alteramos teste fora de MOBILE-03C.

## 11. Validação final

Sob Node `v24.22.3`:

| Verificação | Resultado |
|---|---|
| Playwright original `matrix-viewport.spec.ts`, caso “drawer abre”, em fixture sem auth/DB | **1/1 passou** |
| Matriz/comportamentos/screenshot `mobile03c-fixture.spec.ts` em fixture | **1/1 passou**, cobrindo 6 larguras, estados e transição |
| Vitest navegação: `nav-mobile`, `navigation.test`, `submenu-typography` | **21/21 passou** |
| Suíte Vitest completa | **1544/1544 passou em 128 arquivos** |
| Rate limit isolado, limite original de 5 s | **3/3 passou** |
| Typecheck | **Passou** |
| ESLint completo | **0 erros; 7 warnings preexistentes**, em `features/atp/catalog-search.tsx` (1) e `scripts/import-platform-images.mjs` (6) |
| `git diff --check` com CRLF reconhecido | **Passou** |
| Build | **Não repetido**: nenhuma necessidade após build relatado anteriormente, servidores Next ativos e build prévio não confirmado como isolado |

## 12. Arquivos alterados nesta validação

Implementação MOBILE-03C ajustada:

- `features/navigation/app-shell.tsx`
- `features/navigation/nav-mobile.tsx`
- `features/navigation/collection-nav-items.tsx`

Evidência reprodutível e relatório:

- `docs/RPGUI_MOBILE_03C_VISUAL_VALIDATION_REPORT.md` (este arquivo)
- `docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/mobile03c-fixture.spec.ts`
- `docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/playwright.fixture.config.mjs`
- `docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/playwright.validation.config.mjs`
- PNGs listados na seção 8

Arquivos MOBILE-03C que já estavam alterados no início — `features/navigation/nav-desktop.tsx`, `tests/e2e-perf/matrix-viewport.spec.ts`, `tests/navigation/nav-mobile.test.tsx`, relatório de implementação e demais documentos — foram preservados; não foram substituídos. `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md` e os outros relatórios paralelos também foram preservados.

## 13. Reprodução Playwright

Com Vite da fixture executando em `127.0.0.1:4173` e Node 24 no PATH:

```powershell
pnpm exec playwright test `
  --config=docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/playwright.fixture.config.mjs `
  --project=mobile03c-fixture `
  --grep 'drawer abre'

pnpm exec playwright test `
  --config=docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/playwright.validation.config.mjs `
  --project=mobile03c-component-fixture
```

A primeira execução é o teste já adicionado à matriz do app, mas montado sobre a fixture sem banco; a segunda é a matriz abrangente que também recria os PNGs. O servidor Vite da fixture está no diretório temporário citado acima. O Playwright usa `C:\Program Files\Google\Chrome\Application\chrome.exe`.

## 14. Limitações

- Não houve autenticação em aplicação real; `/home` redireciona ao login e o setup oficial exige banco local explicitamente opt-in.
- As capturas são da fixture com AppShell/NavMobile/NavDesktop reais, mas hooks Next, componentes de infraestrutura e conteúdo principal são isolados. A saudação/nome e coleção longa são fictícios.
- O logout foi verificado como link acessível, não executado contra uma sessão.
- CSS usa as fontes fallback da fixture; os arquivos de fonte do `next/font` não foram carregados pelo ambiente Vite. Revisar tipografia final em Next.
- Playwright simula viewport/touch em Chrome desktop; não é aparelho físico, leitor de tela nem teste de teclado virtual/safe-area.
- O teste novo não executa fluxos de navegação autenticados de todas as rotas. Desktop foi renderizado com `NavDesktop` real e o conteúdo demonstrativo.
- A validação não confirma comportamento de outras páginas; elas não foram alteradas.
- A divergência sobre o build histórico está descrita na seção 3; nenhum build foi repetido nem `.next` foi deliberadamente modificado nesta revisão.

## 15. Estado final da worktree e publicação

- Branch `main`, HEAD inalterado em `bc5e837349644742f27e9eb7e2b0682946064a06`.
- Nenhum arquivo staged; nenhuma publicação.
- Alterações MOBILE-03C continuam locais. `docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/` e este relatório são novos e locais.
- Relatórios e alterações paralelas permaneceram intactos. Processos Next preexistentes não foram encerrados.
- Não houve commit, push, deploy, instalação de dependências, alteração de `.env`, configuração global, Vercel, API, schema, banco, autenticação ou CSS vendor.

## 16. Pendências para aprovação visual

1. Revisar as oito capturas em `docs/RPGUI_MOBILE_03C_VISUAL_EVIDENCE/`, sobretudo 320 px e o nome longo com drawer rolado.
2. Confirmar em dispositivo real a aparência da moldura/painel opaco, o espaçamento entre trigger e cabeçalho, tipografia/fontes carregadas por Next e legibilidade do drawer sob conteúdo real.
3. Se aprovado, repetir o caso Playwright em ambiente E2E autenticado com banco efêmero explicitamente opt-in; não usar conta real.
4. Solicitar aprovação expressa do proprietário antes de iniciar qualquer outra fase.

## 17. Veredito final

**A navegação MOBILE-03C passou nos testes funcionais isolados de Chrome em todos os viewports solicitados após correções locais de especificidade do drawer, alvos dinâmicos e transição mobile→desktop.** A suíte completa voltou a passar; o timeout anterior não se reproduziu e foi classificado como lentidão transitória sob concorrência.

As capturas são evidência real dos componentes MOBILE-03C numa fixture, **não homologação da aplicação autenticada real**. A worktree paralela foi preservada e nenhuma alteração foi publicada. **Aguardar a revisão visual do proprietário.**
