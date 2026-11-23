# RPGUI MOBILE-04A.2 — Relatório final de revisão

**Data:** 22/11/2026  
**Escopo:** distribuição responsiva da grade Home, triagem das falhas E2E e auditoria temporal HYDRATION-01.  
**Veredito:** **PARCIAL — NÃO RECOMENDADO PARA PUBLICAÇÃO**

## Resumo executivo

Foi confirmada insuficiência de largura nas colunas da grade original: os quatro atalhos em quatro colunas tinham apenas 184 px de largura interna em 768 px e 187 px em 1280 px, abaixo da largura de aproximadamente 230 px do título “Estatísticas”. A alteração local limita a grade a uma coluna até 1023 px, duas a partir de 1024 px, três a partir de 1280 px e quatro a partir de 1600 px. Não altera fonte, tamanho, molduras, sprites, cores, padding, texto, estrutura ou ações dos cards.

A medição autenticada posterior confirmou que a distribuição melhora a área dos cards em **360, 390, 412, 768, 820, 900, 1024, 1280 e 1366 px**, sem overflow horizontal do documento e sem clipping dos quatro títulos. O teste mediu também busca, altura/largura do botão (44×44 px), feed sintético e erros de runtime. **Em 320 px, “Estatísticas” ainda ultrapassa a área interna do card em cerca de 18 px.** A grade já está em uma coluna nessa largura; resolver o restante exige alterar algo além da distribuição de colunas, vedado pelo escopo. Portanto, a matriz visual requerida não está integralmente aprovada.

As dez falhas E2E anteriores foram classificadas individualmente abaixo. Há causas ambientais/de harness comprovadas, mas as falhas de Home, navegação e editor não foram atribuídas com confiança suficiente a regressão ou baseline. Na reprodução isolada da matriz mobile com setup de autenticação, dois testes passaram e três falharam; os bloqueios continuaram na busca, menu e botão de rascunho. O resultado não autoriza mascarar ou alterar esses testes.

HYDRATION-01 segue **inconclusivo**: o smoke CSSOM confirma estado de estilos após carregamento, não a ordem temporal “estilos antes do primeiro paint”. O teste original não obteve `first-paint` de forma confiável no Chrome local e também reportou problema de serialização de fontes. Nenhuma asserção temporal foi removida ou enfraquecida.

## Alteração de produção

Arquivo: `app/(app)/home/page.tsx`

```diff
- grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4
+ grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 min-[1600px]:!grid-cols-4
```

O modificador `!` no último breakpoint é necessário porque, na folha gerada, a regra arbitrária de 1600 px aparece antes do breakpoint `xl`; sem ele, `xl:grid-cols-3` prevalecia também em 1600 px. A regra importante garante quatro colunas somente a partir de 1600 px. Essa faixa foi examinada adicionalmente, além dos viewports de aceite.

Nenhuma outra alteração de produção foi feita nesta rodada.

## Evidência responsiva

Chrome 157 local; sessão de auditoria sintética; banco MongoDB efêmero local; capturas e logs mantidos fora do checkout, em `%LOCALAPPDATA%\Temp\opencode\mobile04a1-validation-20261122-231019`.

| Viewport | Colunas após | Overflow horizontal | Títulos dentro do frame | Resultado |
|---:|---:|---:|---|---|
| 320×915 | 1 | 0 px | **Não — “Estatísticas” excede ~18 px** | Bloqueado |
| 360×915 | 1 | 0 px | Sim | Passou |
| 390×915 | 1 | 0 px | Sim; busca submetida | Passou |
| 412×915 | 1 | 0 px | Sim | Passou |
| 768×1024 | 1 | 0 px | Sim | Passou |
| 820×1024 | 1 | 0 px | Sim | Passou |
| 900×1024 | 1 | 0 px | Sim | Passou |
| 1024×1024 | 2 | 0 px | Sim | Passou |
| 1280×1024 | 3 | 0 px | Sim | Passou |
| 1366×1024 | 3 | 0 px | Sim | Passou |

Em todas as larguras medidas, a tipografia permaneceu em 19,2 px e os botões de busca mediram 44×44 px. Foram medidos os quatro títulos, limites internos dos frames, overflow do documento, atividade sintética e erros de página. A busca foi submetida a 390 px. Capturas “antes” e “depois” foram guardadas na pasta temporária informada acima.

Larguras exploratórias adicionais: 1400, 1440, 1536, 1599, 1600, 1680 e 1920 px. A grade tem três colunas abaixo de 1600 e quatro a partir de 1600 após a correção de precedência. As dimensões da área interna foram conferidas; não substituem os dez viewports de aceite.

## Triagem das dez falhas E2E

| # | Teste / falha | Classificação | Evidência e limite |
|---:|---|---|---|
| 1 | `e2e-adverse.spec.ts:123` — navegação ao Dashboard não encontra heading `/dashboard` | **Não atribuída** | Pode ser sessão, carregamento ou rota; não há prova suficiente de regressão MOBILE-04A nem de falha preexistente. |
| 2 | `e2e-auth.spec.ts:55` — `getByLabel(/senha/i)` ambíguo entre input e botão “Mostrar senha” | **Harness/seletor** | Ambiguidade do locator; não relacionada à grade. Nenhuma alteração feita no teste. |
| 3 | `e2e-auth.spec.ts:78` — captura de e-mail não configurada | **Ambiente** | `E2E email capture is not configured`; serviço de captura local não habilitado. |
| 4 | `e2e-search.spec.ts` — busca rejeita mensagem de integração IGDB indisponível | **Ambiente/asserção** | Credenciais Twitch fictícias no ambiente isolado causam `IGDB integration is not configured`. |
| 5 | `e2e-search.spec.ts` — segunda asserção de mensagem de busca IGDB | **Ambiente/asserção** | Mesma indisponibilidade por credenciais sintéticas; não corrigida nem ocultada. |
| 6 | `e2e-search.spec.ts` — terceira asserção de mensagem de busca IGDB | **Ambiente/asserção** | Mesma causa; não corrigida nem ocultada. |
| 7 | `e2e-search.spec.ts:93` — Dashboard sem heading `/dashboard` | **Não atribuída** | Causa possivelmente compartilhada com #1; inconclusiva. |
| 8 | `matrix-viewport.spec.ts:32` — input de busca ausente | **Não atribuída** | Reprodução com setup autenticado continuou sem encontrar o campo; ambiente/fixture pode interferir, mas a causa não foi provada. |
| 9 | `matrix-viewport.spec.ts:41` — botão “Abrir menu de navegação” ausente | **Não atribuída** | Reprodução isolada continuou bloqueada; sem evidência que justifique classificar como regressão da grade ou baseline. |
| 10 | `matrix-viewport.spec.ts:66` — botão “Novo rascunho” ausente | **Não atribuída** | Reprodução isolada continuou bloqueada no editor; fora da correção autorizada e sem atribuição conclusiva. |

A execução completa anterior teve 81 testes aprovados e 10 falhas. Na reprodução mobile com setup autenticado, dois testes passaram e três falharam (busca, menu e editor). Não se alteraram funcionalidades, fixtures do produto, seletores ou asserções para fazer esses resultados passar. O smoke Home autenticado direcionado foi aprovado.

## HYDRATION-01

- O teste temporal original continuou sem evidência confiável de `first-paint` no Chrome local; foi reportada também falha de serialização de fontes.
- O smoke CSSOM independente em 390, 768 e 1366 px verificou estilos presentes após carregamento, mas **não** provou precedência em relação ao primeiro paint.
- A alternativa CDP/Performance Paint Timing não foi validada nesta rodada como substituta equivalente.
- Resultado: **INCONCLUSIVO**. Asserções temporais não foram removidas, reduzidas ou substituídas por smoke pós-carregamento.

## Validações

| Verificação | Resultado |
|---|---|
| Build de produção em cópia isolada, com Node 24 | Aprovado |
| Typecheck | Aprovado |
| Vitest | 1544/1544 testes; 128 arquivos aprovados |
| ESLint | 0 erros; 7 warnings preexistentes/em arquivos fora da alteração |
| Playwright Home autenticado, grade/busca/feed e geometria | 2 testes do projeto passaram; a coleta geométrica identificou a exceção de 320 px (não foi transformada em asserção que ocultasse ou bloqueasse o diagnóstico) |
| Playwright E2E completo | 81 passaram, 10 falharam na execução anterior; ver triagem |
| HYDRATION-01 temporal | Inconclusivo |
| `git diff --check` | Não limpo: reporta whitespace em linhas de arquivos locais já modificados, inclusive conteúdo preexistente de `page.tsx`; não foram normalizadas linhas fora do escopo |

As validações foram executadas na cópia isolada temporária, não sobre `.next` ou servidor preexistente do checkout. Banco e usuário de auditoria eram sintéticos/efêmeros. Não houve staging, commit, push, publicação ou deploy. Alterações e relatórios paralelos já presentes na worktree foram preservados.

## Decisão

**PARCIAL — NÃO RECOMENDADO PARA PUBLICAÇÃO.**

Embora a grade corrija o clipping confirmado em 768 px e nas demais larguras verificadas de 360 a 1366 px, o título “Estatísticas” ainda invade a moldura a 320 px. A triagem E2E contém falhas não atribuídas e a prova temporal HYDRATION-01 continua inconclusiva. Não ampliar esta alteração para tipografia, wrapping, padding ou estrutura sem nova autorização explícita; não publicar até resolver ou aceitar formalmente esses bloqueios e revalidar a matriz.
