# Save State — IGDB Performance Optimization — Fase 4
## Corrida na invalidação do token Twitch após HTTP 401

**Data:** 17/11/2026  
**Escopo:** reprodução determinística e correção mínima da invalidação concorrente do token Twitch.  
**Referências:** auditoria de rate limit e relatórios das Fases 0–3.  
**Método:** testes e validações locais com `fetch` mockado; nenhuma chamada autenticada externa.

## 1. Resumo executivo

- **[Confirmada]** Antes da alteração, um 401 atrasado referente ao token A apagava o token B já renovado. O teste determinístico falhou com **3 chamadas OAuth em vez de 2**.
- **[Confirmada]** A invalidação agora recebe o token realmente usado pela tentativa IGDB e só limpa o cache se o token armazenado ainda for igual. O teste original passou: o retry usa B, sem refresh C.
- **[Confirmada]** Dois 401 simultâneos referentes a A compartilham a renovação OAuth single-flight existente.
- **[Confirmada]** O retry 401 continua limitado a uma repetição; a política de 429, Retry-After, scheduler, limite de oito requests, intervalo de 250 ms, deadline e cancelamentos não foram alterados nesta correção.
- **[Confirmada]** A suíte completa passou com **123 arquivos e 1.480 testes**; TypeScript, ESLint direcionado e build também passaram.
- **[Não verificada]** A frequência e o impacto do cenário em produção não foram medidos.

## 2. Diagnóstico da condição de corrida

`igdb-client.ts` executava `invalidateTwitchToken()` sem argumento após receber HTTP 401. O token manager limpava o cache incondicionalmente. Logo, qualquer resposta 401 tardia podia apagar token renovado desde que a request antiga tivesse sido enviada.

**[Confirmada]** A corrida era possível no fluxo em memória de cada processo. Não há evidência de sua ocorrência em produção.

## 3. Evidência de reprodução anterior à correção

Foi adicionado um teste com operações IGDB independentes e respostas iniciais controladas por Promises:

1. O token A é obtido por OAuth mockado e usado pelas duas operações.
2. A primeira request recebe 401.
3. O retry causa a emissão de B e conclui com sucesso.
4. Só então a segunda request recebe seu 401 antigo referente a A.
5. O retry da segunda operação conclui.

**[Confirmada]** Antes da correção, o teste falhou na asserção `oauthCalls`: esperado 2, recebido **3**. Isso demonstra que o 401 atrasado invalidou B e provocou uma renovação extra (token C). O valor dos tokens foi usado apenas no teste, não em logs.

## 4. Causa raiz

**[Confirmada]** A invalidação não estava vinculada à identidade do token da tentativa que recebeu 401. O token manager não distinguia “token rejeitado ainda está em cache” de “token rejeitado já foi substituído”.

## 5. Estratégia de invalidação adotada

`invalidateTwitchToken(rejectedToken)` compara o token rejeitado com o token em cache:

- igualdade: limpa o cache e retorna `invalidated`;
- cache preenchido com outro token: preserva o cache e retorna `ignored_replaced`;
- cache vazio: retorna `already_empty`.

O cliente passa à função o token capturado e enviado naquela tentativa. Isso usa a identidade efetiva do token, sem depender de dados do navegador. A função retorna um rótulo de baixa cardinalidade; nenhum segredo ou hash é registrado.

**[Confirmada]** O token B permanece no cache quando chega um 401 atrasado de A.  
**[Confirmada]** A margem de expiração de 60 segundos e o escopo em memória não foram alterados.

## 6. Interação com single-flight e scheduler

**[Confirmada]** A correção não adiciona locks nem altera o single-flight OAuth. Se dois 401 invalidam A antes de a renovação terminar, a primeira invalidação limpa A; a segunda observa cache vazio. Ambas as operações então chamam `getTwitchToken`, que compartilha a Promise de renovação já em andamento.

**[Confirmada]** No teste concorrente, duas requests usaram A, ambas receberam 401 enquanto o refresh estava bloqueado, e ambas repetiram com B após uma única renovação adicional. Os eventos resultaram em `invalidated` e `already_empty`.

**[Confirmada]** Cada repetição segue o caminho existente de admissão do scheduler. Nenhuma tentativa física foi movida para fora da fila.

## 7. Preservação dos retries 401/429

**[Confirmada]** O marcador `retried401` continua limitando 401 a uma repetição. A resposta 401 seguinte mantém o erro existente.

**[Confirmada]** 429 continua com o limite e orçamento da Fase 2. Testes existentes cobrem 401→429→200 e 429→401→200; ambos passaram. Não houve alteração a Retry-After ou jitter.

**[Confirmada]** Os testes existentes de admissão exercitam limite máximo de oito requests físicos e espaçamento mínimo de 250 ms; deadlines e cancelamentos também permaneceram cobertos pela suíte focada.

## 8. Segurança e observabilidade

Foi acrescentado o evento `Twitch token invalidation`, contendo somente o campo `outcome` com um dos três valores fixos. Os eventos existentes de miss/hit/single-flight e refresh foram preservados.

**[Confirmada]** Testes verificam que token A/B/C e Client Secret não aparecem nos logs do cenário de corrida. A instrumentação não registra token, hash, Client-ID, Client Secret ou Authorization.

**[Confirmada]** Foi acrescentado um teste de timeout OAuth simulado por rejeição mockada com `name: "TimeoutError"`; verifica classificação `timeout`, resposta 503 e ausência de credenciais/detalhe de erro nos eventos. Não houve espera real de 10 segundos nem chamada de rede.

## 9. Arquivos modificados

- `server/search/twitch-token.ts` — invalidação condicional e evento sanitizado.
- `server/search/igdb-client.ts` — entrega do token efetivamente usado à invalidação.
- `tests/search/igdb-observability.test.ts` — reprodução pré-correção, regressões concorrentes, sanitização e timeout OAuth mockado.
- `docs/IGDB_PERFORMANCE_PHASE_4_TWITCH_TOKEN_RACE_REPORT.md` — este relatório.

**Nota sobre a worktree:** os três arquivos de código/teste já tinham modificações preexistentes da preparação e Fases 0–2. Elas foram preservadas; o diff total desses arquivos inclui trabalho anterior e não é atribuído integralmente à Fase 4. Permanecem também outros arquivos previamente modificados/não rastreados, listados na inspeção de status, que não foram removidos nem revertidos.

## 10. Testes e verificações executados

- Reprodução focada antes da correção: **falhou como esperado**, 1 teste, OAuth esperado 2 / observado 3.
- Testes de regressão concorrente após a correção: **2 passaram**.
- Timeout OAuth mockado: **1 passou**.
- ESLint direcionado (`twitch-token.ts`, `igdb-client.ts`, `igdb-observability.test.ts`): passou sem avisos.
- Testes direcionados (5 arquivos IGDB/provider): **96 passaram** antes da inclusão do teste de timeout.
- Suíte completa final (`pnpm test`): **123 arquivos, 1.480 testes passaram**.
- TypeScript (`pnpm exec tsc --noEmit`): passou, inclusive após build.
- ESLint completo (`pnpm lint`): 0 erros; 7 warnings em arquivos fora do escopo (`features/atp/catalog-search.tsx` e `scripts/import-platform-images.mjs`).
- Build (`pnpm build`): passou. Next.js emitiu aviso preexistente sobre múltiplos lockfiles e escolha do workspace root.
- Revisão do diff/status: concluída; a worktree conserva arquivos modificados e não rastreados preexistentes. `git diff --check` reportou whitespace em linhas adicionadas do diff amplo de `igdb-client.ts`, que já continha alterações anteriores à Fase 4; essas alterações não foram reformatadas para evitar tocar no trabalho preexistente.
- O Vitest emitiu aviso de configuração Vite sobre `configLoader: 'native'`; não impediu os testes.

## 11. Cenários concorrentes e resultados

| Cenário | Resultado |
|---|---|
| 401 de A, refresh para B, 401 atrasado de A | **[Confirmada]** Retry atrasado usa B; total de 2 chamadas OAuth. |
| Os dois 401 de A chegam enquanto o refresh está em andamento | **[Confirmada]** Uma renovação compartilhada; ambos repetem com B. |
| Dois 401 em sequência com cache já vazio | **[Confirmada]** A segunda invalidação é inócua (`already_empty`); single-flight mantém uma renovação no processo. |
| Retry 401 seguido de outro 401 | **[Confirmada]** Limitado a uma repetição, conforme regressão existente. |
| Combinações 401/429 | **[Confirmada]** Ambas as ordens cobertas e aprovadas. |
| Timeout OAuth | **[Confirmada]** Classificação exercitada com mock; timeout de relógio/rede real não executado. |

## 12. Riscos remanescentes

- **[Provável]** Uma sequência excepcional de falhas 401 após tokens renovados pode continuar gerando refreshes sequenciais legítimos; esta mudança evita invalidar token substituto por uma resposta antiga, mas não impõe circuit breaker.
- **[Não verificada]** Não foram medidos latência, volume de 401 nem economia de requests OAuth em produção.
- **[Confirmada]** A comparação é de string do token em memória; nenhum mecanismo de versão separado foi necessário.

## 13. Limitações multi-instância

**[Confirmada]** Cache e single-flight permanecem locais ao processo. Instâncias diferentes podem renovar tokens independentemente e não compartilham estado. A correção impede invalidação obsoleta dentro de cada processo, mas não coordena instâncias.

**[Recomendação]** Não introduzir Redis, lock distribuído ou persistência para esta corrida sem evidência operacional e decisão arquitetural específica.

## 14. Recomendações posteriores

- Observar, por métricas agregadas e sanitizadas, a incidência de 401 e os resultados de invalidação, sem registrar tokens ou credenciais.
- Manter a verificação de segurança dos logs em alterações futuras.
- Tratar qualquer coordenação multi-instância como decisão separada, condicionada a métricas.
- **Não iniciar outra fase automaticamente**; esta entrega encerra somente a Fase 4.

## 15. Veredito final

**Fase 4 concluída.** A corrida foi reproduzida deterministicamente antes da correção; a invalidação agora é condicionada ao token realmente rejeitado. O 401 atrasado não remove token recém-renovado e a renovação duplicada foi eliminada no cenário testado. Os retries, single-flight, scheduler, limites, throttle, cancelamentos e contratos cobertos permaneceram aprovados. TypeScript, testes completos e build passaram. Não foram feitas chamadas reais, instalações, alterações de configuração, commits ou deploys.
