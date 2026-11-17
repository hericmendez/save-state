# Save State — IGDB Performance Optimization — Fase 3: Auditoria de Homologação

**Data:** 17/11/2026
**Modo:** auditoria somente leitura, exceto a criação deste relatório.
**Escopo:** verificação estática do estado atual das Fases 0–2, execução local de testes com `fetch` mockado, avaliação de observabilidade e planejamento.
**Evidência:** **Confirmada** = demonstrada por código/teste executado ou registro observado; **Provável** = inferência técnica sustentada, sem medição real; **Não verificada** = depende de dados/acessos ausentes.

## 1. Resumo executivo

- **[Confirmada]** As principais mudanças descritas nas Fases 0–2 continuam presentes no código atual: eventos estruturados e sanitizados, single-flight local, fila FIFO com throttle de 250 ms, limite de oito permits físicos, retry limitado para 429, retry 401, deadlines e cancelamento por consumidor.
- **[Confirmada]** Nesta auditoria foram executados quatro arquivos de teste focados, todos com mocks: 4 arquivos e **83 testes passaram**. Não houve chamada autenticada à IGDB/Twitch, teste externo, navegador, banco ou ambiente remoto.
- **[Confirmada]** Não havia neste contexto uma integração autorizada e somente leitura para logs de homologação Vercel. Produção não foi acessada. Portanto não há baseline real de volume, 429, latências, waits, concorrência ou refresh Twitch.
- **[Não verificada]** Não se pode declarar ganho ou regressão de performance em produção, nem concluir se cache compartilhado ou limiter distribuído se justificam por tráfego observado.
- **[Confirmada]** A worktree já tinha modificações e arquivos não rastreados antes desta auditoria. Nenhum deles foi alterado; a única alteração desta fase é este relatório.
- **[Confirmada]** Risco de prioridade **média**: a invalidação do token após 401 é incondicional. Respostas 401 concorrentes podem invalidar um token recém-renovado por outra chamada e causar refresh adicional.
- **[Confirmada]** Risco de prioridade **baixa**: `Retry-After` como data é avaliado com `Date.parse`, mais permissivo que a sintaxe estrita de data HTTP. O código pode tratar algumas strings parseáveis que não são datas HTTP como valores válidos.
- **[Provável]** Filas e retries podem aumentar latência percebida em concorrência ou 429. Os prazos de 22/32 s são limites de uma operação `igdbRequest`, não necessariamente do fluxo completo da rota, que pode executar várias operações sequenciais.

**Veredito:** homologação local mockada aprovada para os casos focados executados. Homologação funcional no navegador e validação operacional na Vercel permanecem pendentes. Não há evidência para aprovar novas infraestruturas ou alegar ganhos de produção.

## 2. Estado atual das Fases 0–2

### Fase 0 — observabilidade

- **[Confirmada]** `server/search/igdb-client.ts`, `server/search/twitch-token.ts` e `server/shared/logger.ts` emitem eventos estruturados para requests externos, ciclo do token, erros e retries.
- **[Confirmada]** Os eventos usam rotas/operações fixas e não registram corpo Apicalypse, termos, tokens ou credenciais. O teste atual verifica que consulta e credenciais fictícias não aparecem nos logs.
- **[Confirmada]** Logger protege o fluxo de aplicação contra erro de serialização/escrita no console.
- **[Não verificada]** Retenção, indexação, completude e consultabilidade desses logs no projeto Vercel não foram verificadas.

### Fase 1 — single-flight e importação

- **[Confirmada]** O mapa `pendingRequests` deduplica requests IGDB equivalentes enquanto estão pendentes, com chave JSON que inclui endpoint, corpo exato, timeout, rota, operação e fingerprint SHA-256 das credenciais.
- **[Confirmada]** Respostas concluídas não ficam em cache; o limite de entradas pendentes é 500. Ao atingir o limite, chamadas novas podem seguir sem single-flight.
- **[Confirmada]** Importação continua usando `GlobalGame.igdbId` como identidade externa e mantém o snapshot como autoridade do servidor; não houve leitura de modelos nem execução de banco nesta fase.
- **[Confirmada]** Single-flight não elimina consulta sequencial já concluída entre formulário e importação.

### Fase 2 — scheduler e recuperação

- **[Confirmada]** Constantes atuais: 250 ms entre inícios, máximo local de 8 em voo, Retry-After máximo de 2.000 ms, jitter fallback de 125 a menos de 250 ms e máximo de um retry 429.
- **[Confirmada]** Cada operação `igdbRequest` tem deadline configurado como `2 × timeoutMs + 2.000 ms`; timeout de chamada individual não ultrapassa `timeoutMs` nem o tempo restante.
- **[Confirmada]** Os retries de 401 e 429 têm limites independentes. Cada tentativa física volta ao scheduler.
- **[Confirmada]** Todo esse estado é local ao processo. Não há garantia agregada entre runtimes/instâncias Vercel.

### Worktree observada no início da auditoria

`git status --short` mostrou modificações em `server/search/igdb-client.ts`, `server/search/igdb-provider.ts`, `server/search/twitch-token.ts`, `server/shared/logger.ts` e `tests/search/igdb-import.test.ts`, além de documentos e `tests/search/igdb-observability.test.ts` não rastreados. Esses itens já estavam presentes antes desta fase. Os quatro relatórios obrigatórios e o código atual foram inspecionados; os arquivos existentes foram preservados.

## 3. Análise do scheduler e single-flight

### Scheduler FIFO e throttle

- **[Confirmada]** `admissionQueue` é FIFO. A cabeça só recebe permit se houver capacidade e se o espaçamento desde o início anterior tiver sido respeitado.
- **[Confirmada]** Espera de throttle não reserva permit. Espera OAuth e backoff também ocorrem fora do permit.
- **[Confirmada]** A vaga é protegida por `release()` idempotente e chamada em `finally` em torno de fetch/consumo ou cancelamento do corpo da resposta.
- **[Confirmada]** A fila de espera tem limite de 500 waiters. Uma operação que espera tem timer de deadline, que aborta o signal usado para retirar o waiter.
- **[Confirmada]** O código acrescenta 1 ms ao relógio de referência no momento da concessão para compensar a continuação assíncrona antes do `fetch`. Teste mockado verificou diferenças de timestamps `Date.now()` de pelo menos 250 ms.
- **[Provável]** FIFO mais deadlines evita starvation indefinido para uma operação individual, mas não garante baixa latência: uma sucessão de operações à frente pode fazer uma chamada expirar. Nenhum teste de fairness sustentada ou de fila cheia foi executado nesta auditoria.
- **[Confirmada]** Testes atuais cobrem nove operações distintas, teto de oito, liberação de vaga, spacing, cancelamento esperando admission e deadline de uma nona operação. Não cobrem saturação real de 500 waiters.

### Concorrência física e permits

- **[Confirmada]** O contador aumenta antes de iniciar o fetch e o permit fica ocupado até a leitura JSON em sucesso ou tentativa de cancelamento do corpo em resposta não-2xx. Assim, a janela contada é conservadora em relação ao tempo de fetch e inclui consumo do corpo.
- **[Confirmada]** O contador/máximo é por processo, não global. Logs em conclusão registram `inFlight` após liberação; `maxInFlight` fornece o máximo observado localmente.
- **[Provável]** `response.body.cancel()` normalmente termina rapidamente, mas o `await` ocorre enquanto o permit está ocupado e não possui um timer próprio. Um cancelamento de stream upstream que demorasse anormalmente poderia reter a vaga até sua resolução; isso não foi reproduzido.
- **[Confirmada]** O limite de oito e a ordem FIFO são exercitados com fetch mockado, não com conexões reais IGDB.

### Single-flight e riscos de corrida

- **[Confirmada]** Líder e seguidores compartilham uma única Promise e somente o líder chega à aquisição de permit. O sinal do consumidor não integra a chave.
- **[Confirmada]** Cancelar um consumidor rejeita somente a espera dele. Quando todos cancelam, o controller compartilhado é abortado e a chave é removida do mapa.
- **[Provável]** Ao cancelar todos os consumidores, uma chamada idêntica nova pode iniciar enquanto a operação antiga ainda está encerrando o abort. A capacidade do scheduler continua limitando permits, mas pode haver curta sobreposição de encerramento e nova chamada. Não há teste de corrida específica nessa janela.
- **[Confirmada]** As operações acima do limite de 500 chaves pendentes bypassam deduplicação, mas ainda passam pelo scheduler físico.
- **[Confirmada]** Não foi encontrado caminho de rejeição de Promise de cleanup sem handler: o cleanup derivado de `finally` tem `.catch`, e a Promise principal é entregue aos consumidores.
- **[Não verificada]** Starvation sob tráfego continuamente saturado e comportamento em múltiplos runtimes não foram medidos.

## 4. Avaliação de concorrência e cancelamento

Testes existentes e executados nesta auditoria demonstraram:

- **[Confirmada]** Uma chamada física para dois e dez consumidores equivalentes concorrentes; seguidores geram evento `IGDB single-flight`.
- **[Confirmada]** Bodies, endpoints, operação lógica e fingerprint de credenciais distintos não compartilham a Promise.
- **[Confirmada]** Chamada sequencial após conclusão realiza novo fetch.
- **[Confirmada]** Nove requests distintos não ultrapassam oito abertos no mock; a nona inicia após liberação de slot.
- **[Confirmada]** O teste de timestamp verificou espaçamento mínimo de 250 ms no ambiente local desta execução.
- **[Confirmada]** Cancelamento de consumidor durante resposta/backoff não prejudica o consumidor restante.
- **[Confirmada]** Cancelamento do último consumidor aborta o fetch mockado e uma chamada posterior consegue usar o scheduler.
- **[Confirmada]** Cancelamento aguardando throttle e deadline aguardando vaga são cobertos.
- **[Limitação]** A implementação liga o signal do browser ao request same-origin, mas não há evidência de que o cancelamento do request HTTP do browser seja encaminhado pelo Route Handler até `igdbRequest`. A busca geral documenta explicitamente que o BFF pode continuar o trabalho após abort do browser. Portanto, cancelamento garantido nesta auditoria significa o `AbortSignal` que chega ao cliente IGDB, não qualquer desconexão de browser.
- **[Provável]** Busca obsoleta pode continuar consumindo slot/upstream se o BFF não propagar abort; a UI descarta resposta antiga, mas isso não equivale a cancelar o trabalho externo.

Os testes empregam fetch mockado e alguns usam relógio real/polling curto; não são simulação de runtime Vercel nem benchmark de rede.

## 5. Política de retries e deadlines

- **[Confirmada]** HTTP 429 tem no máximo um retry automático. Segundo 429, Retry-After excessivo ou atraso que não cabe no deadline preserva erro `RATE_LIMIT_EXCEEDED`/429.
- **[Confirmada]** Segundos, data parseável, valor inválido, negativo, ausente e valor acima do orçamento têm casos nos testes.
- **[Confirmada]** 400/403/404 e 5xx não recebem retries automáticos nos casos testados. Falha de rede e timeout também não são repetidos automaticamente.
- **[Confirmada]** Retry 401 continua sendo uma tentativa adicional independente. Sequências combinadas podem ter até três tentativas físicas; o deadline total pode interromper uma sequência antes do máximo.
- **[Confirmada]** A data passada converte em atraso zero, mas o retry ainda retorna ao scheduler e respeita o throttle.
- **[Risco baixo — Confirmada]** `parseRetryAfter` usa `Date.parse` genericamente, e não valida a gramática de HTTP-date. Isso pode aceitar strings de data não HTTP que o runtime consiga interpretar. Recomendação: avaliar parsing estrito antes de depender do header como protocolo; não alterar nesta fase.
- **[Confirmada]** O deadline de 22 s (timeout 10 s) ou 32 s (timeout 15 s) aplica-se a uma operação `igdbRequest`, não necessariamente à experiência total da rota. O provider pode fazer detalhe principal e duas consultas sequenciais de empresas, ou `/games` e `/games/count`; cada request possui seu próprio ciclo/deadline.
- **[Provável]** Como consequência, o tempo acumulado de uma rota com várias chamadas seriais pode exceder 22/32 s em condições extremas, embora cada request individual respeite seu prazo. Não há medição do framework/cliente para quantificar o impacto ou confirmar se algum timeout externo menor encerra a rota antes.
- **[Confirmada]** A chamada OAuth tem timeout próprio de 10 s, fora do permit IGDB, e a espera dela é cancelável para a operação IGDB. O fetch OAuth subjacente não recebe o signal da operação; pode continuar até seu timeout e eventualmente preencher o cache após todos os consumidores IGDB cancelarem.

## 6. Segurança da renovação Twitch

- **[Confirmada]** Client Secret e token são usados somente em módulos `server-only`; eventos testados não os registram. O cache do token tem margem de 60 s e single-flight de renovação por processo.
- **[Confirmada]** O cliente IGDB invalida o cache em qualquer 401 e então solicita token novamente. Não foi encontrada coordenação global entre processos.
- **[Risco médio — Confirmada]** `invalidateTwitchToken()` limpa o cache sem identificar qual token foi rejeitado. Exemplo de corrida tecnicamente possível: duas operações distintas usam token antigo; a primeira recebe 401 e obtém/cacheia token novo; a segunda recebe seu 401 atrasado e invalida incondicionalmente o token novo, iniciando outro refresh. Isso pode causar refresh redundante ou ampliar falha durante renovação. Não há evidência de ocorrência real nem teste concorrente específico.
- **[Recomendação]** Em trabalho futuro autorizado, avaliar invalidação condicional por geração/token rejeitado ou single-flight de recuperação 401; acrescentar teste determinístico para a ordem “refresh novo concluído → 401 atrasado do token antigo”.
- **[Confirmada]** Testes atuais cobrem refresh compartilhado normal, cache hit/miss, 401 seguido de retry e combinações sequenciais 401/429, mas não comprovam ausência da corrida entre operações independentes.
- **[Não verificada]** Frequência de 401, refresh por instância e erros OAuth na Vercel são desconhecidos.

## 7. Resultados da homologação local

### Testes que já existiam antes desta execução

`tests/search/igdb-observability.test.ts` e outros testes de provider/direto/import já cobriam:

- logs sanitizados, ausência de corpo de consulta e credenciais;
- single-flight, isolamento da chave e chamadas sequenciais;
- retries 401/429, headers Retry-After, erros 4xx/5xx e timeout/rede;
- limitação de concorrência, throttle, cancelamentos e deadline de fila;
- snapshots de importação, identidade e importações concorrentes.

Os testes de integração seguem mockados. Os resultados completos de validação anteriores constam nos relatórios das Fases 0–2; não foram repetidos integralmente nesta auditoria.

### Testes efetivamente executados nesta auditoria

Comando:

```text
pnpm exec vitest run tests/search/igdb-observability.test.ts tests/search/igdb-provider.test.ts tests/search/igdb-direct.test.ts tests/search/igdb-import.test.ts
```

Resultado: **4 arquivos passaram; 83 testes passaram; 0 falhas.** O Vitest emitiu aviso não bloqueante sobre `configLoader: 'native'`.

Também foram executados separadamente os 37 testes de `tests/search/igdb-observability.test.ts`; todos passaram. Essa execução está contida no resultado combinado e não deve ser somada a ele.

### Cobertura e limites

- **[Confirmada]** Os quatro arquivos executados usam fetch mocks/fixtures e cobrem concorrência, deduplicação, 250 ms, limite 8, 429, 401, falhas, cancelamento, logs e importação.
- **[Não verificada]** A suíte completa, TypeScript, ESLint completo e build não foram executados nesta auditoria; seus resultados anteriores não são reapresentados como validação atual desta execução.
- **[Não verificada]** Navegador real, latência end-to-end, cancelamento de rota no runtime Next/Vercel e comportamento com Twitch/IGDB reais não foram homologados.
- **[Confirmada]** Nenhum pacote foi instalado e nenhum teste fez chamadas externas autenticadas.

## 8. Disponibilidade dos logs Vercel

- **[Confirmada]** Este contexto não disponibiliza uma integração autorizada e somente leitura para os logs do ambiente de homologação. Nenhum comando remoto foi executado e nenhuma credencial foi solicitada ou lida.
- **[Confirmada]** Produção, Atlas remoto e configurações `.env` não foram acessados.
- **[Não verificada]** Não foi possível confirmar se a aplicação está implantada em homologação, se os eventos estão chegando ao painel, qual a retenção disponível ou se os campos JSON são pesquisáveis.

### Procedimento manual recomendado para coleta posterior

1. Responsável do projeto seleciona explicitamente o projeto e deployment de **homologação**, confirma ambiente/região e janela representativa. Não selecionar produção por padrão.
2. Usar painel Vercel autorizado em modo leitura, com privilégio mínimo, sem compartilhar tokens ou credenciais em texto puro.
3. Filtrar somente eventos sanitizados: `IGDB external request`, `IGDB single-flight`, `IGDB retry`, `IGDB admission waiting`, `IGDB admission rejected`, `IGDB retry budget exhausted`, `Twitch token cache` e `Twitch token refresh`.
4. Não exportar mensagens com query/body, IDs de usuários/jogos, headers, tokens ou dados pessoais. Os eventos atuais não deveriam conter esses valores; ainda assim, aplicar allowlist de campos ao material extraído.
5. Registrar janela, timezone, quantidade de linhas consultadas, filtros e eventual amostragem/truncamento. Preservar endpoint/operação/status/timestamps e campos numéricos necessários; omitir identifiers de invocação se não forem necessários.
6. Se a plataforma não permitir export sanitizado ou percentis sobre amostras individuais, registrar a limitação em vez de inferir métricas.

## 9. Baseline de performance, quando disponível

**Baseline Vercel nesta auditoria: indisponível.** Não há valores reais para preencher. Não foram calculados percentis nem estimados ganhos.

| Métrica | Estado nesta auditoria | Como calcular quando houver logs completos |
|---|---|---|
| Total de chamadas IGDB | **Não verificado** | Contar `IGDB external request` por endpoint/operação; cada evento é tentativa física, inclusive retries |
| Chamadas evitadas por single-flight | **Não verificado em Vercel** | Somar `avoidedExternalCalls` dos eventos `IGDB single-flight` com `outcome: shared`; separar `capacity_bypass` |
| Taxa HTTP 429 | **Não verificada** | Contar status 429 / total de tentativas IGDB na mesma janela; informar numerador e denominador |
| Latência p50/p95/p99 | **Não disponível** | Calcular sobre amostras individuais `latencyMs`, por endpoint/operação; não derivar de médias |
| Espera throttle | **Não verificada** | Distribuição de `throttleWaitMs` por tentativa, endpoint/operação |
| Espera concorrência | **Não verificada** | Distribuição de `concurrencyWaitMs`; contar também cancelamentos de admission |
| Máximo de requests em voo | **Não verificado** | Máximo dos `maxInFlight` observados; é máximo por runtime, não agregado |
| Retry 429 bem-sucedido | **Não verificado** | Correlacionar eventos `IGDB retry` e tentativas subsequentes apenas se logs/timestamps permitirem; não há ID lógico de operação |
| Retry esgotado | **Não verificado** | Contar `IGDB retry budget exhausted` por reason |
| Token refresh Twitch | **Não verificado** | Contar cache hit/miss/single_flight e refresh success/failure; latência por evento `Twitch token refresh` |

**Limitações confirmadas:** a aplicação emite eventos por tentativa e estado local, mas não calcula histogramas persistentes nem agrega entre instâncias. `operation` e endpoint permitem segmentação de baixa cardinalidade; não existe correlation ID para associar perfeitamente todos os eventos de uma operação lógica. Completude e retenção dos logs dependem da Vercel e não foram verificadas.

## 10. Impacto na experiência do usuário

Avaliação abaixo é estática, baseada no fluxo de código; **não houve sessão de navegador**.

| Fluxo | Evidência de código | Impacto potencial / estado da homologação |
|---|---|---|
| Buscar jogos | Busca textual chama `/games`; filtros são aplicados com debounce de 400 ms; UI de catálogo usa AbortController e request ID | **[Confirmada]** O browser cancela a requisição same-origin anterior, mas código comenta que BFF pode continuar IGDB. Sem perfil de browser, latência percebida desconhecida. |
| Paginar resultados | Nova página é nova chamada. Browse sem texto consulta `/games` e depois `/games/count`; texto usa over-fetch `limit + 1` | **[Confirmada]** Duas operações seriais no browse podem acumular espera de admission/throttle. Nenhuma latência real medida. |
| Aplicar filtros | Debounce 400 ms para filtros; busca posterior; filtros de taxonomia podem fazer lookups auxiliares | **[Confirmada]** Atraso inclui debounce, rota e dependências externas. Browser não foi executado. |
| Abrir detalhe | Rota busca `/games`; com empresas pode buscar `/involved_companies` e `/companies` sequencialmente | **[Confirmada]** O caminho com enriquecimento tem requests seriais e pode acumular latência/retry. |
| Buscar metadados no formulário | UI faz busca direta IGDB e detalhe de preview; usa request ID para descartar resposta antiga, sem AbortController | **[Confirmada]** Requisição obsoleta pode continuar no servidor; experiência e frequência de ações rápidas não medidas. |
| Buscar capas | UI faz consulta direta IGDB ao clicar/Enter; usa request ID, sem debounce/abort; timeout IGDB é 15 s por request | **[Confirmada]** 32 s é deadline por `igdbRequest`, não promessa sobre duração end-to-end da rota. Browser não foi testado. |
| Importar um jogo | POST autenticado; se não há snapshot, servidor chama detalhe IGDB novamente; depois cria associação | **[Confirmada]** Pode repetir detalhe já buscado no formulário. Inserção e consulta Mongo são fora desta auditoria. |
| Adicionar à coleção | Após import, frontend envia um ou mais POSTs de associação em sequência | **[Confirmada]** São requests adicionais à aplicação, não IGDB; podem alongar a conclusão percebida sem consumir quota IGDB. |

### Deadlines de 22/32 s

- **[Confirmada]** `timeoutMs` é 10 s para search/detail e 15 s para cover; deadline individual calculado é 22 s e 32 s, respectivamente.
- **[Confirmada]** Cada chamada HTTP IGDB adquire seu próprio deadline. Exemplo: detalhe com três chamadas seriais possui até três orçamentos individuais em sequência; busca browse também pode executar `/games` e `/games/count` serialmente.
- **[Provável]** A duração total da rota pode, em caso extremo, exceder 22/32 s e ficar sujeita a limites do hosting/proxy/cliente, que não foram verificados nesta auditoria.
- **[Não verificada]** Não há evidência sobre a duração máxima real, se a Vercel encerra uma função antes em homologação, ou quanto os usuários esperam em p50/p95.

**Conclusão:** não afirmar experiência real validada nem que os limites individuais se traduzem em SLA de rota. Recomenda-se medir primeiro logs de requests e, em homologação autorizada, tempo de rota e interação no navegador.

## 11. Consultas redundantes remanescentes

Fluxo de risco revisado:

```text
Busca/preview do catálogo
  → detalhe para abrir/adicionar ou preencher formulário
  → POST de importação
  → novo detalhe server-side se ainda não houver GlobalGame
```

- **[Confirmada]** `GameFormContainer` faz GET de detalhe IGDB ao entrar em external mode. Esse efeito termina antes de o formulário permitir importação normal.
- **[Confirmada]** O POST de importação envia identidade e campos pessoais, não usa metadados do browser como autoridade. `findOrCreateSnapshotIgdbGame` verifica `GlobalGame` e, quando o ID ainda não está armazenado, busca detalhe novamente.
- **[Confirmada]** Portanto, em um import de ID novo, existe uma consulta de detalhe na carga do formulário e outra no servidor durante importação. O detalhe pode envolver até três requests físicos (jogo + relações/empresas); a quantidade efetivamente repetida depende dos dados e da sobreposição.
- **[Confirmada]** Single-flight só ajuda se requests equivalentes se sobrepõem no tempo; não reusa resposta concluída. A sequência normal de formulário e submit não é coberta por single-flight.
- **[Confirmada]** Snapshot `GlobalGame` existente evita novo fetch de detalhe, mas no modo atual de conflito de importação pode resultar em conflito em vez de reutilização; não tratar como cache transitório.
- **[Provável]** O maior candidato de economia é protocolo temporário server-side para detalhe já validado, vinculado à identidade e com expiração/anti-replay, ou cache transitório permitido por política. Ambos acrescentam autoridade, validade e ciclo de vida que precisam de desenho explícito.
- **[Confirmada]** Não houve cache implementado nesta auditoria. Não se recomenda enviar ao backend os campos do browser como substituto de validação do provider.

## 12. Comparação das arquiteturas futuras

| Caminho | Vantagens | Custos/riscos | Evidência que justificaria |
|---|---|---|---|
| **A. Manter arquitetura atual** | Sem custo/serviço adicional; comportamento local já possui dedupe pendente, throttle, cap e retries | Não compartilha entre instâncias; chamadas sequenciais repetidas permanecem; não garante quota global | Apropriada enquanto logs mostrarem baixo 429/fila e não houver requisito de quota global |
| **B. Cache compartilhado ou temporário (Atlas ou Redis)** | Pode reduzir consultas repetidas sequenciais e entre instâncias; cache temporário pode reutilizar detalhe do formulário | Custo de reads/writes e latência; TTL/invalidação/eviction; decisão legal sobre retenção IGDB; risco de confundir cache com snapshot de domínio. Atlas TTL é eventual e não é, sozinho, limiter atômico. Redis adiciona serviço/custo/gestão | Hit rate e taxa de repetição medidos, ou necessidade confirmada de reuso entre instâncias. TTL e termos aprovados antes de armazenar dados |
| **C. Rate limiter distribuído (Redis, fila ou gateway)** | Pode coordenar quota e concorrência entre runtimes; primitives atômicas permitem token bucket/semaphore compartilhados | Custo, latência de rede, disponibilidade, região, tratamento fail-open/fail-closed, locks órfãos e novo ponto operacional; gateway/fila aumenta arquitetura | Requisito obrigatório de quota global ou evidência de saturação/429 atribuível à soma das instâncias |

**[Confirmada]** Se a garantia de quota global for obrigatória, mecanismos puramente locais são insuficientes.
**[Recomendação]** Sem requisito de garantia e sem métricas reais de saturação, manter caminho A e coletar baseline; não escolher Redis/Atlas por risco teórico sozinho. Cache de respostas e limiter resolvem problemas diferentes e devem ser avaliados separadamente.

## 13. Riscos classificados por gravidade

| Gravidade | Conclusão | Classificação | Evidência/efeito |
|---|---|---|---|
| **Alta, condicional** | Limite global de requests não é garantido entre instâncias | **Confirmada** | Estado do scheduler é process-local; torna-se risco operacional se quota global for requisito ou se tráfego multi-instância causar 429 |
| **Média** | Invalidação incondicional do token em 401 concorrentes pode remover token novo | **Confirmada como possibilidade; ocorrência não verificada** | Código limpa cache sem comparar geração/token rejeitado; pode causar refresh redundante/falha |
| **Média** | Abort do browser pode não encerrar trabalho IGDB no BFF | **Confirmada no fluxo de busca comentado; outros fluxos não verificados** | Algumas UIs cancelam fetch same-origin, mas rota não repassa signal a `igdbRequest`; trabalho obsoleto pode continuar |
| **Média, potencial** | Deadline individual não limita duração total de rota com requests seriais | **Confirmada estruturalmente; impacto real não verificado** | Detalhe/browse podem chamar IGDB várias vezes sequencialmente; limites de hosting/browser não inspecionados |
| **Baixa** | Parsing de HTTP-date é permissivo | **Confirmada** | `Date.parse` pode aceitar formatos que não são HTTP-date estritos |
| **Baixa, potencial** | `response.body.cancel()` pode manter permit enquanto aguarda conclusão | **Provável** | Permit só é liberado após `await` do cancelamento; não reproduzido |
| **Baixa** | Precisão dos timestamps de teste local é limitada | **Confirmada** | Teste de throttle mede `Date.now()` em milissegundos, não captura todos os starts em trace de rede |
| **Não classificada sem dados** | 429, latência alta, fila saturada ou custo de logs em produção | **Não verificada** | Sem logs Vercel disponíveis |
| **Não classificada sem confirmação externa** | Retenção/comercialização de dados IGDB | **Não verificada** | Questão contratual já destacada na auditoria anterior; não revisada juridicamente nesta fase |

Não foi confirmada race que viole o máximo local de oito ou spacing de 250 ms. Também não foi demonstrado deadlock reproduzível.

## 14. Recomendações priorizadas

1. **P0 — Coletar baseline autorizado de homologação.** Usar os eventos sanitizados e janela representativa; confirmar retenção, campos e completude antes de calcular percentis.
2. **P0 — Manter a limitação por processo corretamente descrita.** Não declarar quota global; se quota global for requisito, decidir isso explicitamente antes de escolher infraestrutura.
3. **P1 — Revisar a corrida de renovação 401.** Criar cenário concorrente e avaliar invalidação condicional por geração/token em mudança futura autorizada.
4. **P1 — Verificar duração end-to-end.** Medir no ambiente de homologação duração de rota para browse, detalhe com empresas, capa e import; distinguir tempo de cada IGDB request de tempo de rota.
5. **P1 — Confirmar cancelamento BFF.** Verificar quais Route Handlers propagam abort do browser; priorizar fluxos de filtros/formulário com buscas obsoletas.
6. **P2 — Validar parser de Retry-After.** Adicionar casos que diferenciem HTTP-date válido de string apenas parseável, se a política exigir estrita conformidade.
7. **P2 — Avaliar reuso temporário do detalhe do formulário.** Somente após esclarecer autoridade server-side, vínculo a identidade, expiração, replay e termos de retenção.
8. **P2 — Considerar cache compartilhado ou limiter apenas com evidência.** Usar 429, waits, ocupação por runtime, frequência single-flight e custo de repetição para escolher.
9. Não iniciar implementação, cache, infraestrutura ou nova fase sem autorização explícita.

## 15. Plano de ação proposto

### Etapa A — Homologação operacional (sem código)

1. Obter autorização de leitura para projeto/deployment de homologação.
2. Confirmar cobertura dos eventos e período de retenção; não acessar produção por conveniência.
3. Reunir eventos permitidos e calcular contagens/percentis individuais, segmentados por endpoint/operação.
4. Registrar denominadores, amostragem e limitações de correlação; não interpretar logs truncados como população completa.

### Etapa B — Testes funcionais controlados em homologação

1. Executar busca textual, browse/paginação, filtros, detalhe, capa, formulário, import e associação à coleção em navegador.
2. Registrar tempos de rota/browser e estado funcional; não fazer teste de carga ou provocar 429 no serviço real.
3. Usar mocks/fixtures para cenários de retry, concorrência e falha; não autenticar contra IGDB/Twitch real.
4. Confirmar comportamento de abort no browser/BFF e o tempo total de fluxos com chamadas seriais.

### Etapa C — Decisão

1. Se 429, espera e latência forem baixos e não houver requisito de quota global: manter arquitetura A.
2. Se consultas repetidas forem relevantes: avaliar desenho de cache/reuso e política IGDB antes de escolher Atlas/Redis.
3. Se quota global for requisito obrigatório: comparar limiter distribuído, fila ou gateway, com análise de custo, falha e latência.
4. Abrir fase de implementação separada e autorizada somente após decisão documentada.

## 16. Evidências e limitações

### Evidências inspecionadas nesta auditoria

- `docs/IGDB_RATE_LIMIT_PERFORMANCE_AUDIT.md`
- `docs/IGDB_PERFORMANCE_PHASE_0_REPORT.md`
- `docs/IGDB_PERFORMANCE_PHASE_1_REPORT.md`
- `docs/IGDB_PERFORMANCE_PHASE_2_REPORT.md`
- `server/search/igdb-client.ts`
- `server/search/twitch-token.ts`
- `server/search/igdb-provider.ts`
- `server/search/import.ts`
- `server/shared/logger.ts`
- `tests/search/igdb-observability.test.ts`
- `tests/search/igdb-provider.test.ts`
- `tests/search/igdb-direct.test.ts`
- `tests/search/igdb-import.test.ts`
- `features/atp/catalog-search.tsx`
- `features/games/game-metadata-search.tsx`
- `features/games/game-cover-search.tsx`
- `features/games/game-form-container.tsx`
- endpoints diretos IGDB e rota de importação.

### Validação executada

- Quatro arquivos de teste focados: **83 testes passaram**.
- Vite/Vitest emitiu aviso de compatibilidade futura de `configLoader: 'native'`.
- Nenhum teste externo, acesso a produção/Vercel/Atlas, migration, seed, instalação ou navegação de browser foi realizado.
- TypeScript, ESLint completo, build e suíte completa não foram repetidos nesta auditoria.
- Nenhum dado de latência real ou volume foi coletado; não se calcularam percentis.
- Nenhuma alteração de código/configuração foi feita. A criação deste relatório é a única alteração de arquivo autorizada.

### Limitações

As conclusões de comportamento vêm de inspeção estática e testes mockados. Os relatórios anteriores são evidência de validação das fases correspondentes, não telemetria atual de produção. A ausência de logs autorizados impede inferir impacto, taxa de erro, escala, comportamento multi-região ou experiência real do usuário.

## 17. Veredito final

**[Confirmada]** As otimizações locais das Fases 0–2 permanecem no código atual, e os testes mockados focados executados nesta auditoria passaram. O scheduler impõe teto local de oito, spacing de 250 ms, fila FIFO e deadlines; single-flight reduz chamadas físicas equivalentes enquanto pendentes; 429 recebe retry limitado e 401 mantém renovação.

**[Confirmada]** A worktree preexistente foi preservada. O único arquivo novo desta fase é `docs/IGDB_PERFORMANCE_PHASE_3_AUDIT.md`.

**[Não verificada]** Não há acesso autorizado a logs Vercel de homologação neste contexto, nem medidas reais de p50/p95/p99, 429, concorrência, token refresh ou duração percebida. Não se afirma ganho de performance em produção.

**[Confirmada como risco técnico]** A invalidação Twitch em 401 é incondicional e merece avaliação concorrente em trabalho futuro. **[Confirmada como observação de parsing]** O parser `Retry-After` aceita a interpretação genérica de `Date.parse`, não apenas HTTP-date estrito. Ambos foram documentados, sem correção nesta auditoria.

**Conclusão:** auditoria estática e homologação local mockada concluídas; homologação Vercel/browser permanece pendente de acesso autorizado e execução controlada. As opções futuras devem ser escolhidas por baseline real e requisito explícito, não por hipótese. Nenhuma implementação posterior foi iniciada.
