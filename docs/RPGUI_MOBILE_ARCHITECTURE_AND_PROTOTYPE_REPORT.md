# MOBILE-02 — Relatório de arquitetura e prototipação

**Data da MOBILE-02:** 20 de novembro de 2026
**Estado:** documentação e protótipos concluídos; alterações de produção não autorizadas nem realizadas.
**Referência de código:** `8e421fd` — `fix(mobile): use dynamic viewport height for app shell`.

**Nota de consistência MOBILE-03A:** este relatório foi revisado para distinguir propostas experimentais de decisões. O PDF tem 8 páginas físicas (7 anotadas e 1 em branco); não há preferência “Automático” nesta fase; a altura visual de 36px do sprite é apenas uma amostra entre opções, não um requisito final.

## 1. Objetivo e escopo executado

Foi realizada auditoria técnica estática, proposta de arquitetura para o RPGUI Mobile, rastreabilidade dos apontamentos do proprietário, protótipos HTML/CSS isolados, renderização em seis larguras e plano incremental de implementação futura.

O escopo não incluiu implementação nas páginas reais, alteração de API/schema/banco, instalação de dependências, edição do vendor, uso de credenciais, commit, push ou deploy.

## 2. Estado inicial da worktree

No início, a branch era `main`, HEAD `8e421fd`, e a worktree já continha:

- Modificado: `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md`.
- Não rastreados: `docs/DASHBOARD_STATISTICS_REDESIGN_PROPOSAL.md`, `docs/GIT_DIVERGENCE_AUDIT.md`, `docs/MOBILE_01_FULL_UX_AUDIT.md`, `docs/MOBILE_01_VIEWPORT_PUBLICATION_REPORT.md`, `docs/MOBILE_DYNAMIC_VIEWPORT_FIX_REPORT.md`, `docs/RC06_1_ISOLATED_RECONSTRUCTION_REPORT.md`, `docs/RC06_2_MAIN_SYNC_REPORT.md`, `docs/RC06_MAIN_SYNC_PREPARATION_REPORT.md`, `docs/RC07_GRID_DENSITY_PUBLICATION_REPORT.md`.

Esses itens foram preservados. Os novos itens desta tarefa são os quatro documentos MOBILE-02 e `docs/prototypes/rpgui-mobile/`. Nenhum commit foi criado.

## 3. Documentação e arquivos consultados

Foram lidos: `AGENTS.md`; `docs/MOBILE_01_FULL_UX_AUDIT.md`; `docs/MOBILE_01_VIEWPORT_PUBLICATION_REPORT.md`; cabeçalhos e conteúdo pertinente de `docs/ARCHITECTURE.md` e `docs/DECISIONS.md`, incluindo ADR-012; `app/globals.css`; `styles/vendor/rpgui/rpgui.css`; `components/RPGUI/Button.tsx` e `Input.tsx`; componentes de Home, Activity/Diary, navegação, Catálogo, Backlog, Coleções, Top 10, Game Form, drawers/modais, contexto de jogos e persistência de reviews. Também foi conferido o inventário de documentação recente MOBILE-01 e o fix de `dvh`.

## 4. Confirmação de acesso ao PDF

O arquivo `/home/heric/Downloads/save-state-mobile-fixes.pdf` estava acessível. Foi renderizado e inspecionado página a página. O PDF tem oito páginas físicas: sete com conteúdo/anotações e a página 8 em branco, embora o enunciado o descreva como sete páginas. Foram registrados os 14 IDs HOME-01, HOME-02, HOME-03, MENU-01, GENERAL-SEARCH-01, ACTIVITY-01, GAME-SEARCH-PLATFORMS-01, GAME-CATALOG-MODAL-01, BACKLOG-NEW-GAME-FORM-01, BACKLOG-NEW-GAME-FORM-MODAL-01, BACKLOG-GAMES-01, BACKLOG-COLLECTIONS-01, BACKLOG-TOP10-01 e BACKLOG-GAME-MODAL-01.

## 5. Diagnóstico da implementação atual

### Fatos confirmados em código

- O vendor define botão com `min-width: 140px`, `height: 60px`, padding lateral 35px; botões dourados usam sprites laterais separados.
- `.framed`/`.framed-golden` usam borda de 15px e padding de 12px; `.framed-grey` usa borda de 7px e padding de 5px.
- Com shell/margens atuais descritos na auditoria, a largura útil indicada para 320px dentro de `framed` é 266px.
- As preferências de fonte já existem em `app/globals.css` via `data-font-display` e `data-font-body`, incluindo Press Start 2P, JetBrains Mono e Roboto.
- `features/collections/collections-manager.tsx` contém handler de submit, valida nome vazio, define loading, envia POST, limpa após sucesso, atualiza e apresenta erro. Os botões por coleção são 36×36px.
- `features/reviews/review-form-section.tsx` chama `createDraft` antes de `onOpenEditor` e apresenta mensagem caso falhe. `draft-store.ts` depende de IndexedDB e rejeita contexto inseguro/indisponível.
- `features/games/context-menu.tsx` abre por `onContextMenu`; não foi encontrado gatilho explícito de toque na abstração inspecionada.
- Backlog e catálogo têm min-width de tabela de 340px e 600px, respectivamente.
- Top 10 mantém quatro ações por linha e usa botões RPGUI/molduras.
- Menu mobile usa painel fixed/transforms, botão fixo de fechar e `zoom: 80%`; o screenshot do PDF também registra problemas de backdrop/ordem visual.
- O GameDrawerShell já usa portal, `aria-modal`, Escape e scroll lock; isso reduz, mas não elimina, o trabalho de acessibilidade/foco.

### Inferências, não causas confirmadas

- Coleção: o handler estático não mostra falha óbvia de submit. Clipping, teclado/zoom, auth/API, latência ou feedback fora da viewport são hipóteses; exigem reprodução runtime.
- Review: a falha imediata do fluxo pode ocorrer antes da abertura do editor, em `createDraft`. IndexedDB/secure-context/storage é dependência confirmada, mas não se comprovou qual condição ocorre no aparelho do proprietário.
- Context menu: suporte a clique longo varia por navegador; o código não estabelece long press como API explícita e confiável.

## 6. Arquitetura proposta

Uma camada app-owned, aditiva e mobile-first, formada por tokens semânticos, variantes compactas de controles e superfícies, sem editar `styles/vendor/rpgui/rpgui.css`. Componentes existentes seguem funcionando; migração por consumidores e fases, não substituição em massa.

Hierarquia: página → região emoldurada quando justificada → painel plano/compacto → item com divisor → controle. Evitar molduras aninhadas. Mobile adapta geometria e composição; desktop mantém o RPGUI completo como default.

## 7. Sistema tipográfico

Press Start 2P é reservada para marca, identidade e decoração curta. JetBrains Mono é predominante no mobile para títulos, corpo, formulários, metadados, tabelas, botões e modais. Títulos usam tokens/clamp; inputs mantêm 16px; textos pequenos não recebem sombra forte; títulos longos quebram sem sobrepor controles.

As preferências `fontDisplay` e `fontBody` existentes não serão alteradas, e não será criada a preferência “Automático”. A precedência entre essas escolhas explícitas e os novos papéis visuais precisa ser aprovada antes da integração. Os protótipos mostram amostras estáticas, não simulam nem gravam as preferências.

## 8. Sistema de botões

Variantes propostas: golden, secondary, ghost, danger e icon. Alvo interativo mínimo 44×44px; texto 13px JetBrains Mono; ícone 17px; foco visível 2px; estado busy mantém geometria e expõe estado. `+` só para adição inequívoca; `…` para múltiplas ações; ícone isolado exige nome acessível.

### Golden compacto

Os assets reais são 74×24px RGBA (`button-golden.png` e estados hover/down); `button-golden-left/right.png` são 12×22px. O protótipo usa uma amostra central de 36px, agora comparada a 28, 32 e 40px, dentro de alvos mínimos de 44px e sem pseudo-elementos laterais. As alturas pintadas são experimentais; distorção/interpolação precisa de aprovação visual e teste físico. Não é uma redução via `transform`.

## 9. Sistema de containers

Proposta mobile: borda de 8px + 12px de padding para moldura principal; framed-grey de 5px + 8px; painel plano de 1px + 12px; além da opção sem painel. São valores de protótipo, sujeitos à aprovação e validação em produção. A recuperação de espaço deve vir sobretudo da remoção de molduras não funcionais, não de reduzir todas indiscriminadamente.

## 10. Protótipos produzidos

Em `docs/prototypes/rpgui-mobile/`:

- `index.html` — entrada e instruções.
- `typography.html` — papéis e comparação tipográfica.
- `buttons.html` — golden legado, compacto, secundário e estados.
- `containers.html` — molduras e superfícies.
- `compositions.html` — cabeçalho, busca, filtros, item de lista, Top 10 e modal.
- `mobile.css` — tokens e estilos locais.
- `assets/fonts/jetbrains-mono-latin.woff2` e `press-start-2p-latin.woff2`.

Os protótipos são HTML/CSS estáticos, sem import pela aplicação, sem dependências e com referência relativa aos assets vendorizados existentes.

## 11. Resultado visual verificado

Na MOBILE-02 foi feita renderização com Chrome do sistema (`/usr/bin/google-chrome`) via Playwright já declarado no projeto, sem instalar pacotes. Foram verificados 5 documentos × 6 viewports = 30 combinações:

`320×568`, `360×800`, `390×844`, `412×915`, `768×1024`, `1366×768`.

Resultado automatizado MOBILE-03A: 30 combinações (cinco documentos × seis viewports), sem overflow, alvos selecionados inferiores a 44px, alvos fora da viewport, falhas de fonte ou erros de console. As evidências persistentes e métricas estão em `docs/prototypes/rpgui-mobile/screenshots/`; o relatório de aprovação é `docs/RPGUI_MOBILE_03A_VISUAL_APPROVAL_REPORT.md`.

É validação dos protótipos estáticos, não homologação visual de páginas de produção nem teste em aparelhos físicos. Alguns estados foram avaliados em renderização/screenshot; não se afirma teste de interação real em touch.

## 12. Problemas funcionais investigados

### Criar coleção

O fluxo estático é coerente: submit, validação, loading, POST e tratamento de erro. Não há base para afirmar causa. Reproduzir em dispositivo autorizado, registrar resposta de rede/feedback e medir visibilidade do botão antes de mudar o fluxo.

### Reviews

`createDraft` antecede a abertura do editor; falha na persistência impede essa transição e exibe mensagem. IndexedDB e secure context são condições de disponibilidade observáveis no código. É hipótese, não confirmação do problema real no aparelho. Próxima investigação deve registrar navegador, secure context, quota e disponibilidade da API sem manipular dados reais.

### Menu contextual

Handler confirmado para `contextmenu`; long press não é contrato implementado pelo componente. Recomenda-se `…` explícito, conservando botão direito em desktop e preservando a ação de abrir detalhes.

## 13. Recomendações por página

As decisões do PDF e os componentes correspondentes constam na íntegra em `docs/RPGUI_MOBILE_PDF_TRACEABILITY.md`. Prioridades principais:

- Home/Menu/Atividade: título, header, backdrop/foco, busca compacta e filtros progressivos.
- Catálogo: ações compactas, filtros densos; manter duas colunas de plataformas apenas onde couberem.
- Novo jogo/modais: inputs flexíveis, busca compacta, estado de review diagnosticado separadamente.
- Backlog/Coleções: lista mobile ou tabela com overflow deliberado; contexto por `…`; corrigir alvos de coleção.
- Top 10/Game modal: quatro ações preservadas, área do título ampliada, `framed-grey`/plano e fechar persistente.

## 14. Rastreabilidade dos requisitos

Os 14 IDs do PDF estão cobertos por matriz com página, descrição, evidência, componente, solução, dependências, prioridade, etapa, aceite e status em `docs/RPGUI_MOBILE_PDF_TRACEABILITY.md`. Os requisitos funcionais sem causa confirmada são marcados como hipótese e não como bug reproduzido.

## 15. Roadmap

Plano completo em `docs/RPGUI_MOBILE_IMPLEMENTATION_PLAN.md`:

0. Diagnóstico funcional e navegação.
1. Fundação dos primitivos/tokens mobile.
2. Shell, Home, busca e Atividade.
3. Backlog, Coleções e Top 10.
4. Formulários, catálogo e modais.
5. Homologação e atualização da rastreabilidade.

Cada etapa tem escopo, arquivos, exclusões, testes e critérios. O documento não autoriza começar a implementação.

## 16. Compatibilidade desktop

Não substituir fonte globalmente, nem editar vendor. A proposta mantém variante tradicional como default e adiciona compactação mobile condicionada. A validação dos protótipos inclui 768 e 1366px; isso verifica apenas que os documentos de protótipo não transbordam, não que produção permaneça visualmente idêntica após futura implementação.

## 17. Testes e validações

- Validação MOBILE-03A com Chrome/Playwright: 30/30 combinações sem overflow, alvos pequenos/offscreen, falhas de fonte ou erros de console; navegação e foco exercitados.
- 24 capturas full-page persistidas em seis larguras para os quatro protótipos comparativos.
- `git diff --check`: executado sem erros após a edição final.
- Inventário de arquivos e status final: executados.
- Nenhum teste de produção, API, banco ou dispositivo físico foi executado; não foi necessário para o escopo documental.

## 18. Limitações

- Não se executou login ou reprodução em aparelho do proprietário.
- Não se validou touch real, leitor de tela, rotação física, teclado virtual iOS/Android, safe areas em aparelho ou zoom 200% em produção.
- O comportamento final do payload de nota precisa ser conferido para o snippet HOME-03.
- A busca por nome de coleção depende de confirmar suporte existente; não se presume endpoint.
- A captura de protótipo não certifica contraste WCAG; valores são tokens propostos a validar.
- Prototipação não altera nem testa bundle de produção.

## 19. Estado final da worktree

Arquivos criados nesta tarefa:

- `docs/RPGUI_MOBILE_DESIGN_SYSTEM_PROPOSAL.md`
- `docs/RPGUI_MOBILE_PDF_TRACEABILITY.md`
- `docs/RPGUI_MOBILE_IMPLEMENTATION_PLAN.md`
- `docs/RPGUI_MOBILE_ARCHITECTURE_AND_PROTOTYPE_REPORT.md`
- `docs/RPGUI_MOBILE_03A_VISUAL_APPROVAL_REPORT.md`
- `docs/prototypes/rpgui-mobile/` e seus HTML/CSS/fontes locais.
- `docs/prototypes/rpgui-mobile/screenshots/` (24 capturas e resultados de validação).

Os arquivos preexistentes registrados no início foram preservados. Nenhum arquivo de página/componente de produção, API, schema, configuração, dependência, lockfile, `.env` ou vendor foi alterado.

## 20. Questões que exigem aprovação

1. Aprovar sprite golden compacto sem ornamentos laterais e escolher altura pintada após comparar 28/32/36/40px; manter alvo ≥44px.
2. Aprovar a política tipográfica mobile sem criar preferência “Automático”; definir precedência com as preferências existentes.
3. Aprovar redução/remoção de molduras por região.
4. Aprovar gatilho `…` para ações contextuais.
5. Escolher card/lista ou tabela rolável para cada superfície mobile.
6. Aprovar snippet de notas no feed e limite de 100 caracteres.
7. Definir busca de coleções somente após auditoria de API/fluxo existente.
8. Definir experiência de review quando IndexedDB estiver indisponível.

**Conclusão:** MOBILE-02 entregou arquitetura, especificação, protótipos isolados, rastreabilidade, diagnóstico estático inicial e plano incremental. Nenhuma implementação nas páginas reais foi iniciada. É necessária aprovação explícita do proprietário antes de abrir qualquer fase de produção.
