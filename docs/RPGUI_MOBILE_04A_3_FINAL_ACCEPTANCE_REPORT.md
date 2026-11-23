# RPGUI MOBILE-04A.3 — Relatório final de aceite

**Data:** 23/11/2026  
**Escopo:** correção de clipping na Home em 320 px, distribuição desktop medida, matriz mobile autenticada, triagem E2E e auditoria HYDRATION-01.  
**Veredito:** **PARCIAL — NÃO RECOMENDADO PARA PUBLICAÇÃO**

### Baseline, autorização e ambiente

- Autorização do proprietário: preservar integralmente o design RPGUI dos cards; ajustar apenas o espaçamento **externo** da Home até 359 px; medir os breakpoints da grade.
- Baseline: branch `main`, `HEAD` e `origin/main` em `7ed633832f05c53c77f4d48833e68129717c9b19`.
- Índice inicialmente sem staging. A worktree já continha mudanças MOBILE-04A e documentos/alterações paralelas; foram preservados.
- Nenhum `AGENTS.md` foi encontrado na árvore do repositório.
- Validação isolada: Node `v24.22.3`, pnpm `11.3.0`, Chrome local, MongoDB de replica set efêmera e usuário/dados sintéticos. Build e Playwright ocorreram na cópia temporária `%LOCALAPPDATA%\Temp\opencode\mobile04a1-validation-20261122-231019`, sem reutilizar `.next` do checkout, `.env`, credenciais reais ou dados de produção.
- Nenhuma dependência foi instalada nesta fase.

## Resumo executivo

O clipping observado em 320 px foi resolvido exclusivamente com espaçamento externo autorizado: a margem inline de `.ss-home-content` passa a `-12px` até 359 px. A medição autenticada passou a mostrar a Home de x=15 a x=305 em viewport 320, mantendo 15 px até cada borda física. O conteúdo interno do card aumentou de 212 px para 236 px, suficiente para o maior título medido, sem overflow horizontal ou clipping.

A grade usa quatro colunas somente a partir de 1680 px. Quatro colunas em 1536 px foram rejeitadas pela medição: a área interna hipotética de 223,4 px não comporta o título “Estatísticas” (~230,4 px). Em 1600 px, quatro colunas dariam 238,8 px internos, ainda abaixo do maior título, “Minhas Listas” (~249,6 px). Em 1680 px, a largura interna sobe a 258 px, deixando cerca de 8 px de margem para o título mais largo. Até 1679 px permanecem três colunas.

A matriz visual autenticada passou em 22 viewports, com feed sintético curto e longo, usuário de nome longo, busca, navegação Home, dimensões do alvo de busca e erros de runtime. Os três testes mobile de interação passaram quando executados isoladamente após o setup de autenticação. Na execução ordenada anterior, o teste de logout revogava a sessão compartilhada antes desses casos. As duas falhas de heading do Dashboard também foram atribuídas a expectativa incompatível com a rota: a página autenticada responde 200 e apresenta “Estatísticas”, não um heading “Dashboard”.

HYDRATION-01 continua **inconclusivo**. O teste original foi executado sem remover asserções: três larguras falharam na comparação de serialização de fontes. Em uma repetição instrumentada, 390 px registrou `first-paint` em 308 ms após bootstrap CSSOM em 95,3 ms; 768 e 1366 px não forneceram entradas de paint. Outra captura headful também retornou entradas vazias. A amostra única não satisfaz a prova em todas as condições nem remove a falha anterior às asserções finais.

## Alterações de produção

Arquivos modificados:

- `app/(app)/home/page.tsx`: classe de escopo para a Home e grade base de 1/2/3 colunas nos breakpoints existentes, sem `!grid-cols-4`.
- `app/rpgui-mobile.css`: margem externa de `-12px` até 359 px e regra de quatro colunas a partir de 1680 px, escopada à grade Home.

Não foram alterados fontes, tamanhos tipográficos, molduras, sprites, cores, padding interno, textos, estrutura ou comportamento dos cards.

### Medição do clipping em 320 px

| Medida | Antes | Depois |
|---|---:|---:|
| Home | x=27, largura 266 px | x=15, largura 290 px |
| Distância até as bordas físicas | 27 px | 15 px de cada lado |
| Largura interna do card | 212 px | 236 px |
| Largura natural de “Estatísticas” | ~230,4 px | ~230,4 px |
| Clipping do título | ~18 px | nenhum |
| Overflow horizontal do documento | 0 px | 0 px |

O ajuste só aumenta o espaço exterior disponível; os 15 px residuais até cada borda física foram mantidos.

### Matriz responsiva

Chrome local, sessão de auditoria autenticada, banco MongoDB local efêmero e build isolado com Node 24. A matriz inclui todos os dez viewports exigidos e doze larguras exploratórias/de fronteira.

| Viewport | Colunas | Card externo / interno (px) | Título natural mais largo | Clipping / overflow |
|---:|---:|---:|---:|---|
| 320×568 | 1 | 290 / 236 | 249,6 px (quebra em linhas) | Não / 0 px |
| 360×800 | 1 | 306 / 252 | 249,6 px | Não / 0 px |
| 390×844 | 1 | 336 / 282 | 249,6 px | Não / 0 px |
| 412×915 | 1 | 358 / 304 | 249,6 px | Não / 0 px |
| 768×1024 | 1 | 444,6 / 390,6 | 249,6 px | Não / 0 px |
| 820×1024 | 1 | 490,5 / 436,5 | 249,6 px | Não / 0 px |
| 900×1024 | 1 | 562,1 / 508,1 | 249,6 px | Não / 0 px |
| 1024×768 | 2 | 329,6 / 275,6 | 249,6 px | Não / 0 px |
| 1152×800 | 2 | 388,9 / 334,9 | 249,6 px | Não / 0 px |
| 1280×800 | 3 | 294,0 / 240,0 | 249,6 px (quebra em linhas) | Não / 0 px |
| 1366×768 | 3 | 321,2 / 267,2 | 249,6 px | Não / 0 px |
| 1440×900 | 3 | 344,6 / 290,6 | 249,6 px | Não / 0 px |
| 1536×900 | 3 | 375,2 / 321,2 | 249,6 px | Não / 0 px |
| 1599×900 | 3 | 395,4 / 341,4 | 249,6 px | Não / 0 px |
| 1600×900 | 3 | 395,7 / 341,7 | 249,6 px | Não / 0 px |
| 1632×900 | 3 | 406,0 / 352,0 | 249,6 px | Não / 0 px |
| 1640×900 | 3 | 408,5 / 354,5 | 249,6 px | Não / 0 px |
| 1664×900 | 3 | 416,3 / 362,3 | 249,6 px | Não / 0 px |
| 1679×900 | 3 | 421,1 / 367,1 | 249,6 px | Não / 0 px |
| 1680×900 | 4 | 312,0 / 258,0 | 249,6 px | Não / 0 px |
| 1920×1080 | 4 | 370,1 / 316,1 | 249,6 px | Não / 0 px |

Os quatro títulos mediram aproximadamente 192,0; 230,4; 249,6; e 230,4 px. Todos os cards mantiveram fonte pixelada de 19,2 px, classe/moldura/sprite RPGUI original e padding interno de 27 px por lado. Em 320 px, “Minhas Listas” usa quebra de linha natural, sem corte. A lupa mediu 44×44 px. O feed autenticado recebeu duas atividades sintéticas (título curto e título longo) e o usuário tinha nome longo; busca por Enter e pela lupa, navegação dos cards, menu/drawer e Escape passaram sem erros de página. As capturas antes/depois e logs estão na cópia isolada em `%LOCALAPPDATA%\Temp\opencode\mobile04a1-validation-20261122-231019`.

## Triagem E2E

As falhas foram reproduzidas sem mascarar testes ou alterar funcionalidade do produto.

| Falha | Resultado da triagem |
|---|---|
| Dashboard procura heading `/dashboard` (`e2e-adverse`, `e2e-search`) | Expectativa incompatível com a interface/rota. Com sessão válida, `/api/auth/me` e `/dashboard` responderam 200; a página exibe “Estatísticas”, não “Dashboard”. |
| Busca mobile não encontra o input | Passou na reprodução isolada autenticada; a sessão compartilhada havia sido invalidada pela ordem anterior do suite. |
| Menu mobile não encontra o botão | Passou na reprodução isolada autenticada, incluindo abertura/fechamento por toque/Escape e alvo acessível. |
| Editor mobile não encontra “Novo rascunho” | Passou na reprodução isolada autenticada, criando rascunho e usando o editor sem overflow. |
| `e2e-auth` — locator de senha ambíguo | Problema do seletor: corresponde ao campo e ao botão de mostrar senha; não relacionado à Home. |
| `e2e-auth` — captura de e-mail | Dependência/ambiente: captura de e-mail não configurada. |
| Três asserções de busca IGDB | Ambiente isolado usa credenciais sintéticas; integração IGDB/Twitch não está configurada. |

O conjunto histórico reportou 81 aprovados e 10 falhas; a execução sequencial continha também as três falhas mobile descritas acima. A execução isolada de mobile, após setup novo, concluiu **4/4** (setup e os três casos). A auditoria autenticada reproduzível do Dashboard confirmou a causa das duas expectativas incorretas. Nenhum teste foi removido ou enfraquecido.

As falhas mobile não foram reproduzidas contra o commit-base em uma segunda cópia equivalente; a atribuição ao estado compartilhado do teste de logout decorre da ordem observada no log e da aprovação dos mesmos fluxos após novo setup autenticado. Não há regressão da MOBILE-04A reproduzida nesses fluxos, mas a suíte global original continua não sendo um sinal verde até que seja executada com setup isolado e contratos de seletor válidos.

## HYDRATION-01

- O teste original `tests/hydration-preferences.spec.ts` foi executado em 390, 768 e 1366 px mantendo suas asserções.
- As três larguras falharam na comparação entre fontes: CSSOM/estilo computado serializa `"Roboto","Roboto Fallback", system-ui, sans-serif`, enquanto a expectativa normalizada é `Roboto, Roboto Fallback, system-ui, sans-serif`.
- Em uma repetição instrumentada do teste original, 390 px registrou `first-paint` e `first-contentful-paint` em 308 ms; a escrita do bootstrap CSSOM foi observada em 95,3 ms na mesma navegação. Em 768 e 1366 px, as entradas ficaram vazias.
- Outra captura Chromium headful/CDP confirmou suporte declarado a `"paint"` em `PerformanceObserver.supportedEntryTypes`, mas não retornou entradas utilizáveis. A observação não é consistente entre execuções/larguras.
- A execução original continua falhando nas três larguras na comparação de serialização das fontes, antes de completar o conjunto de asserções. A evidência de 390 px é indício favorável, mas não prova integral e reproduzível para todos os viewports.
- Nenhuma asserção temporal foi removida, relaxada ou substituída por smoke CSSOM após carregamento.
- O relatório histórico `docs/HYDRATION_01_FINAL_AUDIT_REPORT.md` registra aceitação anterior baseada em evidência temporal. Esta rodada obteve uma captura positiva em 390 px, mas não a reproduziu em todas as larguras e execuções. A divergência exige investigação; por si só, não demonstra regressão causada pelas alterações responsivas MOBILE-04A.

**Resultado: inconclusivo; aceite temporal não concedido.**

## Validações

| Verificação | Resultado |
|---|---|
| Build de produção isolado, Node 24 | Aprovado |
| Typecheck | Aprovado |
| Vitest | 1544/1544 testes; 128 arquivos aprovados |
| ESLint | 0 erros; 7 warnings |
| Matriz geométrica Home autenticada | Aprovada nos 22 viewports |
| Home: busca, atalhos, menu e feed sintético | Aprovados |
| Três interações mobile direcionadas | Aprovadas em execução isolada |
| Testes direcionados Home/feed/RPGUI | 49/49 testes; 5 arquivos aprovados |
| Auditoria da rota Dashboard | Aprovada; identificada expectativa de heading incompatível |
| HYDRATION-01 temporal | Inconclusivo |
| `git -c core.whitespace=cr-at-eol diff --check` | Aprovado |

#### Investigação de whitespace

`git diff --check` sem configuração acusa linhas adicionadas em `app/(app)/home/page.tsx` e nos arquivos paralelos `features/activity/activity-feed.tsx`, `features/activity/home-feed.tsx` e `features/home/home-search-form.tsx`. `git ls-files --eol` confirma finais mistos no arquivo Home (índice e worktree) e CRLF tanto no índice quanto na worktree dos três arquivos paralelos. Não são espaços finais no conteúdo: são CRs de CRLF tratados pelo padrão de whitespace do Git. `git -c core.whitespace=cr-at-eol diff --check` concluiu sem erros. Nenhum arquivo foi normalizado em massa; as alterações paralelas não foram tocadas. Portanto, a falha padrão foi classificada como configuração de interpretação de EOL, não como whitespace inválido introduzido.

#### Critérios de aceite

| Categoria | Estado | Fundamentação |
|---|---|---|
| A. Responsividade | **APROVADO** | Títulos, molduras e cards sem clipping/overflow nos 22 viewports; 320 px mantém 15 px de respiro físico. |
| B. Funcionalidade | **APROVADO** | Busca por Enter e lupa, parâmetro `search`, atalhos, feed sintético longo, menu mobile e editor passaram nos testes direcionados. |
| C. E2E | **APROVADO COM FALHAS EXTERNAS CLASSIFICADAS** | Os três casos mobile passaram com setup novo; a sessão compartilhada/logout explica a execução sequencial. Dashboard retorna 200 e mostra “Estatísticas”; seletor/contrato de heading é incompatível. Demais falhas são ambiente/harness. |
| D. Hidratação | **INCONCLUSIVO** | A prova temporal não pôde ser reproduzida; divergência com o relatório histórico permanece sem evidência de regressão MOBILE-04A. |
| E. Integridade | **APROVADO COM LIMITAÇÕES DOCUMENTADAS** | Vitest, typecheck, ESLint (sem erros), build isolado e diff com tratamento CRLF passaram; o `diff --check` padrão ainda reporta CRLF válido. |

## Estado do repositório e decisão

Arquivos de produção desta correção: `app/(app)/home/page.tsx` e `app/rpgui-mobile.css`. A worktree também conserva alterações paralelas preexistentes em `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md`, `features/activity/activity-feed.tsx`, `features/activity/home-feed.tsx` e `features/home/home-search-form.tsx`, além de relatórios/documentos não rastreados já presentes: `DASHBOARD_STATISTICS_REDESIGN_PROPOSAL`, `GIT_DIVERGENCE_AUDIT`, `HYDRATION_01_RELEASE_REPORT`, `MOBILE_01_FULL_UX_AUDIT`, `MOBILE_01_VIEWPORT_PUBLICATION_REPORT`, `MOBILE_DYNAMIC_VIEWPORT_FIX_REPORT`, `RC06_1_ISOLATED_RECONSTRUCTION_REPORT`, `RC06_2_MAIN_SYNC_REPORT`, `RC06_MAIN_SYNC_PREPARATION_REPORT`, `RC07_GRID_DENSITY_PUBLICATION_REPORT`, `RPGUI_MOBILE_03A_WINDOWS_PUBLICATION_REPORT`, `RPGUI_MOBILE_03B_FINAL_RELEASE_REPORT`, `RPGUI_MOBILE_03B_NODE24_RELEASE_REPORT`, `RPGUI_MOBILE_03B_RELEASE_VALIDATION_REPORT`, `RPGUI_MOBILE_03C_FINAL_RELEASE_REPORT`, `RPGUI_MOBILE_04A_1_VALIDATION_REPORT`, `RPGUI_MOBILE_04A_2_FINAL_REVIEW_REPORT` e `RPGUI_MOBILE_04A_HOME_SEARCH_REPORT`.

Branch `main`; `HEAD` e `origin/main` permanecem em `7ed633832f05c53c77f4d48833e68129717c9b19`. Não há alterações staged. Relatórios e alterações paralelas já existentes foram preservados. A validação e o build foram feitos em cópia temporária, sem sobrescrever `.next` do checkout. Nenhum staging, commit, push, publicação ou deploy foi realizado.

**PARCIAL — NÃO RECOMENDADO PARA PUBLICAÇÃO.**

A correção visual autorizada em 320 px e os breakpoints medidos estão aceitos. A publicação permanece bloqueada porque HYDRATION-01 não comprovou a condição temporal exigida e a execução E2E global ainda inclui falhas de ambiente/seletor e testes com expectativa de heading incompatível. Não modificar fontes, conteúdo ou asserções para contornar esses bloqueios sem autorização específica.
