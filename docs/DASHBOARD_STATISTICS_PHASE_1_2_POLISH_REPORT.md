# Save State — Estatísticas: Fase 1.2 (Relevância dos Insights e Polimento Visual)

**Escopo:** implementação local da Fase 1.2 da página Estatísticas (`/dashboard`).
**Data:** 17/11/2026
**Base:** `HEAD = dcf695deeeeb19775e1a8f2cc959723b50ddf03b` (`perf(igdb): improve request resilience and cancellation`)
**Restrições respeitadas:** sem commit, push, deploy, merge, rebase, reset, stash, clean; sem instalação de dependências; sem alteração de lockfiles, `.env`, schemas persistidos, `getGameStats` ou banco de produção; sem LLM, aleatoriedade ou análise de texto livre nos insights.

---

## 1. Resumo executivo

A Fase 1.2 corrigiu o problema central apontado na inspeção da Fase 1.1: as descobertas da biblioteca repetiam, com outras palavras, percentuais já visíveis nos quatro módulos inferiores. As regras A (Backlog), B (cobertura de notas) e C (horas) ocupavam praticamente todas as posições porque o motor exibia os três primeiros resultados por prioridade fixa, independentemente de sua natureza.

A refatoração introduziu duas classificações explícitas — **relacional** e **descritiva** —, um **tema semântico** separado da categoria técnica, e uma política determinística de seleção que reserva até dois slots para descobertas relacionais e usa a terceira posição como complemento descritivo. A deduplicação passou a agir sobre categoria **e** tema, preservando cruzamentos independentes sobre o mesmo subconjunto (Finalizado × contador vs. Finalizado × avaliação).

Três ajustes visuais foram aplicados: (a) todas as barras de status passaram a usar o total da biblioteca como denominador, tornando a escala comparável entre os dez status; (b) a tipografia dos títulos das descobertas foi reduzida e reequilibrada sem truncamento; (c) o módulo Conclusões passou a apresentar contexto quantitativo real (`finishedGames` e `finishedWithoutCompletion`), complementando — sem repetir — o texto do insight D.

O aviso `1 Issue` do Next.js foi investigado com evidência de console e de DOM: trata-se de um **hydration mismatch preexistente** no elemento `<html>`, causado pelo script pré-paint de preferências de layout, reproduzível em `/login`. Não é regressão desta fase e não foi mascarado.

Validação: 46 testes direcionados, suíte completa com **126 arquivos / 1.531 testes** aprovados, `tsc --noEmit` limpo, ESLint com 0 erros (7 warnings preexistentes), build de produção local concluído e `git diff --check` com CRLF sem problemas.

---

## 2. Veredito

**Fase 1.2 tecnicamente concluída**, com uma ressalva de homologação: a validação visual autenticada continua indisponível pelo mesmo motivo da fase anterior (ausência de sessão e de infraestrutura E2E autorizadas). A verificação visual foi feita por renderização real de servidor e por contrato de markup, não por inspeção de tela logada.

| Critério de aceite | Situação |
|---|---|
| Descobertas relacionais priorizadas sobre resumos repetitivos | Atendido |
| Seleção determinística | Atendido (ordenação total por classe → prioridade → id) |
| Sem duplicação semântica desnecessária | Atendido (dedup por categoria + tema) |
| Nenhuma descoberta inventada | Atendido (todas as regras exigem dados agregados) |
| Limite de três observações preservado | Atendido (`MAX_LIBRARY_INSIGHTS = 3`, sem preenchimento artificial) |
| Barras de status com denominador na biblioteca | Atendido (`count / totalGames`, guarda de zero) |
| Distribuição de notas com valores exatos | Atendido (`count / ratedGames` inalterado) |
| Legibilidade da seção Descobertas | Atendido |
| Conclusões com contexto quantitativo | Atendido (`finishedWithoutCompletion` real) |
| `1 Issue` investigado e classificado | Atendido (preexistente, `<html>`, reproduzido em `/login`) |
| Identidade RPGUI e barras customizadas mantidas | Atendido |
| Quatro módulos funcionais | Atendido |
| Home e navegação sem regressões | Atendido (suíte de Home/navegação verde) |
| Testes aplicáveis aprovados | Atendido |
| Nenhum schema/dependência adicionado | Atendido |
| Worktree preexistente preservada | Atendido |
| Sem commit/push/deploy | Atendido |

---

## 3. Estado inicial da worktree

Estado registrado antes de qualquer modificação desta fase:

- `HEAD = dcf695deeeeb19775e1a8f2cc959723b50ddf03b`; `main == origin/main`.
- **12 arquivos rastreados modificados** (preexistentes, preservados):
  `app/(app)/dashboard/loading.tsx`, `app/(app)/dashboard/page.tsx`, `app/(app)/home/page.tsx`, `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md`, `features/dashboard/dashboard.tsx`, `features/home/home-metrics.ts`, `features/navigation/nav-structure.ts`, `server/stats/service.ts`, `tests/dashboard-view.test.ts`, `tests/home-redesign.test.ts`, `tests/navigation.test.ts`, `tests/reads/stats.test.ts`.
- **Arquivos não rastreados preexistentes (13)**: nove documentos (`DASHBOARD_STATISTICS_REDESIGN_PROPOSAL`, `..._PHASE_1_IMPLEMENTATION_REPORT`, `..._PHASE_1_VISUAL_VALIDATION`, `..._PHASE_1_1_INSIGHTS_REPORT`, `GIT_DIVERGENCE_AUDIT`, `RC06_MAIN_SYNC_PREPARATION_REPORT`, `RC06_1_ISOLATED_RECONSTRUCTION_REPORT`, `RC06_2_MAIN_SYNC_REPORT`, `RC07_GRID_DENSITY_PUBLICATION_REPORT`), o motor e seus auxiliares da Fase 1.1 (`features/dashboard/statistics-insights.ts`, `statistics-format.ts`, `library-insights.tsx`) e `tests/dashboard-insights.test.ts`.
- Artefatos da Fase 1.1 já existentes e reaproveitados: `features/dashboard/statistics-insights.ts`, `features/dashboard/statistics-format.ts`, `features/dashboard/library-insights.tsx`, `tests/dashboard-insights.test.ts`.
- Linha de base de testes: **125 arquivos / 1.511 testes**; ESLint com **7 warnings** preexistentes; build local aprovado com avisos de múltiplos lockfiles e `configLoader: 'native'`.
- `features/dashboard/dashboard.tsx` usa **CRLF**; a verificação de diff foi executada com `git -c core.whitespace=cr-at-eol diff --check`.

Nenhum desses arquivos foi revertido, reformatado em massa ou descartado. As alterações desta fase foram somadas ao estado existente.

---

## 4. Arquivos criados e modificados

### Criados nesta fase

| Arquivo | Papel |
|---|---|
| `tests/dashboard-render.test.tsx` | Renderização real (`react-dom/server`) dos quatro módulos, das descobertas e do módulo Conclusões |
| `docs/DASHBOARD_STATISTICS_PHASE_1_2_POLISH_REPORT.md` | Este relatório |

### Modificados nesta fase

| Arquivo | Alteração |
|---|---|
| `features/dashboard/statistics-insights.ts` | `InsightKind`, `InsightTheme`, `selectLibraryInsights`, `MAX_RELATIONAL_INSIGHTS`, reclassificação das regras, textos relacionais |
| `features/dashboard/library-insights.tsx` | Tipografia dos títulos, alinhamento do grid, quebra de linha |
| `features/dashboard/dashboard.tsx` | Escala das barras de status, remoção de `const max`, contexto quantitativo em Conclusões |
| `tests/dashboard-insights.test.ts` | 32 testes do motor, incluindo priorização, dedup e cenários de cardinalidade |
| `tests/dashboard-view.test.ts` | Contrato estático: denominador das barras, distribuição de notas, tipografia, Conclusões |
| `tests/dashboard-render.test.tsx` | 7 testes de renderização (barras, distribuição, 1/2/3 descobertas, estado vazio, headings, Conclusões) |

Arquivos **não** tocados: `server/stats/service.ts` (nenhum dado adicional foi necessário — `finishedWithoutCompletion` já existia), `app/layout.tsx`, `features/shared/layout-mode.ts`, `schemas/*`, `package.json`, `pnpm-lock.yaml`, `.env*`, `getGameStats`.

---

## 5. Diagnóstico da priorização anterior

O motor da Fase 1.1 era correto, mas sua política de seleção era puramente ordinal:

```text
A backlog-concentration   prioridade 1
B rating-coverage         prioridade 2
C hours-concentration     prioridade 3
D finished-without-counter prioridade 4
E finished-ratings        prioridade 5
F favorites-without-rating prioridade 6
```

Como `MAX_LIBRARY_INSIGHTS = 3`, qualquer biblioteca que satisfizesse as três primeiras regras exibia exatamente A, B e C. Essas três regras descrevem **uma única dimensão cada** e seus números aparecem imediatamente nos módulos:

| Insight | Repetição em relação ao módulo |
|---|---|
| A — Concentração no Backlog | Já visível na barra Backlog (contagem + percentual) |
| B — Cobertura de avaliações | Já visível como “Cobertura: X%” no módulo de notas |
| C — Horas concentradas | Já visível no ranking “Mais horas registradas” |

Enquanto isso, D, E e F — que cruzam **dois atributos independentes** e não podem ser lidos diretamente de nenhum gráfico — ficavam permanentemente ocultas. O problema não era o texto das regras, mas a ausência de uma noção de **classe de informação** na seleção.

Não havia também distinção entre “categoria técnica” e “tema”. A dedup existente por `category` impedia duplicatas triviais, mas não reconheceria duas regras distintas dizendo a mesma coisa (cobertura geral baixa vs. favoritos sem nota), nem justificaria a coexistência de D e E.

---

## 6. Nova estratégia de seleção

A seleção foi separada em três responsabilidades: classificação, deduplicação e composição de slots.

### 6.1 Classificação

Cada regra declara explicitamente sua classe:

```ts
export type InsightKind = "relational" | "descriptive";
```

- **Relacional (D, E, F):** cruza dois ou mais atributos pessoais.
  - D — `status === "finished"` × `timesFinished === 0`
  - E — `status === "finished"` × `rating != null`
  - F — `favorite === true` × `rating == null`
- **Descritiva (A, B, C):** resume uma única dimensão já plotada.

A classe é um dado da regra, não um efeito colateral da prioridade. Adicionar uma nova regra exige declarar `kind` e `theme`, o que mantém a política extensível.

### 6.2 Ordenação determinística

```ts
function compareInsights(a, b) {
  if (a.kind !== b.kind) return a.kind === "relational" ? -1 : 1;
  return a.priority - b.priority || a.id.localeCompare(b.id);
}
```

Ordem total: classe → prioridade → `id`. Não há `Math.random`, `Date`, ordenação dependente da ordem de inserção do objeto ou de locale do ambiente (`localeCompare` sobre identificadores ASCII). Duas chamadas com o mesmo input produzem o mesmo array (testado com `toEqual`).

### 6.3 Composição de slots

```ts
MAX_LIBRARY_INSIGHTS   = 3
MAX_RELATIONAL_INSIGHTS = 2
```

1. Ordenar todos os candidatos elegíveis.
2. Deduplicar (seção 7), mantendo a primeira ocorrência na ordem acima.
3. Selecionar no máximo **2** relacionais.
4. Completar as posições restantes com descritivas elegíveis, na ordem de prioridade.
5. Cortar em **3** e **nunca preencher artificialmente**.

Consequências intencionais:

- Se houver 0 relacionais → até 3 descritivas (comportamento antigo preservado como fallback).
- Se houver 1 relacional → 1 relacional + até 2 descritivas.
- Se houver 2+ relacionais → 2 relacionais + 1 descritiva.
- Se houver apenas 1 ou 2 insights elegíveis → exibe 1 ou 2. Nenhuma observação é fabricada.

A “cota” de 2 relacionais é uma escolha de produto documentada em comentário no código, não uma regra rígida: ela limita o risco de três cruzamentos sobre o mesmo subconjunto (por exemplo, três leituras de Finalizado) sem eliminar o fallback descritivo.

---

## 7. Regras de deduplicação

Duas identidades independentes são mantidas por insight:

```ts
category: technical identifier   // ex.: "favorites-without-rating"
theme:    semantic question      // ex.: "favorite-rating-gap"
```

Temas definidos:

| Tema | Pergunta respondida |
|---|---|
| `status-composition` | Como a biblioteca se distribui por status? |
| `rating-coverage` | Qual a cobertura geral de notas? |
| `hours-concentration` | Onde as horas se concentram? |
| `finished-completion-gap` | Finalizado × contador de conclusões |
| `finished-rating-coverage` | Finalizado × presença de nota |
| `favorite-rating-gap` | Favorito × presença de nota |

Regras aplicadas na ordem de seleção:

1. **Categoria repetida é descartada.** Mantém a primeira ocorrência (a de maior classe/prioridade). Isso protege contra regras futuras que gerem o mesmo identificador técnico.
2. **Tema repetido é descartado.** Mantém a primeira ocorrência. Como relacionais vêm antes, uma descritiva nunca “rouba” o slot de uma relacional do mesmo tema.
3. **Cruzamentos independentes sobre o mesmo subconjunto coexistem.** D (`finished-completion-gap`) e E (`finished-rating-coverage`) compartilham `finishedGames`, mas têm temas diferentes e respondem a perguntas distintas — ambos permanecem.
4. **Temas de rating são intencionalmente separados.** `rating-coverage` (cobertura global), `finished-rating-coverage` (recorte de finalizados) e `favorite-rating-gap` (recorte de favoritos) podem coexistir: cada um muda o denominador e a população.

A deduplicação é estrutural (conjuntos de strings), não textual. Não há similaridade de frases, stemming, embeddings ou LLM.

---

## 8. Exemplos de seleção com diferentes conjuntos de dados

Todos os exemplos abaixo são cobertos por testes automatizados.

| Cenário | Dados relevantes | Seleção | Composição |
|---|---|---|---|
| Biblioteca vazia | tudo zero | `[]` | — |
| Biblioteca de 1 jogo | `totalGames = 1` | `[]` | — |
| Amostra pequena (4 jogos, 4 no Backlog) | abaixo de todos os thresholds | `[]` | — |
| Só descritivas elegíveis | Backlog 9/10, cobertura 10%, um jogo com 75% das horas | A, B, C | 0 relacional + 3 descritivas |
| Só uma descritiva elegível | Backlog 9/10, sem notas, sem horas | A | 1 descritiva |
| Só uma relacional elegível | 2 jogos, 2 favoritos, 1 sem nota | F | 1 relacional |
| Duas relacionais elegíveis | 2 jogos, 1 finalizado sem contador, 2 favoritos com 1 sem nota | D, F | 2 relacionais |
| Todas as seis elegíveis | 100 jogos, 82 no Backlog, 5 finalizados, 5 avaliados, 1 finalizado sem contador, 2/5 finalizados avaliados, 1/3 favorito sem nota, 80% das horas em um jogo | **D, E, A** | 2 relacionais + 1 descritiva |

Leitura do último caso: a seção deixa de repetir Backlog + cobertura + horas e passa a mostrar os dois cruzamentos que nenhum gráfico revela (Finalizado × contador, Finalizado × nota), usando o Backlog como contexto complementar. A cobertura global (B) e a concentração de horas (C) continuam disponíveis nos módulos correspondentes.

Observações de borda testadas:

- `finishedWithoutCompletion` é a interseção real calculada no `$group`; nunca deriva de `finishedGames - gamesWithTimesFinished`.
- F não infere ausência de nota como erro; E não infere obrigação de avaliar.
- Registros órfãos (jogo sem nome resolvido) continuam aparecendo no texto com o placeholder fornecido pelo agregado.
- Denominador zero não produz `NaN`/`Infinity`: `share()` retorna 0 e `formatPercent` normaliza valores não finitos.

---

## 9. Alterações visuais

### 9.1 Títulos das descobertas

Antes:

```tsx
<h3 className="font-display mb-1 text-base break-words">
```

Depois:

```tsx
<ul className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
  <h3 className="font-display mb-1 text-[0.95rem] font-semibold leading-snug text-balance break-words">
  <p className="text-sm leading-relaxed break-words">
```

| Ajuste | Motivo |
|---|---|
| `text-base` → `text-[0.95rem]` | Redução discreta (~5%) que evita quebra órfã em “Horas concentradas em um jogo” sem achatar a hierarquia |
| `font-semibold` | Compensa a redução de tamanho preservando contraste de peso |
| `leading-snug` | Títulos de duas linhas ficam visualmente coesos |
| `text-balance` | Distribui as palavras entre linhas em vez de deixar uma última palavra isolada |
| `break-words` | Tokens longos (nomes de jogo) não geram overflow horizontal |
| `items-start` no grid | Cartões com descrições de alturas diferentes alinham pelo topo, eliminando o desequilíbrio do screenshot |
| `leading-relaxed` no corpo | Mantém legibilidade do texto de 14 px |

Não foi aplicado truncamento (`truncate`), `line-clamp`, hifenização forçada ou `text-justify`. Os títulos continuam sendo `<h3>` — a hierarquia `<h1>` (página) → `<h2>` (seção) → `<h3>` (descoberta) foi verificada em renderização real: 1 `h1`, 5 `h2`, 0–3 `h3` conforme o número de descobertas.

### 9.2 Responsividade da seção

- Mobile: `grid-cols-1` (uma coluna).
- ≥ 640 px: `sm:grid-cols-2`.
- ≥ 1024 px: `lg:grid-cols-3`.
- `border-l-2` mantém a identidade RPGUI sem novas molduras ou sombras.
- Nenhuma altura fixa: os cartões crescem com o conteúdo.

### 9.3 Verificação de cardinalidade

Testado com renderização real: 1 descoberta → 1 item; 2 → 2 itens; 3 → 3 itens. O grid nunca é preenchido com placeholders.

---

## 10. Correção da escala das barras

### Problema

A largura era relativa à maior categoria:

```tsx
const max = Math.max(1, ...positive.map((row) => row.count));
<Bar ratio={count / max} />
```

Com Backlog 30 e Finalizado 4, a barra do Backlog aparecia 100% preenchida mesmo representando 88,2% da biblioteca, enquanto um status com 3 jogos (8,8%) aparecia com 10% da largura. A barra comunicava “participação relativa ao maior status”, mas o rótulo ao lado dizia “% da biblioteca” — duas escalas no mesmo componente.

### Correção

```tsx
const ratio = stats.totalGames > 0 ? count / stats.totalGames : 0;
const pct = formatPercent(ratio);
<Bar ratio={ratio} label={`${label}: ${formatInteger(count)} de ${gamesLabel(stats.totalGames)}, ${pct}`} />
```

- Denominador único: `stats.totalGames`, compartilhado por **largura** e **percentual** — o que elimina a divergência entre barra e rótulo.
- Guarda de zero: `totalGames === 0` retorna `ratio = 0`. Além disso, `Bar` já normaliza: `Math.max(0, Math.min(100, Number.isFinite(ratio) ? ratio * 100 : 0))`.
- `const max` foi removido do componente; não restou cálculo de escala local.

Resultado verificado por renderização real (34 jogos, 30 no Backlog, 4 finalizados):

```text
Backlog      30 · 88,2%   → width: 88.23529411764706%
Finalizado    4 · 11,8%   → width: 11.76470588235294%
```

A asserção `expect(html).not.toContain("width:100%")` garante que a maior categoria não é mais forçada ao preenchimento total.

### Distribuição de notas — inalterada

O módulo de notas usa outro universo (somente jogos avaliados) e manteve a regra aprovada:

```tsx
stats.ratedGames > 0 ? count / stats.ratedGames : 0
```

Verificado: 3 jogos avaliados (2 na nota 8, 1 na nota 9) continuam renderizando `66,7%` e `33,3%`, com a barra da nota mais frequente em 100% da escala de distribuição. Nenhuma média, contagem ou percentual persistido foi arredondado.

---

## 11. Refinamento do módulo Conclusões

Antes, após o ranking Top 5, o módulo exibia apenas:

> “O contador de conclusões e o status são campos independentes; a diferença entre eles não indica erro de cadastro.”

Correto, porém genérico. Agora:

```tsx
<p className="mt-3 text-sm">
  {stats.finishedGames === 0
    ? "Nenhum jogo está atualmente no status Finalizado."
    : `No status Finalizado: ${gamesLabel(stats.finishedGames)}; ${formatInteger(stats.finishedWithoutCompletion)} sem conclusão registrada no contador.`}
</p>
<p className="mt-1 text-sm">
  {stats.finishedWithoutCompletion > 0
    ? "O contador de conclusões é independente do status e permanece editável."
    : "Status e contador são informações independentes."}
</p>
```

Decisões:

- **Dados reais.** Usa `finishedGames` e `finishedWithoutCompletion`, ambos já produzidos por `getPersonalStatistics` (interseção `status === "finished" && timesFinished === 0` no `$group`). Nenhuma consulta nova, nenhum campo novo, nenhuma alteração no serviço.
- **Complementaridade com o insight D.** O insight enuncia a proporção com o denominador explícito (“2 dos seus 4 jogos no status Finalizado não possuem…”). O módulo enuncia o **estado do recorte** (“No status Finalizado: 4 jogos; 2 sem conclusão…”) e a consequência operacional (“permanece editável”). O teste de renderização assegura que o parágrafo do insight não é duplicado no módulo (`not.toContain("campos independentes")`).
- **Concordância e plural.** `gamesLabel` e `plural` continuam sendo usados, evitando “1 jogos”.
- **Sem julgamento.** Nenhum texto sugere erro de cadastro, pendência ou obrigação de preencher o contador.
- **Estado sem divergência.** Quando `finishedWithoutCompletion === 0`, o módulo reduz a observação a uma nota conceitual curta — sem inventar divergência.
- **Sem finalizados.** Quando `finishedGames === 0`, o módulo informa o fato e não menciona contadores.

Não foram alterados `status`, `timesFinished`, `finished`, `lastFinishedAt`, a semântica de conclusão, os contadores existentes ou qualquer sincronização entre campos.

---

## 12. Investigação do aviso Next.js (`1 Issue`)

### Procedimento

1. Servidor de desenvolvimento local ativo em `http://localhost:3000`.
2. Sessão Playwright (`@playwright/test`, Chromium headless) com captura de `console` e `pageerror`.
3. Navegação para `/login` — página **sem autenticação e sem qualquer código de estatísticas** — e leitura do shadow DOM de `<nextjs-portal>`.

### Evidência

Console:

```text
[error] A tree hydrated but some attributes of the server rendered HTML didn't match
the client properties. This won't be patched up. ...
  - data-layout-mode="fullscreen"
```

Overlay (`<nextjs-portal>` → shadow root): o toast renderiza exatamente os nós `div` com texto `1` e `Issue`.

### Classificação

- **Causa:** `LAYOUT_INIT_SCRIPT` (inlined em `app/layout.tsx`) escreve `data-layout-mode`, `data-font-display`, `data-font-body` e `data-grid-density` no `<html>` antes da hidratação, para evitar flash de layout. O `<html>` renderizado pelo servidor não contém esses atributos; o React 19 registra o mismatch de atributos na raiz.
- **Abrangência:** ocorre em `/login`, portanto **não** é específica de `/dashboard` e **não** foi introduzida por esta fase (nem pela Fase 1.1).
- **Natureza:** preexistente, de ambiente de desenvolvimento, sem impacto funcional aparente — o React não corrige os atributos, mas eles já estão corretos no DOM antes do primeiro paint.
- **Não aplicado nesta fase:** a correção recomendada (`suppressHydrationWarning` no `<html>`, ou mover a sincronização para um padrão que o React aceite) é uma mudança transversal ao layout raiz, fora do escopo autorizado da Fase 1.2. O overlay **não** foi desabilitado e nenhum warning foi suprimido.
- **Limitação:** não foi possível determinar se o screenshot original do usuário correspondia a esse mesmo issue por análise da imagem; a reprodução local, porém, é inequívoca e independente de autenticação.

---

## 13. Acessibilidade e responsividade

| Item | Situação |
|---|---|
| Hierarquia de headings | `h1` único (“Estatísticas”), 5 `h2` de seção, `h3` por descoberta (0–3) — verificado por renderização |
| Barras | `role="img"` com `aria-label` contendo rótulo, contagem, denominador e percentual |
| Barras de status | `aria-label`: “Backlog: 30 de 34 jogos, 88,2%” — agora coerente com a largura renderizada |
| Status vazios | Mantidos em `<details>` (comportamento preexistente preservado) |
| Texto | Nenhuma informação depende só de cor; percentuais sempre em texto |
| Quebra de linha | `break-words` + `text-balance`; sem `truncate`/`line-clamp` |
| Responsividade | 1 coluna (mobile) → 2 (≥640 px) → 3 (≥1024 px); grid de módulos 1 → 2 colunas em `lg` |
| Overflow | `min-w-0` em containers e itens; nomes longos quebram dentro do cartão |
| Contraste | Cores RPGUI inalteradas (âmbar sobre fundo escuro, já aprovadas na Fase 1) |

A homologação visual autenticada em desktop/tablet/mobile não pôde ser refeita (seção 17); a verificação estrutural foi feita por markup renderizado.

---

## 14. Performance e arquitetura

Fluxo preservado, sem novas camadas:

```text
Server Component (app/(app)/dashboard/page.tsx)
       ↓
getPersonalStatistics(stats)        ← inalterado
       ↓
PersonalStatistics (view model agregado)
       ↓
buildLibraryInsights(stats)         ← função pura, síncrona
       ↓
Descobertas + quatro módulos (Server Components)
```

- **Zero consultas adicionais.** Nenhuma alteração em `server/stats/service.ts`; `finishedWithoutCompletion` já existia desde a Fase 1.
- **Zero dependências novas.** Nenhum pacote, schema, índice, serviço ou API adicionado.
- **Custo computacional desprezível.** O motor avalia 6 regras, ordena no máximo 6 itens e deduplica com dois `Set`. Nenhuma alocação relevante por request.
- **Sem estado de cliente.** `library-insights.tsx` continua Server Component; nenhum `"use client"` foi introduzido.
- **Contrato público intacto.** `getGameStats` não foi modificado; `PersonalStatistics` manteve os campos existentes.
- **Bundle.** A rota `/dashboard` permanece em 265 B de página / 103 kB de First Load JS — sem acréscimo mensurável em relação à Fase 1.1.
- **Determinismo.** O motor é puro e testado para estabilidade entre chamadas; nenhum `Date`, `Math.random` ou ordenação dependente de ambiente.

---

## 15. Testes executados

### 15.1 Direcionados

```text
pnpm exec vitest run tests/dashboard-insights.test.ts \
                    tests/dashboard-view.test.ts \
                    tests/dashboard-render.test.tsx
→ 3 arquivos, 46 testes aprovados
```

Cobertura por requisito da fase:

| # | Requisito | Teste |
|---|---|---|
| 1 | Priorização relacional | `prioritizes relational discoveries over descriptive repeats` |
| 2 | Fallback descritivo | `falls back to descriptive insights when no relational rule is eligible` |
| 3 | Nenhum insight elegível | `returns an empty list when no rule is eligible` |
| 4 | Uma descoberta | `renders exactly one insight when only one rule is eligible` |
| 5 | Duas descobertas | `returns two insights when only two relational rules are eligible` |
| 6 | Três ou mais elegíveis | `caps relational discoveries and leaves room for one descriptive complement` |
| 7 | Limite de três | `never returns more than three insights` |
| 8 | Dedup semântica | `deduplicates by semantic theme, keeping the relational candidate` + `deduplicates by technical category even with different themes` |
| 9 | Cruzamentos independentes | `preserves independent crossings of the same status subset` + `keeps distinct rating themes coexisting` |
| 10 | Ordenação determinística | `keeps a single insight per category/theme and is stable across calls` + `orders descriptive insights deterministically…` |
| 11 | Biblioteca vazia | `returns no insights for an empty library` + renderização do estado vazio |
| 12 | Amostras pequenas | `suppresses insights for small samples` |
| 13 | Finalizados sem contador | `uses the real intersection of status finished and no completion counter` |
| 14 | Finalizados avaliados | `reports finished games with ratings using the finished subset` |
| 15 | Favoritos sem nota | `reports favorites without ratings using independent markers` |
| 16 | Dados ausentes / órfãos | `keeps orphaned games visible by name placeholder in observations` |
| 17 | Sem inferências sem suporte | `never presents unsupported inferences or empty justification` |
| 18 | Denominadores zero | `never divides by zero denominators` + `does not report hours concentration when total hours are zero…` |
| UI | Escala das barras | `scales every status bar by the library total` |
| UI | Notas inalteradas | `keeps rating distribution on the rated-games scale` |
| UI | 1/2/3 descobertas | `renders one, two or three discoveries without inventing more` |
| UI | Estado vazio | `renders the empty state without artificial discoveries` |
| UI | Headings | `keeps one h1, one h2 per section and one h3 per discovery` |
| UI | Conclusões contextual | `complements the conclusions insight with different quantitative context` + `uses only the short conceptual note when status and counter agree` |
| UI | Tipografia/responsividade | contrato em `dashboard-view.test.ts` (`text-[0.95rem]`, `text-balance`, `items-start`, `sm:grid-cols-2`, `lg:grid-cols-3`, ausência de `truncate`) |

Ajustes de expectativa durante a fase (todos justificados por comportamento real da UI, não por relaxamento de asserção):

1. Fixture de renderização montava `byStatus` duas vezes no mesmo objeto (`TS1117`); passou a mesclar `{ ...ZERO_STATUSES, ...overrides.byStatus }` uma única vez.
2. Estado de biblioteca vazia: com `totalGames === 0`, os módulos de Status **e** Notas exibem “Sua biblioteca ainda está vazia.”; o texto “Nenhum jogo avaliado ainda.” só aparece quando existe biblioteca mas nenhum jogo avaliado. A asserção foi corrigida para refletir esse contrato (2 ocorrências do primeiro texto, 2 de “Nenhum registro disponível ainda.”).

### 15.2 Suíte completa

```text
pnpm test
→ Test Files  126 passed (126)
→ Tests       1531 passed (1531)
```

Comparação com a linha de base: **+1 arquivo**, **+20 testes**, **0 falhas**. Nenhum teste preexistente foi removido ou enfraquecido; os arquivos de Home, navegação, leituras e contratos continuam verdes.

### 15.3 TypeScript

```text
pnpm exec tsc --noEmit
→ exit 0
```

### 15.4 ESLint

```text
pnpm lint
→ 7 problems (0 errors, 7 warnings)
```

Os 7 warnings são exatamente os preexistentes (`features/atp/catalog-search.tsx` — dependência instável de `useCallback`; `scripts/import-platform-images.mjs` — diretivas `eslint-disable` não utilizadas). Nenhum warning novo foi introduzido pelos arquivos desta fase.

---

## 16. Resultado do build

```text
pnpm build
✓ Compiled successfully in 16.4s
✓ Generating static pages
→ exit 0
```

- Aviso único de ambiente: múltiplos lockfiles (`AGORA_VAI/pnpm-lock.yaml` e `save-state/pnpm-lock.yaml`), com escolha de workspace root fora do diretório do app. Preexistente, não relacionado a esta fase.
- Rota afetada: `ƒ /dashboard` — 265 B de página, 103 kB de First Load JS.
- **Observação operacional:** a primeira tentativa de build falhou com `Invariant: no direct app page entry found for /_not-found` porque um `next dev` estava ativo e compartilhava o diretório `.next` com o build de produção. Reproduzido em cópia isolada dos mesmos fontes (build OK) e confirmado após encerrar o servidor de desenvolvimento: `pnpm build` concluiu com exit 0. Não houve alteração de `next.config.ts`, `distDir` ou artefatos versionados. O servidor de desenvolvimento foi reiniciado ao final e `/login` responde `200`.

---

## 17. Limitações

1. **Homologação visual autenticada não executada.** Não há sessão nem `E2E_MONGODB_URI` autorizados nesta fase; a matriz E2E (`pnpm audit:e2e`) exige replica set local dedicado. A verificação visual foi substituída por renderização real de servidor (`renderToStaticMarkup`) e por contrato de markup, que cobrem escala, textos, cardinalidade e hierarquia, mas **não** cobrem percepção visual, contraste em tela real, densidade de grid ou comportamento do `<details>` em interação.
2. **Screenshots anteriores não reanalisados pixel a pixel.** As decisões de tipografia foram guiadas por medidas de classes e por renderização, não por diff de imagem.
3. **Aviso `1 Issue` não corrigido.** Classificado como preexistente e alheio à página; a correção é recomendada como tarefa separada, por tocar o layout raiz.
4. **Regra G (horas × avaliações) permanece adiado**, conforme escopo.
5. **Nenhuma comparação com dados reais de produção.** Os exemplos de seleção vêm de fixtures sintéticas e coerentes; o comportamento com bibliotecas reais deve ser confirmado em homologação.

---

## 18. Inspeção final do diff

```text
git status --short        → 12 M preexistentes preservados + arquivos novos da série
git -c core.whitespace=cr-at-eol diff --check → exit 0
```

- `features/dashboard/dashboard.tsx` (CRLF) alterado sem conversão de fim de linha e sem trailing whitespace.
- Nenhum arquivo preexistente foi reformatado, renomeado, removido ou revertido.
- Nenhuma alteração em `package.json`, `pnpm-lock.yaml`, `.env*`, `schemas/`, `db/`, `app/layout.tsx` ou `features/shared/layout-mode.ts`.
- Nenhum artefato de build (`.next/`) versionado; `git check-ignore` confirma que `.next/` permanece ignorado.
- Diff desta fase concentrado em: motor de insights, componente de descobertas, dois trechos de `dashboard.tsx` (barras de status e Conclusões) e três arquivos de teste.

---

## 19. Recomendações de homologação

1. **Inspeção visual autenticada** em `/dashboard` com biblioteca real, em 1920×1080, 1366×768, 768×1024 e 390×844, verificando:
   - coerência entre largura e percentual em todos os status;
   - quebra dos títulos das descobertas com 1, 2 e 3 cartões;
   - alinhamento superior dos cartões no desktop;
   - leitura do parágrafo contextual no módulo Conclusões.
2. **Cenários de dados recomendados:** biblioteca majoritariamente em Backlog com 2+ relacionais elegíveis; biblioteca sem finalizados; biblioteca com finalizados e contador coincidente; favoritos sem nota; biblioteca com menos de 5 jogos (estado sem descobertas).
3. **Verificar a acessibilidade das barras** com leitor de tela: o `aria-label` agora bate com a largura renderizada — confirmar leitura em pt-BR.
4. **Tarefa separada — hydration mismatch:** avaliar `suppressHydrationWarning` no `<html>` de `app/layout.tsx` (ou abordagem equivalente que preserve o script pré-paint), com teste de regressão no overlay de desenvolvimento. Não fazer parte desta fase.
5. **Observar em produção** se o build em Vercel reproduz os avisos de múltiplos lockfiles; se sim, tratar `outputFileTracingRoot` como tarefa de infraestrutura.
6. **Não publicar** antes da aprovação explícita do usuário. A Fase 2 não foi iniciada.
