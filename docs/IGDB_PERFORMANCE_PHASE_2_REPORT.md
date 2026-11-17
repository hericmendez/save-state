# Save State — IGDB Performance Optimization — Fase 2

**Data:** 16/11/2026  
**Escopo:** controle local de concorrência HTTP, recuperação limitada de HTTP 429 e integração com single-flight/observabilidade das Fases 0 e 1.  
**Referências:** `docs/IGDB_RATE_LIMIT_PERFORMANCE_AUDIT.md`, `docs/IGDB_PERFORMANCE_PHASE_0_REPORT.md` e `docs/IGDB_PERFORMANCE_PHASE_1_REPORT.md`

## 1. Resumo executivo

O cliente IGDB agora limita a **8** o número local de requests HTTP simultaneamente abertos. Uma fila FIFO de admissão coordena limite de concorrência e espaçamento mínimo de **250 ms** entre inícios físicos. A vaga é adquirida imediatamente antes do fetch e liberada após consumir/cancelar o corpo, ou em falha/timeout/abort.

HTTP 429 recebe no máximo **um retry automático**. `Retry-After` aceita segundos inteiros e data HTTP futura, com orçamento máximo de espera de **2.000 ms**. Valores inválidos/ausentes usam fallback com jitter limitado; valor válido acima do orçamento não é truncado nem ignorado para tentar novamente: a operação termina com o mesmo erro público `RATE_LIMIT_EXCEEDED`/429. Um segundo 429 também propaga 429.

O retry único existente para 401 foi preservado. Os dois motivos de retry têm flags independentes e podem produzir no máximo três tentativas físicas no total (401 uma vez + 429 uma vez), dentro do deadline total de duas janelas do timeout configurado mais o orçamento máximo de espera do 429. A Promise single-flight cobre o ciclo inteiro.

Foram preservados os contratos de erro, o throttle e o comportamento do Twitch; não se introduziram dependências, cache TTL, Multiquery, persistência, Redis ou coordenação distribuída. TypeScript, ESLint direcionado, testes direcionados, suíte completa, ESLint completo e build foram executados. A suíte passou com **123 arquivos e 1477 testes**. O lint completo teve zero erros e sete warnings fora do escopo.

## 2. Diagnóstico anterior

### Fatos confirmados

- O cliente mantinha o throttle local de 250 ms, mas liberava a fila antes do término do fetch. Isso espaçava inícios, sem limitar o total de conexões HTTP abertas.
- A documentação de rate limits da IGDB consultada na auditoria estabelece 4 requests/s e até 8 requests abertos simultaneamente. O estado anterior não impunha esse segundo limite.
- HTTP 429 era registrado e devolvido imediatamente como `RATE_LIMIT_EXCEEDED`/429; `Retry-After` não era lido.
- HTTP 401 já provocava invalidação do token Twitch e um retry único.
- A Fase 1 implementou single-flight por processo para requests equivalentes, mas não controlava a admissão física das chamadas independentes.
- Estado de throttle e single-flight é local ao processo e não é compartilhado entre runtimes Vercel.

### Worktree

Antes da Fase 2, a worktree já continha modificações dos trabalhos anteriores em `server/search/igdb-client.ts`, `server/search/igdb-provider.ts`, `server/search/twitch-token.ts`, `server/shared/logger.ts`, testes de importação e vários relatórios/testes não rastreados. Essas mudanças foram inspecionadas e preservadas. A Fase 2 alterou a implementação do cliente já modificado e estendeu o teste de observabilidade; não houve reset, checkout, limpeza de arquivos, commit, push, merge, rebase ou deploy.

## 3. Arquitetura do controle de concorrência

Foi implementado um scheduler local em `server/search/igdb-client.ts` que concede um `PhysicalPermit` quando as duas condições são verdadeiras:

1. `requestsInFlight < IGDB_MAX_IN_FLIGHT` (8).
2. O início físico respeita `IGDB_MIN_INTERVAL_MS` (250 ms) desde o início anterior.

O scheduler:

- mantém waiters FIFO;
- não reserva vaga enquanto espera o próximo horário de throttle;
- não reserva vaga durante OAuth Twitch ou backoff;
- diferencia `throttleWaitMs` de `concurrencyWaitMs`;
- concede vaga e atualiza o contador imediatamente antes do fetch;
- libera o permit em `finally`, incluindo falha, timeout, cancelamento, resposta com erro e parsing do corpo;
- conta o corpo de sucesso como aberto até a leitura JSON terminar; para respostas não-2xx tenta cancelar o corpo antes de liberar;
- limita a fila de espera local a 500 entradas; excesso recebe `IGDB_UNAVAILABLE`/503 e evento de rejeição de admissão, evitando uma fila sem limite;
- não permite que retries ultrapassem waiters anteriores: cada retry retorna à cauda da fila.

O throttle usa um pequeno tick de reserva entre concessão do permit e a continuação que chama `fetch`, evitando que a latência de agendamento permita início físico abaixo de 250 ms. A validação mockada observou espaçamento de pelo menos 250 ms.

Uma operação que aguarda recursos tem deadline. Seu prazo é `2 × timeoutMs + 2.000 ms`, iniciado no começo da operação compartilhada. O deadline abrange espera de admission, execução e espera de retry. Se o deadline terminar antes de qualquer 429, o erro de indisponibilidade existente é preservado; se já houve 429 e o retry não cabe no prazo, o erro público final permanece 429.

## 4. Política de HTTP 429

Constantes efetivas:

- `IGDB_MAX_RETRY_AFTER_MS = 2.000`.
- No máximo um retry automático para 429 por operação single-flight.
- Fallback inicial: jitter entre 125 e menos de 250 ms (backoff de primeira tentativa, limitado a 1.000 ms).
- Deadline total: `2 × timeoutMs + 2.000 ms`.
- Throttle de 250 ms é independente do backoff e nunca é reduzido.

Tratamento de `Retry-After`:

- Dígitos não negativos são interpretados como segundos inteiros.
- Data HTTP válida é convertida em atraso relativo ao instante de recebimento; data no passado implica espera zero, sujeita ainda ao throttle.
- Header ausente/malformado, valor decimal ou negativo é inválido e aciona fallback com jitter.
- Atraso válido maior que 2.000 ms é excessivo: não se faz retry e retorna-se `RATE_LIMIT_EXCEEDED`/429.
- Se o atraso válido não couber no deadline total, não se inicia retry e mantém-se 429.
- Em retry que também retorna 429, não há uma segunda espera; retorna-se 429.

Não há retry automático de 400, 403, 404, 5xx, falha de conexão ou timeout. 401 mantém sua própria política descrita na seção seguinte.

## 5. Interação com retry 401

O retry 401 permanece independente do retry 429:

- No primeiro 401, invalida-se o token cacheado, registra-se o evento e a mesma operação single-flight continua após obter token válido.
- Um segundo 401 termina com o erro de credenciais existente; o evento de budget exaurido identifica `max_401_retries`.
- Um 429 pode ser repetido uma vez, independentemente de o retry 401 ter ocorrido antes ou depois.
- Não há loop: cada flag de motivo só pode transitar uma vez; no máximo três tentativas físicas podem acontecer.
- Cada tentativa física volta à fila FIFO, obtém novo permit e respeita o throttle.
- A vaga da tentativa anterior é liberada antes da renovação do token, backoff ou tentativa seguinte.
- O ciclo inteiro, inclusive retries e espera, continua sob uma única Promise single-flight. Seguidores não ganham permits separados.

Sequências mockadas `401 → 200`, `401 → 429 → 200` e `429 → 401 → 200` passaram. Se o deadline total se esgotar, não se inicia nova tentativa. O gerenciador Twitch não foi alterado nesta fase.

## 6. Deadlines, filas e cancelamento

### Deadline e timeout físico

- O timeout individual de cada fetch continua limitado pelo `options.timeoutMs`, mas também é reduzido ao tempo restante do deadline total.
- Deadline total interrompe fetch via signal compartilhado e remove waiter de admission/backoff.
- `AbortSignal.any` combina o signal da operação com o timeout físico.
- A chamada OAuth é aguardada com race cancelável; cancelamento do IGDB não altera o contrato nem cancela o cache/token manager, que mantém seu próprio timeout.
- Operações que expiram na fila não iniciam fetch nem retêm listener de admission.

### Semântica do cancelamento compartilhado

- Um signal passado ao consumidor cancela somente a espera daquele consumidor.
- Outros consumidores continuam recebendo o resultado e a operação física segue.
- Se todos os consumidores cancelarem antes do término, o controller da operação compartilhada é abortado; fetch, backoff ou espera de vaga são cancelados e o permit é liberado quando o fetch rejeita o abort.
- Cancelamento de um consumidor durante resposta/backoff não remove a Promise compartilhada enquanto restarem consumidores.
- O timeout físico continua sendo a proteção final de uma chamada ativa. A admissão de uma operação isolada cancelada enquanto aguarda recursos é removida imediatamente.
- Cancelamento não é convertido em sucesso silencioso: o consumidor cancelado recebe sua razão de abort; os demais recebem o erro/resultado real da operação.

Listeners são removidos ao resolver/rejeitar, o timer de deadline é limpo no término, e o timer de backoff é cancelado pelo signal. O reset exportado é apenas hook de teste.

## 7. Single-flight e compatibilidade

O mapa de single-flight da Fase 1 foi preservado:

- é consultado antes de iniciar a operação/admission;
- uma chamada líder cria o ciclo inteiro; seguidores recebem a mesma Promise;
- seguidores não consomem permits;
- a chave continua isolando endpoint, corpo, timeout, rota, operação e fingerprint das credenciais;
- AbortSignal do consumidor não integra a chave;
- a Promise sai do mapa em sucesso/falha/cancelamento final, sem retenção de resultados;
- o limite de 500 operações single-flight pendentes permanece; novas chaves além do limite seguem sem coalescing, mas ainda passam pelo scheduler/admission.

Throttle, operação compartilhada e retries interagem no nível de tentativa física: cada retry é uma nova tentativa e precisa de permit; seguidores permanecem fora da contagem de vagas.

Não houve mudança em `server/search/import.ts`, nos schemas, nas rotas públicas, em `GlobalGame`/`UserGame` ou no provider ATP.

## 8. Observabilidade

Os eventos existentes da Fase 0 e Fase 1 são preservados. Tentativas físicas continuam emitindo `IGDB external request` uma vez por tentativa, incluindo `execution: "external"` e `attempt`. Campos novos/atualizados:

- `concurrencyWaitMs`: espera de concorrência separada da espera `throttleWaitMs`.
- `inFlight` e `maxInFlight`: contadores locais do scheduler.
- `IGDB admission waiting`: motivo `throttle` ou `concurrency`, quantidade enfileirada e requests em voo.
- `IGDB admission cancelled`: deadline ou cancelamento durante espera por recurso, fase e tempos de espera.
- `IGDB admission rejected`: fila atingiu o limite local.
- `IGDB consumer cancelled`: fase da operação, consumidores restantes e se a operação compartilhada foi abortada.
- `IGDB retry`: motivo `unauthorized` ou `rate_limit`, número da tentativa/retry; para 429, `delaySource` (`retry_after`/`fallback`) e `waitMs`.
- `IGDB retry budget exhausted`: limite 401/429, `Retry-After` excessivo ou deadline.
- `IGDB external request` em cancelamento durante fetch registra tentativa física cancelada e razão sanitizada.

Não se registram corpo Apicalypse, termo, IDs individuais, resposta, headers completos, token ou credenciais. A rota e operação continuam rótulos de baixa cardinalidade. Uma tentativa externa não é contabilizada novamente nos eventos de retry/admission.

## 9. Arquivos modificados

Alterações desta Fase 2:

- `server/search/igdb-client.ts` — scheduler de concorrência/throttle, deadline, retries limitados de 429, cancelamento e eventos.
- `tests/search/igdb-observability.test.ts` — cenários de concorrência, Retry-After, retries combinados, timeout/deadline e cancelamento.
- `docs/IGDB_PERFORMANCE_PHASE_2_REPORT.md` — este relatório.

Outros arquivos que continuam modificados na worktree — incluindo `server/search/igdb-provider.ts`, `server/search/twitch-token.ts`, `server/shared/logger.ts`, `tests/search/igdb-import.test.ts` e relatórios de Fases anteriores — já estavam modificados/não rastreados antes da Fase 2. Foram preservados e não foram alterados por esta fase, exceto o teste de observabilidade citado acima, já existente e expandido.

## 10. Testes executados

### Cobertura de cenários

`tests/search/igdb-observability.test.ts` foi expandido para verificar:

- limite de 8 requests abertos com 9 operações distintas e liberação de vaga;
- espaçamento entre inícios físicos de pelo menos 250 ms;
- single-flight para chamadas idênticas com seguidores sem chamadas físicas/permissores extras;
- rejeições, retry 429, retry 401 e recuperação sem manter requests em voo;
- Retry-After em segundos e data HTTP;
- header inválido, negativo ou ausente usando fallback com jitter;
- header além do orçamento e segundo 429 preservando 429;
- ausência de retry em outros 4xx e em 5xx;
- sequências 401/429 sem loops;
- consumidor cancelado durante response/backoff e durante espera de admission;
- deadline de operação enquanto aguarda vaga;
- último consumidor cancelando o fetch compartilhado e liberação de permit;
- sanitização de eventos de retry/cancelamento e contagem física.

### Resultados

| Validação | Resultado |
|---|---|
| TypeScript (`pnpm exec tsc --noEmit`, isolado após o build) | Passou |
| ESLint direcionado (`igdb-client.ts`, `igdb-observability.test.ts`) | Passou sem warnings |
| Testes direcionados (observabilidade, provider, IGDB direto e import) | 4 arquivos, **83 testes passaram** |
| Suíte completa (`pnpm test`) | **123 arquivos, 1477 testes passaram** |
| ESLint completo (`pnpm lint`) | 0 erros, 7 warnings fora do escopo |
| Build (`pnpm build`) | Passou; compilação e geração de 60 páginas concluídas |
| Diff whitespace (`git -c core.whitespace=cr-at-eol diff --check`, arquivos desta fase) | Passou |

Warnings observados:

- ESLint completo: um warning em `features/atp/catalog-search.tsx` e seis diretivas não utilizadas em `scripts/import-platform-images.mjs`, todos fora do escopo.
- Vitest/Vite reportou aviso sobre `configLoader: 'native'`.
- Next.js detectou lockfiles no diretório pai e no projeto e selecionou o diretório pai como workspace root.
- Uma execução inicial de `tsc` paralela ao build encontrou `.next/types` sendo regenerado e falhou por arquivos temporariamente ausentes. A execução isolada após o build passou; o próprio build também completou a verificação de tipos.

Não foram feitas chamadas reais à IGDB/Twitch, carga externa, acesso a produção/Atlas, instalações, migrations, seeds ou deploy.

## 11. Cenários mockados e evidências

| Cenário | Resultado observado |
|---|---|
| 9 operações IGDB diferentes, respostas mantidas abertas | Máximo observado: 8; a 9ª iniciou depois da liberação de vaga |
| Inícios das chamadas físicas | Todos espaçados por pelo menos 250 ms |
| 2 e 10 consumidores idênticos em single-flight | 1 fetch físico; seguidores não usam permits extras |
| 429 + Retry-After seconds/date válido + sucesso | 2 tentativas físicas; retry usa atraso indicado, sob o throttle |
| 429 sem/Retry-After inválido/negativo + sucesso | 2 tentativas; evento mostra fallback e atraso limitado com jitter |
| Retry-After acima de 2.000 ms | 1 tentativa; erro 429 preservado |
| Dois 429 consecutivos | 2 tentativas físicas; sem segundo retry e erro 429 preservado |
| 401 → 200 | 2 tentativas físicas, renovação e sucesso |
| 401 → 429 → 200 e 429 → 401 → 200 | 3 tentativas físicas; sem loop |
| 400/403/404/5xx | 1 tentativa física; nenhum retry automático |
| Timeout/rede seguido de nova operação | Permit liberado e operação seguinte pode iniciar |
| Cancelamento enquanto aguarda throttle/concurrency | Waiter removido, sem fetch para o consumidor cancelado |
| Cancelamento de um seguidor durante backoff | Seguidor recebe abort; operação restante conclui |
| Cancelamento do último consumidor durante fetch | Signal compartilhado aborta fetch; permit liberado; chamada posterior inicia |
| Deadline aguardando vaga | Operação rejeitada em 503 sem fetch físico adicional |

Os cenários são mocks controlados e não constituem benchmark nem medição de comportamento do serviço IGDB real.

## 12. Impacto em latência e utilização

- O limite de 8 é teto máximo, não alvo de ocupação. Requisições rápidas normalmente deixam slots livres.
- O throttle continua limitando inícios a aproximadamente 4/s por processo no melhor caso. Requests lentos podem ocupar oito slots; novas operações aguardam, reduzindo a taxa efetiva abaixo do teto de throttle.
- Uma chamada que espera pode acumular atraso de throttle e de concorrência; os dois são medidos separadamente.
- 429 pode acrescentar até 2 s de espera indicado pelo servidor, além do tempo do retry e do spacing que ainda for necessário. O fallback de primeira tentativa é de 125–250 ms e também respeita o throttle.
- Deadline total é no máximo duas janelas do timeout por request mais 2 s de orçamento de espera: 22 s para timeout de 10 s e 32 s para timeout de 15 s. A maioria das operações termina antes; retries e espera podem elevar a latência percebida.
- Em carga com respostas lentas, o teto de concorrência protege a quota publicada, mas pode aumentar a espera FIFO e a latência de chamadas enfileiradas. Não houve teste de carga ou medição de produção.
- Não se afirma redução percentual de uso ou aumento de throughput real.

## 13. Limitações multi-instância na Vercel

O scheduler, contadores, fila e single-flight são locais ao processo Node.js. Cada instância mantém seu próprio limite de 8, sua fila e espaçamento de 250 ms. A soma entre instâncias pode ultrapassar 8 requests abertos ou 4 inícios/s da aplicação. Cold starts reiniciam o estado. A implementação **não garante quota global** e não adiciona Redis, Atlas lock, gateway ou rate limiter distribuído.

## 14. Riscos remanescentes

1. Uma falha de rede no instante em que o servidor recebeu o request, mas antes de o cliente receber resposta, permanece ambígua; não há retry automático de conexão/timeout.
2. Deadline limitado pode impedir uma terceira tentativa completa quando uma sequência combinada já consumiu quase todo o orçamento; a operação termina com erro compatível com o último limite aplicável.
3. O cancelamento de todos os consumidores depende de o runtime/fetch respeitar AbortSignal para fechar imediatamente a conexão física; o timeout físico continua como salvaguarda.
4. A fila é FIFO por processo, mas uma sequência contínua de chamadas pode manter chamadas novas esperando; deadlines evitam espera indefinida e a fila tem limite de 500.
5. Retentativas podem aumentar latência e consumo de requests em episódios 429. O máximo local é finito, mas instâncias Vercel independentes ainda podem repetir simultaneamente.
6. O cache/token manager Twitch e sua interação sob 401 concorrentes não foram alterados; o problema potencial de invalidações concorrentes identificado na auditoria continua sendo estado preexistente.
7. Um Retry-After maior que 2 s é deliberadamente rejeitado para evitar espera excessiva; o Save State devolve 429 e cabe ao consumidor decidir nova tentativa.
8. Métricas são logs por tentativa/processo, sem agregação persistente ou percentis calculados.

## 15. Recomendações para a próxima fase

1. Acompanhar 429, `delaySource`, esgotamento de retry, espera de admission e `maxInFlight` em logs autorizados, sem query/PII.
2. Rever valores de 2 s de Retry-After e deadline usando dados reais de latência e expectativa de UX, sem reduzir os 250 ms.
3. Verificar com IGDB/Twitch a quota agregada/credencial e decidir se o estado local é suficiente; não interpretar o teto por processo como global.
4. Caso haja requisito de limite global, propor arquitetura distribuída separadamente, incluindo comportamento fail-open/fail-closed, latência e custo.
5. Manter as fronteiras de importação/snapshot e o ramo ATP sem alterações; qualquer mudança futura deve ser faseada e testada.
6. Não iniciar Fase 3 automaticamente.

## 16. Veredito final

**Fase 2 concluída para resiliência local do cliente IGDB.** A admissão FIFO limita requests abertos a 8 por processo e mantém pelo menos 250 ms entre inícios físicos. O slot só é usado pela chamada líder single-flight e é liberado em sucesso, erro, timeout e cancelamento. HTTP 429 tem um retry máximo, respeita Retry-After limitado ou fallback com jitter e deadline; esgotamento mantém o contrato 429. Retry 401 permanece independente e limitado a uma repetição, sem ciclos combinados.

Observabilidade cobre waits de throttle/concurrency, in-flight, retries, origem/tempo de atraso, budget esgotado e cancelamentos, sem registrar corpo, IDs ou credenciais. **Não há garantia entre instâncias Vercel.**

Validação final: **TypeScript passou; ESLint direcionado passou; 83 testes direcionados e 1477 testes da suíte passaram; build passou; ESLint completo teve zero erros e sete warnings fora do escopo.** Nenhuma dependência, infraestrutura, persistência, TTL, Multiquery ou alteração ATP/importação foi introduzida. A Fase 3 não foi iniciada.
