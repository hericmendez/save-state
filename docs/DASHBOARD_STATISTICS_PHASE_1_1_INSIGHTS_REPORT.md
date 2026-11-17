# Save State — Fase 1.1: Insights da Biblioteca

## 1. Resumo executivo

A página **Estatísticas** (`/dashboard`) passou a abrir com a seção **Descobertas da biblioteca**, alimentada por um motor determinístico e puro que produz no máximo três observações sustentadas pelos dados pessoais do usuário. Os quatro módulos da Fase 1 foram preservados e enriquecidos com percentuais, denominadores explícitos, cobertura de avaliações separada da distribuição de notas, participação de cada jogo no total de horas e distinção entre status Finalizado e contador de conclusões.

Toda a agregação continua no servidor. O navegador recebe apenas o view model agregado; nenhum `UserGame` individual é enviado, nenhuma consulta por jogo foi adicionada, nenhum schema persistido, índice, dependência ou lockfile foi alterado. A identidade RPGUI, as barras customizadas aprovadas, a rota `/dashboard` e a navegação “Estatísticas” foram mantidas.

A implementação foi validada por TypeScript, testes direcionados, suíte completa (125 arquivos, 1.511 testes), ESLint e build de produção local. A homologação visual autenticada permanece **NÃO EXECUTADA** por ausência de sessão e banco E2E previamente autorizados. Não houve commit, push ou deploy.

## 2. Veredito da implementação

**Fase 1.1 implementada localmente e tecnicamente validada; homologação visual pendente.**

Os critérios de aceite funcionais e técnicos verificáveis sem sessão autenticada foram atendidos. O veredito visual permanece **INCONCLUSIVO**, pelas mesmas razões registradas na Fase 1: não há credencial, sessão de auditoria nem opt-in para o banco efêmero de testes. Nenhuma autenticação foi contornada e nenhum banco foi limpo ou semeado.

## 3. Estado inicial da worktree

Antes de qualquer alteração desta fase:

- Branch `main`, `HEAD` em `dcf695deeeeb19775e1a8f2cc959723b50ddf03b` (`perf(igdb): improve request resilience and cancellation`), idêntico a `origin/main`.
- **12 arquivos rastreados modificados preexistentes**, todos preservados:
  - `app/(app)/dashboard/loading.tsx`
  - `app/(app)/dashboard/page.tsx`
  - `app/(app)/home/page.tsx`
  - `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md`
  - `features/dashboard/dashboard.tsx`
  - `features/home/home-metrics.ts`
  - `features/navigation/nav-structure.ts`
  - `server/stats/service.ts`
  - `tests/dashboard-view.test.ts`
  - `tests/home-redesign.test.ts`
  - `tests/navigation.test.ts`
  - `tests/reads/stats.test.ts`
- **8 arquivos não rastreados preexistentes**, todos preservados:
  - `docs/DASHBOARD_STATISTICS_PHASE_1_IMPLEMENTATION_REPORT.md`
  - `docs/DASHBOARD_STATISTICS_PHASE_1_VISUAL_VALIDATION.md`
  - `docs/DASHBOARD_STATISTICS_REDESIGN_PROPOSAL.md`
  - `docs/GIT_DIVERGENCE_AUDIT.md`
  - `docs/RC06_1_ISOLATED_RECONSTRUCTION_REPORT.md`
  - `docs/RC06_2_MAIN_SYNC_REPORT.md`
  - `docs/RC06_MAIN_SYNC_PREPARATION_REPORT.md`
  - `docs/RC07_GRID_DENSITY_PUBLICATION_REPORT.md`
- Staging vazio. Nenhum comando Git destrutivo foi executado.
- Documentação lida integralmente: `AGENTS.md`, `docs/DASHBOARD_STATISTICS_REDESIGN_PROPOSAL.md`, `docs/DASHBOARD_STATISTICS_PHASE_1_IMPLEMENTATION_REPORT.md` e `docs/DASHBOARD_STATISTICS_PHASE_1_VISUAL_VALIDATION.md`.

## 4. Arquivos criados e modificados

### Criados

- `features/dashboard/statistics-format.ts` — formatação pura pt-BR (percentual, inteiro, hora, nota exata, média derivada, pluralização).
- `features/dashboard/statistics-insights.ts` — motor determinístico de descobertas (regras A–F, prioridade, deduplicação, limite).
- `features/dashboard/library-insights.tsx` — seção “Descobertas da biblioteca” (Server Component, sem estado de cliente).
- `tests/dashboard-insights.test.ts` — 21 testes do motor e da formatação.
- `docs/DASHBOARD_STATISTICS_PHASE_1_1_INSIGHTS_REPORT.md` — este relatório.

### Modificados nesta fase

- `server/stats/service.ts` — extensão controlada de `PersonalStatistics` e do `$facet` de `getPersonalStatistics`. `getGameStats` não foi tocado.
- `features/dashboard/dashboard.tsx` — quatro módulos enriquecidos e inclusão da seção de descobertas acima da grade.
- `tests/dashboard-view.test.ts` — contrato da view atualizado para a seção de descobertas e para os novos elementos contextuais.
- `tests/reads/stats.test.ts` — cobertura dos novos agregados, de interseções independentes, de favoritos e de biblioteca vazia.

### Preexistentes não alterados nesta fase

Os demais arquivos modificados e não rastreados listados na seção 3 permaneceram intocados, incluindo a alteração anterior em `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md`, os relatórios da Fase 1 e os relatórios RC06/RC07.

## 5. Arquitetura do motor de insights

Fluxo preservado e estendido:

```text
Server Component (/dashboard)
        ↓
getPersonalStatistics(session.id)
        ↓
MongoDB — uma agregação $facet filtrada por userId
        ↓
PersonalStatistics (view model agregado)
        ↓
buildLibraryInsights(stats)  ← função pura
        ↓
LibraryInsights + quatro módulos (RPGUI)
```

- `features/dashboard/statistics-insights.ts` não importa React, Mongoose, `server-only` nem faz I/O. Recebe um contrato estrutural (`InsightInput`) compatível com `PersonalStatistics`, o que permite testá-lo sem banco.
- `features/dashboard/library-insights.tsx` é um Server Component. Não há `"use client"`, estado, efeito ou fetch no navegador.
- O componente não consulta o banco: reutiliza o objeto já carregado pela página.
- `Statistics`/contagens nunca são recalculadas no cliente.

## 6. Regras implementadas e justificativas

### Insight A — Concentração do Backlog

- **Elegibilidade:** `totalGames >= 5` e `backlog / totalGames > 0,8` (estritamente maior).
- **Texto:** percentual da biblioteca no Backlog e a fração exata (`N de M jogos`).
- **Justificativa:** é uma contagem simples, com denominador único e sem inferência. Não é apresentada como dívida, problema ou comportamento negativo.
- O limiar de 80% é heurística de UX, não fato estatístico.

### Insight B — Cobertura de avaliações

- **Elegibilidade:** `totalGames >= 5`, `ratedGames > 0` e `ratedGames / totalGames < 0,25`.
- **Texto:** cobertura percentual, numerador/denominador e, quando existe média, a ressalva de que ela considera apenas os jogos com nota.
- **Justificativa:** `rating` ausente é diferente de nota `0`. `ratedGames` conta apenas ratings numéricos; zero é avaliação válida. Quando não há nenhuma avaliação, o módulo exibe seu estado vazio em vez de fabricar uma descoberta de “0,0%”.

### Insight C — Concentração de horas

- **Elegibilidade:** `gamesWithHours >= 2`, `totalHours >= 10` e maior jogo com `> 70%` do total.
- **Texto:** nome do jogo, horas dele e total de horas informadas.
- **Justificativa:** horas registradas são um dado pessoal declarado; o texto descreve concentração, não preferência. `hoursPlayed === 0` não é tratado como prova de que o jogo nunca foi jogado.

### Insight D — Finalizados sem contador correspondente

- **Elegibilidade:** `finishedWithoutCompletion >= 1`.
- **Cálculo:** interseção real `status === "finished" && timesFinished === 0`, computada documento a documento no `$group`. **Não** é subtração entre totais.
- **Texto:** quantidade exata, total no status Finalizado e explicação de que status e contador são campos independentes, sem sugerir erro de cadastro.

### Insight E — Avaliações entre finalizados

- **Elegibilidade:** `finishedGames >= 5`, `finishedRated > 0` e `finishedRated < finishedGames`.
- **Justificativa:** amostra mínima e resultado não trivial. O cruzamento usa `status === "finished"` e `rating` numérico; `timesFinished` não substitui o status.

### Insight F — Favoritos sem avaliação

- **Elegibilidade:** `favoriteGames >= 2` e `favoriteUnrated >= 1`.
- **Texto:** quantos favoritos não têm nota, deixando explícito que favorito e avaliação são marcações independentes.
- **Justificativa:** evita comparação de médias com amostras pequenas; apenas descreve a presença/ausência dos dois campos.

## 7. Regras avaliadas e eventualmente adiadas

- **Insight G — Horas e avaliações:** **adiado**. Exigiria cruzar por jogo os maiores valores de horas com os maiores ratings. Com empates, a definição de “mais bem avaliado” fica ambígua, e uma conclusão desse tipo tem baixo valor frente ao custo de tornar o ranking dependente de desempate arbitrário. Não foi implementado coeficiente de correlação nem linguagem de tendência.
- **Comparação de médias entre favoritos e não favoritos:** adiada por fragilidade amostral e risco de sugerir preferência.
- **Faixas de rating:** não implementadas. A Fase 1 aprovou distribuição por valor exato; agrupar mudaria a semântica e exigiria decisão de produto separada.
- **Sincronização de `status`, `finished` e `timesFinished`:** deliberadamente não feita. Os campos têm semânticas distintas.

## 8. Fórmulas, denominadores e critérios de elegibilidade

| Métrica | Fórmula / fonte | Denominador exibido |
|---|---|---|
| Total da biblioteca | contagem de `UserGame` do `userId` | — |
| Participação por status | `count(status) / totalGames` | total de jogos |
| Cobertura de avaliações | `ratedGames / totalGames` | total da biblioteca |
| Distribuição de notas | `count(rating) / ratedGames` | jogos avaliados |
| Nota média | `$avg` sobre `rating` numérico; `null` se não houver | jogos avaliados |
| Total de horas | `$sum: "$hoursPlayed"` | — |
| Jogos com horas | `hoursPlayed > 0` | — |
| Participação de horas | `horasDoJogo / totalHours` | total de horas registradas |
| Total de conclusões | `$sum: "$timesFinished"` | — |
| Jogos com conclusões | `timesFinished > 0` | — |
| Jogos finalizados | `status === "finished"` | — |
| Finalizados sem contador | `status === "finished" && timesFinished === 0` | — |
| Finalizados avaliados | `status === "finished" && rating numérico` | jogos finalizados |
| Favoritos sem nota | `favorite === true && rating não numérico` | jogos favoritos |

Limiares centralizados em `LIBRARY_INSIGHT_THRESHOLDS`:

```text
minLibraryForShare = 5
backlogShare = 0.8
maxRatingCoverage = 0.25
minGamesWithHours = 2
minTotalHours = 10
hoursDominance = 0.7
minFinishedForRatingInsight = 5
minFavoritesForRatingInsight = 2
```

Percentuais de apresentação usam uma casa decimal em pt-BR. Contagens não são arredondadas. Ratings individuais usam o valor exato (`8,25`, `0`, `9`); apenas a média derivada é exibida com uma casa decimal, por ser um valor calculado e não persistido.

## 9. Alterações visuais dos quatro módulos

### Status da biblioteca

- Status com quantidade positiva aparecem primeiro, ordenados por quantidade decrescente e, em empate, pela ordem canônica dos dez status.
- Cada linha mostra rótulo, quantidade e percentual (`30 · 88,2%`).
- Barras permanecem proporcionais ao maior status positivo, com rótulo acessível.
- Status vazios deixam de dominar a tela e ficam em um `<details>` nativo (“Mostrar outros N status”), sem interação client-side.
- O total continua visível.

### Distribuição de notas

- A **cobertura** ganhou bloco próprio: `avaliados de total`, `Cobertura: %`, barra de cobertura e `N jogos sem nota`.
- A **distribuição** permanece por valor exato, agora com o universo explicitado (`Distribuição das notas registradas (N jogos avaliados)`), percentual por nota e barra relativa ao maior valor da distribuição.
- A média, quando existe, aparece com denominador claro (`entre N jogos avaliados`).

### Mais horas registradas

- Cabeçalho com total de horas e quantidade de jogos com horas positivas.
- Ranking Top 5 com horas e participação percentual no total registrado.
- Barras representam participação no total de horas, não uma escala ambígua.
- Quando há mais de cinco jogos elegíveis, o módulo informa que é um Top 5 e que as participações exibidas não somam 100%.
- Jogos órfãos continuam como “Jogo indisponível”.

### Mais conclusões registradas

- Cabeçalho com soma de `timesFinished` e quantidade de jogos com contador positivo.
- Top 5 em formato `N×`.
- Contexto separado informa quantos jogos estão atualmente no status Finalizado.
- Nota discreta explica que contador e status são independentes e que a diferença não indica erro de cadastro.
- Pluralização correta para conclusão/conclusões e jogo/jogos.

### Descobertas da biblioteca

- Até três cartões compactos, com título curto, descrição observacional e valores reais no texto.
- Sem ícones, sem KPIs duplicados, sem alturas fixas.
- Quando nenhuma regra é elegível, mostra um estado informativo único, sem preencher espaço com frases artificiais.

## 10. Estratégia de priorização e deduplicação

1. Todas as regras são avaliadas sobre o mesmo objeto agregado.
2. Apenas regras elegíveis entram na lista.
3. Descobertas são deduplicadas por `category`; o motor nunca emite duas observações da mesma categoria.
4. A ordenação é determinística: `priority` numérica ascendente (A=1 … F=6) e `id` como desempate estável.
5. O resultado é limitado a `MAX_LIBRARY_INSIGHTS = 3`.
6. Não há aleatoriedade, `Math.random`, ordenação dependente de locale ou seleção por horário.

Consequência: se A, B e C forem elegíveis, D, E e F não aparecem, mesmo que também sejam verdadeiros. Isso mantém a seção curta e evita repetir a mesma leitura da biblioteca com quatro ângulos semelhantes.

## 11. Tratamento de amostras pequenas

- Regras proporcionais exigem pelo menos 5 jogos.
- Concentração de horas exige pelo menos 2 jogos com horas e 10 horas totais.
- Avaliações entre finalizados exigem pelo menos 5 jogos finalizados.
- Favoritos exigem pelo menos 2 favoritos.
- Nenhuma média é comparada entre subgrupos pequenos.
- Com amostra insuficiente, a seção mostra o estado informativo; nenhuma conclusão é inferida.

## 12. Tratamento de valores ausentes e registros órfãos

- `rating` ausente/nulo não é convertido em zero. A agregação usa a expressão de tipo BSON (`double`, `int`, `long`, `decimal`) para contá-lo como avaliação somente quando numérico.
- `rating === 0` é contado e exibido como nota válida.
- `hoursPlayed` ausente contribui com zero na soma, mas não é interpretado como “nunca jogado”.
- `timesFinished` ausente é tratado como zero apenas para a interseção do Insight D, preservando a semântica do campo.
- Registros `UserGame` órfãos continuam nas contagens, status, notas, horas e conclusões; o lookup de título ocorre só nos Top 5 e o nome substituto é “Jogo indisponível”.
- Todas as consultas são filtradas por `userId`; nenhum cruzamento usa documentos de outro usuário.

## 13. Acessibilidade e responsividade

- Um `h1` (“Estatísticas”), `h2` por seção e `h3` por descoberta.
- Barras usam `role="img"` com `aria-label` contendo rótulo, quantidade e percentual; os mesmos valores aparecem como texto, sem depender de cor.
- Status vazios usam `<details>`/`<summary>` nativos, navegáveis por teclado, sem JavaScript de cliente.
- Layout `grid-cols-1` por padrão e `lg:grid-cols-2` para os módulos; descobertas em uma coluna no mobile, duas em `sm` e três em `lg`.
- `items-start` evita esticar painéis curtos para igualar vizinhos; `min-w-0` e `break-words` reduzem risco de overflow com nomes longos.
- Não foram introduzidas animações, hover obrigatório ou conteúdo apenas visual.

## 14. Performance e consultas

- Continua existindo **uma** chamada de agregação por carregamento de `/dashboard`.
- A extensão foi feita no `$facet` já existente: um `$group` adicional no ramo `totals`, sem novo `$lookup`, sem consulta por jogo e sem índice novo.
- O `$lookup` de `GlobalGame` permanece restrito aos Top 5 de horas e conclusões.
- O navegador recebe somente o view model agregado; nenhuma lista de `UserGame` é serializada.
- `getGameStats` e seu contrato público não foram alterados.
- Nenhum schema persistido, migration, seed, dependência ou lockfile foi modificado.

## 15. Resultados completos dos testes

| Verificação | Comando | Resultado |
|---|---|---|
| TypeScript | `pnpm exec tsc --noEmit` | Passou (exit 0) |
| Testes direcionados (dashboard + regressões próximas) | `pnpm exec vitest run tests/home-redesign.test.ts tests/navigation.test.ts tests/reads/stats.test.ts tests/dashboard-view.test.ts tests/dashboard-insights.test.ts` | **5 arquivos, 73 testes passaram** |
| Suíte completa | `pnpm test` | **125 arquivos, 1.511 testes passaram, 0 falhas** |
| ESLint | `pnpm lint` | 0 erros; **7 warnings preexistentes** |
| Build | `pnpm build` | Passou (exit 0) |
| Whitespace | `git -c core.whitespace=cr-at-eol diff --check` | Passou (exit 0) |

Cobertura nova inclui: biblioteca vazia, um jogo, limite de backlog, cobertura de avaliações, rating zero, ratings fracionários, concentração de horas, horas zero, interseção de Finalizado sem contador, conclusões em outro status, favoritos sem nota, amostras pequenas, ausência de descobertas, prioridade determinística, limite de três, deduplicação/estabilidade, órfãos, denominadores zero, pluralização e formatação pt-BR. A suíte de leitura cobre isolamento entre usuários e os novos agregados do serviço.

Os 7 warnings de lint são os mesmos já registrados antes desta fase: `features/atp/catalog-search.tsx:210` e seis diretivas `eslint-disable` não utilizadas em `scripts/import-platform-images.mjs`.

## 16. Resultado do build

`pnpm build` concluiu com sucesso: compilação otimizada, checagem de tipos e geração das rotas, incluindo `/dashboard` (265 B de tamanho de rota e 103 kB de First Load JS). Nenhum erro novo. Permanecem apenas os avisos preexistentes de múltiplos lockfiles no workspace e de configuração do Vitest (`configLoader: 'native'`), sem relação com esta fase.

## 17. Limitações e pendências

- **NÃO VERIFICADA:** homologação visual autenticada em navegador. Não havia sessão de auditoria nem URI/opt-in para banco efêmero autorizado. Nenhuma credencial foi inventada e nenhum banco foi limpo.
- **NÃO VERIFICADA:** comportamento real de quebra de nomes longos, overflow horizontal e equilíbrio dos painéis em desktop, notebook, tablet e mobile.
- **NÃO VERIFICADO:** ganho perceptível de compreensão por usuários reais. Os insights são determinísticos e observacionais, mas não foram avaliados qualitativamente.
- **CONHECIDA:** a distribuição de notas pode ficar longa em bibliotecas com muitos valores fracionários distintos. Agrupar em faixas mudaria a semântica aprovada e não foi feito.
- **CONHECIDA:** os limiares (80%, 25%, 70%, amostras mínimas) são heurísticas de UX documentadas, não conclusões estatísticas universais.
- **CONHECIDA:** a média derivada é exibida com uma casa decimal; os ratings individuais permanecem exatos.
- Nenhuma funcionalidade da Fase 2, LLM, recomendação automática, histórico de sessões ou reformulação da Home foi iniciada.

## 18. Inspeção final do diff

- `git status --short` confirma 12 arquivos rastreados modificados (os mesmos preexistentes, com quatro deles agora contendo as alterações desta fase) e os arquivos novos desta fase, além dos documentos não rastreados preservados.
- Nenhum arquivo `.env`, lockfile, `package.json`, schema, migration ou seed foi alterado.
- `getGameStats` permanece intacto; nenhuma rota, navegação ou contrato HTTP foi alterado.
- `features/dashboard/dashboard.tsx` mantém exatamente quatro elementos `<section>` próprios; a seção de descobertas vive em componente separado e é renderizada acima da grade.
- `git -c core.whitespace=cr-at-eol diff --check` passou. Nenhuma normalização em massa de line endings foi executada; o arquivo `dashboard.tsx` preserva o CRLF do blob original.
- Não houve commit, push, merge, rebase, stash, reset, clean ou deploy.

## 19. Recomendações para homologação visual

1. Repetir a inspeção autenticada em 1920×1080, 1366×768, 768×1024 e 390×844, com uma sessão e um banco local efêmero explicitamente autorizados.
2. Preparar cenários de dados que exercitem, separadamente: biblioteca vazia; biblioteca pequena; backlog acima de 80%; cobertura de notas abaixo de 25%; um jogo dominando as horas; Finalizado com contador zero; favoritos sem nota; ratings `0`, `8,25` e valores distintos.
3. Verificar visualmente que a seção de descobertas exibe 0, 1, 2 ou 3 cartões sem espaços artificiais, e que o `<details>` de status vazios abre e fecha por teclado.
4. Confirmar que a cobertura de avaliações e a distribuição de notas são lidas como análises distintas, com seus denominadores visíveis.
5. Confirmar que as barras de horas comunicam participação no total e que o aviso de Top 5 aparece apenas quando há mais de cinco jogos elegíveis.
6. Verificar nomes longos, jogos órfãos (“Jogo indisponível”), quebra de títulos e ausência de overflow horizontal nos quatro viewports.
7. Não iniciar a Fase 2 nem publicar esta fase sem aprovação explícita.
