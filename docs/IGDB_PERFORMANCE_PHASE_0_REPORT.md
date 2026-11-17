# Save State — IGDB Performance Optimization — Fase 0

**Data:** 15/11/2026  
**Escopo:** instrumentação observacional de chamadas IGDB e autenticação Twitch, sem mudança de cache, throttling, retry, importação, persistência ou contratos HTTP.  
**Referência:** `docs/IGDB_RATE_LIMIT_PERFORMANCE_AUDIT.md`

## 1. Diagnóstico da instrumentação existente

Antes desta fase, `server/search/igdb-client.ts` já emitia logs individuais de sucesso e de algumas falhas com rota e, em certos casos, latência/status. Não havia contagem estruturada consistente por status, tempo de espera da fila, concorrência em andamento, classificação explícita de timeout/conexão em todos os eventos, nem classificação por operação lógica. Respostas 4xx também registravam até 300 caracteres do corpo Apicalypse, que pode conter texto digitado pelo usuário.

`server/search/twitch-token.ts` registrava falhas de rede e rejeição/erro de status, mas não registrava hit/miss do token, chamadas que compartilhavam a Promise de renovação, sucesso/latência do refresh ou falhas de payload malformado.

O logger existente em `server/shared/logger.ts` escreve JSON estruturado em console, sem serviço externo ou transporte. Sua emissão podia propagar uma exceção de `console`/serialização para o fluxo chamador. Nesta fase, `emit` passou a capturar falhas de logging, tornando a instrumentação não bloqueante.

**Worktree:** havia numerosas alterações preexistentes no checkout, incluindo modificações nos arquivos IGDB/Twitch e logger, além do relatório de auditoria anterior como arquivo não rastreado. Os arquivos-alvo já apareciam modificados antes da implementação e apresentavam diferenças de line endings. As alterações anteriores foram preservadas; não houve reset, checkout, limpeza ou normalização global.

## 2. Arquivos modificados

Alterações funcionais desta fase:

- `server/search/igdb-client.ts`
- `server/search/igdb-provider.ts`
- `server/search/twitch-token.ts`
- `server/shared/logger.ts`
- `tests/search/igdb-observability.test.ts` (novo)
- `docs/IGDB_PERFORMANCE_PHASE_0_REPORT.md` (este relatório)

O estado pré-existente da worktree inclui outros arquivos alterados pelo usuário; não foram incluídos nem revertidos por esta fase. `docs/IGDB_RATE_LIMIT_PERFORMANCE_AUDIT.md` foi lido integralmente e preservado.

## 3. Eventos e métricas implementados

### IGDB

Cada tentativa HTTP externa emite um evento estruturado `IGDB external request` com:

- `endpoint`: rota estática, por exemplo `POST /games` (sem query string).
- `operation`: categoria de baixa cardinalidade (`catalog_search`, `game_detail`, `cover_lookup`, `cover_search`, `filter_resolution`, `platform_catalog`, `platform_detail`).
- `status` e `statusClass` (`2xx`, `4xx`, `5xx`); valores exatos de status identificam 401 e 429 sem perder agrupamento por classe.
- `latencyMs`: duração observada da tentativa externa.
- `throttleWaitMs`: tempo decorrido aguardando slot na fila local, incluindo espera atrás de chamadas anteriores.
- `inFlight`: requisições IGDB em andamento no processo no momento de fechamento da tentativa.
- `maxInFlight`: máximo observado no processo desde o início/reset do runtime.
- `attempt`: número da tentativa na chamada `igdbRequest` (1 ou 2 no fluxo de retry 401 existente).
- `failure`: `timeout` ou `connection` para falhas de transporte; `statusClass: "network_error"` nestes casos.
- `retrying: true` no evento 401 que precede o retry já existente.

As rotas estáticas foram rotuladas no provider para distinguir operação lógica, sem colocar busca, ID, usuário ou conteúdo em etiquetas. Cada chamada física externa é registrada individualmente; os logs podem ser agregados por endpoint/operação/status. Não é gerado identificador de alta cardinalidade por usuário, query ou operação.

`requestsInFlight` conta a janela do `fetch` externo até a chegada dos headers/resposta. `maxInFlight` é escopo do processo/runtime e reinicia com o cold start; não representa concorrência distribuída na Vercel.

O throttle permanece exatamente em **250 ms**. Não foi acrescentado limite de concorrência. Retry continua exclusivamente o retry único já existente em 401.

### Twitch OAuth

Foram implementados eventos:

- `Twitch token cache`, outcome `hit`, `miss` ou `single_flight`.
- `Twitch token refresh`, outcome `success` ou `failure`, com rota fixa e, quando houve resposta, status/classe HTTP.
- Latência de refresh em sucesso e falhas de transporte/resposta.
- Categorias não sensíveis de falha: `timeout`, `connection`, `invalid_response`, `missing_token`; status HTTP para erros retornados pelo servidor OAuth.

O resultado single-flight descreve chamadas locais que observaram uma renovação já pendente. Não coordena instâncias diferentes.

## 4. Estratégia de sanitização

- Removido o registro do corpo Apicalypse em respostas 4xx. O log mantém rota, status/classe, latência, operação e tentativa.
- Nenhuma query string, termo de busca, ID IGDB individual, ID de usuário ou corpo/resposta é registrado nos novos eventos.
- Eventos Twitch não incluem `Client-ID`, `Client Secret`, token ou cabeçalhos.
- Os campos são valores numéricos, enumerações ou nomes de rota/operação controlados pelo código.
- A proteção de redaction existente do logger permanece.
- `emit` agora captura exceções de serialização/escrita para que logging indisponível não interrompa requisições legítimas.
- A telemetria não promete percentis em runtime nem coleta payloads completos.

## 5. Exemplos de logs com valores fictícios

Sucesso IGDB:

```json
{"level":"info","message":"IGDB external request","details":{"endpoint":"POST /games","operation":"catalog_search","status":200,"statusClass":"2xx","latencyMs":84,"throttleWaitMs":0,"inFlight":0,"maxInFlight":2,"attempt":1}}
```

HTTP 429:

```json
{"level":"warn","message":"IGDB external request","details":{"endpoint":"POST /games","operation":"catalog_search","status":429,"statusClass":"4xx","latencyMs":31,"throttleWaitMs":247,"inFlight":0,"maxInFlight":1,"attempt":1}}
```

Cache local do token e refresh:

```json
{"level":"info","message":"Twitch token cache","details":{"outcome":"miss"}}
{"level":"info","message":"Twitch token refresh","details":{"endpoint":"POST id.twitch.tv/oauth2/token","outcome":"success","status":200,"statusClass":"2xx","latencyMs":112}}
{"level":"info","message":"Twitch token cache","details":{"outcome":"hit"}}
```

Os valores acima são exemplos sintéticos; não representam tráfego, latência ou volume de produção.

## 6. Testes e respectivos resultados

Novo teste `tests/search/igdb-observability.test.ts` verifica:

- Métrica em HTTP 200 e retorno inalterado.
- Status/classe em 401, 429 e 5xx, preservando erros existentes.
- Tentativa 1 de 401 e tentativa 2 após refresh, preservando sucesso.
- Timeout e falha de conexão como eventos sanitizados e erro 503 existente.
- Cache miss/hit/single-flight e refresh Twitch concorrente com uma chamada OAuth mockada.
- Erro OAuth 401 com status/classe/latência sem credenciais.
- Ausência de termo de busca e credenciais nos logs, inclusive para 400.
- Observabilidade de concorrência em chamadas simultâneas.
- Operação bem-sucedida mesmo se `console.info` lançar erro.

Resultados executados localmente:

| Verificação | Resultado |
|---|---|
| TypeScript (`pnpm exec tsc --noEmit`) | Passou, sem saída de erro |
| Testes direcionados (`igdb-observability`, `igdb-provider`, `igdb-direct`) | 3 arquivos, 43 testes passaram (execução antes da adição dos dois casos finais de cobertura; os casos novos foram incluídos na suíte completa abaixo) |
| Suíte completa (`pnpm test`) | 119 arquivos, **1426 testes passaram** |
| ESLint direcionado aos arquivos da fase | Passou sem saída |
| ESLint completo (`pnpm lint`) | 0 erros; 7 warnings preexistentes em `features/atp/catalog-search.tsx` e `scripts/import-platform-images.mjs` |
| Build de produção (`pnpm build`) | Passou; compilação e geração de 60 páginas concluídas |

Avisos não bloqueantes observados:

- Vitest/Vite reportou aviso de compatibilidade futura de `configLoader: 'native'`.
- Next.js detectou múltiplos lockfiles e escolheu o lockfile do diretório pai como workspace root. Nenhum lockfile foi alterado.
- ESLint completo manteve sete warnings em arquivos fora do escopo; não foram corrigidos nesta fase.

`git diff --check` reportou whitespace em massa nas linhas dos arquivos IGDB/Twitch previamente modificados, consistente com as diferenças de line endings já existentes na worktree antes desta fase. Não normalizei esses arquivos para evitar sobrescrever o estado anterior do usuário.

Não foram feitas chamadas autenticadas à IGDB/Twitch, testes de carga, acessos ao Atlas, instalações, seeds, migrations ou deploy.

## 7. Impacto estimado da instrumentação

- **Comportamento funcional:** sem mudança pretendida; contratos HTTP, resultados e erros mantidos pelos testes.
- **Throttle/retry:** sem mudança: intervalo de 250 ms e retry 401 único preservados.
- **Dependências/serviços:** nenhum pacote, serviço externo ou coleção adicionado.
- **Tráfego de logs:** uma linha estruturada por tentativa IGDB, substituindo os logs de sucesso/erro que já existiam; além disso, há eventos Twitch por consulta de token para observar hit/miss/single-flight. Isso aumenta o volume de logs de token em relação ao estado anterior. Recomenda-se acompanhar volume e custo Vercel; não há medição de produção para quantificar o aumento.
- **CPU/memória:** contadores escalares por processo e montagem de objetos pequenos. Impacto esperado baixo, sem benchmark e sem estimativa numérica de produção.
- **Falha de log:** emissão protegida por try/catch no logger; falha de observabilidade não altera a resposta de domínio.
- **Agregação:** não há exporter, métrica Prometheus, banco ou serviço analítico. A aplicação emite eventos estruturados; contagens e percentis dependem de consulta/extração posterior dos logs Vercel.

## 8. Métricas ainda indisponíveis

- Percentis p50/p95/p99 calculados dentro da aplicação.
- Contadores persistentes ou agregação entre instâncias Vercel.
- Concorrência máxima agregada entre regiões/instâncias.
- Volume de produção e taxa real de 429.
- Cache hit rate em janela agregada (eventos existem por chamada de token; não existe métrica persistente calculada no app).
- Correlação segura de todas as chamadas HTTP externas pertencentes a uma operação de usuário de ponta a ponta; `operation` é um rótulo categórico, não um correlation ID.
- Duração percebida de ponta a ponta no browser ou latência das rotas internas/MongoDB.
- Resultado e disponibilidade dos logs estruturados no painel Vercel do projeto, não acessado nesta tarefa.

## 9. Limitações para cálculo do baseline

1. Os eventos só passam a existir após esta implementação; não é possível reconstruir retroativamente contagens confiáveis para o período anterior.
2. A instrumentação é por runtime/processo. Instâncias frias reiniciam `maxInFlight`; a Vercel pode distribuir requisições por instâncias sem estado compartilhado.
3. `throttleWaitMs` mede espera local desde entrada na fila até obtenção do slot; não inclui tempo de rede ou espera antes da invocação da função.
4. `latencyMs` mede tentativa externa, não todo o fluxo BFF, autenticação, consulta MongoDB ou processamento Zod.
5. Uma repetição 401 aparece como duas tentativas externas, com `attempt` 1 e 2; ambas contam no número de requests físicos.
6. `operation` é categórico e de baixa cardinalidade. Consultas a `companies` e `involved_companies` podem ser classificadas sob `filter_resolution`; agregação não identifica qual termo foi pesquisado (intencionalmente).
7. Logs individuais permitem calcular percentis apenas se o provedor exportar/consultar os campos numéricos sem truncamento e com amostra/retention suficientes. A aplicação não calcula p50/p95/p99 nem garante que o plano Vercel disponibilize essa análise.
8. Sem volume real e janela amostral, não há valores de baseline nem conclusões de capacidade.

### Modelo de baseline a preencher com dados Vercel

Preencher após período representativo de tráfego e validar cobertura/retention da consulta aos logs. Valores ficam deliberadamente em branco:

| Janela | Endpoint | Operação | Requests (tentativas físicas) | 2xx | 401 | 429 | 5xx | Timeout | Conexão | p50 ms | p95 ms | p99 ms | Espera throttle p50/p95 ms | Máx. concorrência observada |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A preencher | `POST /games` | `catalog_search` | — | — | — | — | — | — | — | — | — | — | — | — |
| A preencher | `POST /games/count` | `catalog_search` | — | — | — | — | — | — | — | — | — | — | — | — |
| A preencher | `POST /games` | `game_detail` | — | — | — | — | — | — | — | — | — | — | — | — |
| A preencher | Outros endpoints | Por operação | — | — | — | — | — | — | — | — | — | — | — | — |

Resumo OAuth separado:

| Janela | Cache hit | Cache miss/refresh | Single-flight | Refresh success | Falhas por categoria | p50/p95/p99 refresh (se calculáveis) |
|---|---:|---:|---:|---:|---|---|
| A preencher | — | — | — | — | — | — |

Incidência de 429 deve usar `429 / total de tentativas IGDB` na mesma janela, mostrando numerador e denominador. Percentis devem ser computados sobre `latencyMs` apenas se os dados completos estiverem disponíveis; não calcular percentil a partir de médias.

## 10. Recomendações para a Fase 1

1. Extrair uma janela representativa de logs Vercel e preencher o modelo acima, sem exportar query strings, IDs pessoais ou payloads.
2. Confirmar que o painel/consulta Vercel indexa eventos JSON e preserva `latencyMs`, `throttleWaitMs`, `operation`, `endpoint`, `status`, `attempt` e timestamps.
3. Revisar custo/volume dos eventos Twitch; se necessário, tomar decisão explícita sobre sampling/agregação sem perder miss, refresh, single-flight e falhas.
4. Comparar taxa de 429, espera da fila e máximo observado com volume por operação antes de escolher cache distribuído ou limiter coordenado.
5. Prosseguir para otimizações de cache/deduplicação somente na Fase 1 autorizada, preservando validação contratual e sem misturar a decisão de quota global com cache de domínio.
6. Não iniciar cache, rate limiting distribuído, alteração de importação ou Multiquery nesta entrega.

## 11. Veredito final

**Fase 0 concluída no escopo de código e validação local.** O logger existente agora produz eventos estruturados para tentativas IGDB e lifecycle do token Twitch, com labels de baixa cardinalidade, medição de latência/espera/concorrência observada e proteção para não registrar termos de busca ou credenciais. O log do corpo Apicalypse foi removido de 4xx e falhas de emissão de log não interrompem operações.

TypeScript, testes direcionados, suíte completa, ESLint e build de produção foram executados. A suíte completa passou com **119 arquivos e 1426 testes**; o lint completo passou sem erros, com sete warnings fora do escopo; o build terminou com avisos de workspace/lockfiles. Não há dados de produção coletados nesta fase e percentis dependem de agregação externa dos logs.

**Não houve mudança em cache, throttle, política de retry, importação, persistência, schemas MongoDB, ATP, dependências ou contratos HTTP.** A Fase 1 não foi iniciada.
