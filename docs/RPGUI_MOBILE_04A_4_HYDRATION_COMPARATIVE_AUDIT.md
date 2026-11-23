# RPGUI MOBILE-04A.4 — Auditoria comparativa de hidratação

**Data:** 23/11/2026  
**Baseline:** `7ed633832f05c53c77f4d48833e68129717c9b19`  
**Escopo:** comparação isolada baseline × estado local, validação de HYDRATION-01 e normalização semântica da serialização CSSOM de `font-family`.  
**Veredito:** **HYDRATION-01 APROVADO NAS CONDIÇÕES TESTADAS; MOBILE-04A NÃO PUBLICAR AUTOMATICAMENTE.**

## Veredito por dimensão

| Dimensão | Resultado | Fundamentação |
|---|---|---|
| Responsividade | **Aprovada no escopo MOBILE-04A.3** | A matriz anterior aprovou 22 viewports e o breakpoint de quatro colunas a partir de 1680 px. Este trabalho não reabriu nem alterou o design da Home. |
| Funcionalidade | **Aprovada no escopo MOBILE-04A.3** | Interações e validações direcionadas reportadas no aceite anterior permanecem válidas; esta auditoria não modifica produção funcional. |
| E2E global | **Parcial / não aprovado para publicação** | O relatório MOBILE-04A.3 registra falhas/limitações de execução global e triagem de testes. Esta fase não repetiu a suíte E2E global e não converte esse resultado em aprovação. |
| Hidratação HYDRATION-01 | **Aprovada nas condições medidas** | Baseline e estado local passaram nos três viewports, com bootstrap anterior ao primeiro paint, sem mutações dos atributos da raiz, sem divergência semântica das fontes e sem erro de hidratação. |
| Integridade / publicação | **Sem publicação** | Nenhuma alteração foi staged, commitada, enviada ou implantada. Índice permaneceu vazio; trabalhos paralelos foram preservados. |

**Recomendação:** não publicar automaticamente com base somente neste aceite de hidratação. A decisão final de publicação deve considerar e resolver explicitamente o resultado parcial do E2E global registrado em MOBILE-04A.3.

## Ambiente e método

- Baseline conferido em `main`/`origin/main`: `7ed633832f05c53c77f4d48833e68129717c9b19`.
- Baseline e estado MOBILE-04A foram compilados/executados em worktrees/cópias isoladas, sem compartilhar `.next`.
- Node `v24.22.3`, pnpm `11.3.0`, Chrome instalado `157.0.8103.79`; Playwright executou em Chromium headless e foi também feita captura diagnóstica headful.
- As duas aplicações usaram a mesma configuração Playwright, viewport, rota `/login`, viewport height 844, preferência sintética `save-state-ui`, browser binário e mecanismo de observação. Os dados de autenticação/banco usados para subir o app eram sintéticos; a rota testada não dependeu de uma sessão autenticada.
- A instrumentação foi instalada antes da navegação por `addInitScript`. O instante do bootstrap foi capturado via `performance.now()` no momento em que a regra CSSOM é aplicada. O `first-paint` foi obtido de `PerformanceObserver`/`performance.getEntriesByType("paint")` da mesma página. Portanto, ambos pertencem à mesma timeline monotônica e a asserção exige estritamente `bootstrap.time < firstPaint.startTime`.
- O teste espera a entrada `first-paint` com timeout finito de 5 segundos. A ausência da entrada continua sendo falha; nenhuma asserção temporal foi removida ou convertida em sucesso permissivo.
- Foi feito diagnóstico adicional via CDP/lifecycle e Paint Timing, em headless e headful. As métricas de paint expostas pela API do protocolo `Performance.getMetrics` não estavam disponíveis como métricas numéricas utilizáveis nessa versão/configuração; os eventos `Page.lifecycleEvent` `firstPaint`/`firstContentfulPaint`, quando emitidos, concordaram com `PerformanceEntry.startTime` dentro de aproximadamente 0–3 ms. Os timestamps `performance.now()` e lifecycle foram comparados somente dentro dos respectivos clocks/timelines.
- Os arquivos de hidratação/bootstrap (`app/layout.tsx`, `app/globals.css`, `features/shared/layout-mode.ts`, `features/shared/ui-store.ts` e configuração Playwright) têm hashes idênticos no baseline e na cópia local. As mudanças de produção MOBILE-04A se limitam à Home e seu CSS; não alteram o mecanismo CSSOM de hidratação.

## Resultados A/B de HYDRATION-01

As colunas de paint abaixo são `PerformancePaintTiming.startTime`, em milissegundos desde o `timeOrigin` da página. O bootstrap e o paint foram observados na mesma navegação. O resultado é evidência comparativa, não uma alegação de que os tempos absolutos representam latência de usuário em produção.

| Estado | Largura | Bootstrap CSSOM (ms) | First paint (ms) | First contentful paint (ms) | Zoom | Fontes computadas | Mutação da raiz |
|---|---:|---:|---:|---:|---:|---|---|
| Baseline | 390 | 42,4 | 360 | 360 | 100% | Roboto, Roboto Fallback, system-ui, sans-serif | Nenhuma |
| Baseline | 768 | 42,5 | 96 | 96 | 80% | Roboto, Roboto Fallback, system-ui, sans-serif | Nenhuma |
| Baseline | 1366 | 36,0 | 156 | 156 | 80% | Roboto, Roboto Fallback, system-ui, sans-serif | Nenhuma |
| MOBILE-04A | 390 | 39,0 | 356 | 356 | 100% | Roboto, Roboto Fallback, system-ui, sans-serif | Nenhuma |
| MOBILE-04A | 768 | 41,0 | 92 | 92 | 80% | Roboto, Roboto Fallback, system-ui, sans-serif | Nenhuma |
| MOBILE-04A | 1366 | 38,7 | 144 | 144 | 80% | Roboto, Roboto Fallback, system-ui, sans-serif | Nenhuma |

**Resultado por execução:** teste HYDRATION-01 `3/3` passou no baseline após o ajuste de espera; `3/3` passou na cópia local com a mesma instrumentação; após sincronizar os arquivos finais de teste, uma execução limpa adicional no local também passou `3/3`. As asserções incluem resposta HTTP 200, ordem do stylesheet/bootstrap no HTML, regra CSSOM presente e única, stylesheet sem texto, ausência de atributos de preferência na raiz, ausência de mutações da raiz, dimensões/zoom esperados, ausência de overflow, equivalência de fontes, bootstrap anterior a first paint, persistência após reload e ausência de erro de hidratação.

### Interpretação da evidência temporal

Todas as seis amostras da tabela satisfazem `bootstrap < first-paint`; as margens observadas variam de aproximadamente 54 ms a 320 ms. O primeiro paint e o first contentful paint foram registrados no mesmo instante arredondado pelo navegador em cada amostra. Não se interpreta a diferença entre baseline e local como regressão ou ganho de performance: trata-se de poucas amostras, com scheduler/headless e tempos de carregamento variáveis.

Nas tentativas exploratórias iniciais, a espera de apenas dois `requestAnimationFrame` era insuficiente para garantir que a entrada Paint Timing já tivesse sido entregue: houve ausência intermitente de paint tanto no baseline quanto no local. Isso expôs uma fragilidade de sincronização do teste, não uma diferença A/B. O teste passou a aguardar a entrada real com limite explícito de 5 s e falha se ela não ocorrer. Com esse critério, ambos os estados passaram; os resultados negativos exploratórios foram preservados como diagnóstico e não tratados como aprovações.

## Normalização semântica de `font-family`

O CSSOM pode serializar `font-family` com aspas e espaçamento diferentes da leitura computada — por exemplo:

```text
"Roboto","Roboto Fallback", system-ui, sans-serif
Roboto, "Roboto Fallback", system-ui, sans-serif
```

Comparar essas strings literalmente produzia falha antes das asserções temporais, embora representassem a mesma lista CSS. Foi adicionado `tests/hydration-font-family.ts`, que separa famílias por vírgulas fora de aspas e normaliza espaços, preservando a ordem, nomes, fallbacks e vírgulas internas de nomes citados. Não há remoção genérica de aspas nem comparação parcial.

Quatro testes unitários cobrem equivalência de aspas/espaços, família ausente/diferente, ordem/fallback e vírgula dentro de nome citado. Resultado: **4/4 passaram**. As comparações do HYDRATION-01 usam listas normalizadas completas.

## Validações e limites

- Vitest completo na cópia MOBILE-04A: **129 arquivos e 1548 testes passaram**.
- Typecheck na cópia MOBILE-04A: **passou**.
- ESLint direcionado aos três arquivos de teste de hidratação/normalização: **passou**.
- Typecheck e ESLint direcionado também passaram no checkout isolado do baseline com os mesmos testes.
- Build de produção do baseline isolado: **passou**. A validação visual/responsiva MOBILE-04A.3 e seu resultado funcional são referenciados, não repetidos aqui.
- A suíte E2E global, matriz de 22 viewports e fluxos autenticados não foram repetidos nesta fase. Este relatório não amplia o escopo de aprovação além da hidratação comparada.
- Chrome reportou `browserVersion 157.0.8103.79`; a configuração `Desktop Chrome` do Playwright fornece um User-Agent emulado `Chrome/156.0.8078.4`. A emulação foi idêntica nos dois lados, e o mesmo executável Chrome foi usado. Esta distinção de versão é registrada como limitação de representatividade do ambiente.
- O diagnóstico não constitui medição de performance de campo, teste em dispositivos físicos, nem prova para todos os navegadores/condições de scheduler.

## Arquivos alterados nesta auditoria

- `tests/hydration-preferences.spec.ts`: comparação semântica das listas de fontes e espera explícita, finita e obrigatória pela entrada `first-paint`.
- `tests/hydration-font-family.ts`: parser/normalizador de listas `font-family`.
- `tests/hydration-font-family.test.ts`: cobertura unitária do normalizador.
- `docs/RPGUI_MOBILE_04A_4_HYDRATION_COMPARATIVE_AUDIT.md`: este relatório.

Nenhum arquivo de produção, CSSOM/bootstrap, estado Zustand, persistência, API, autenticação, banco, dependência ou lockfile foi alterado por esta auditoria. Nenhuma asserção temporal foi removida ou mascarada.

## Integridade e publicação

- Alterações paralelas preexistentes na worktree foram preservadas.
- O índice Git está vazio; as alterações permanecem unstaged.
- Não houve commit, push, deploy ou publicação automática.
- O processo MongoDB local efêmero preexistente foi preservado; os servidores temporários de validação foram encerrados.
- HYDRATION-01 está aprovado somente para os estados, browser, rota, viewports e condições descritos. O veredito global MOBILE-04A permanece **não recomendado para publicação automática** enquanto o resultado parcial de E2E global não for tratado em uma decisão separada.
