# Save State — IGDB Performance Optimization — Fase 1

**Data:** 15/11/2026  
**Escopo:** single-flight apenas para chamadas IGDB idênticas e simultâneas; verificação da reutilização de snapshot no fluxo de importação.  
**Referências obrigatórias:** `docs/IGDB_RATE_LIMIT_PERFORMANCE_AUDIT.md` e `docs/IGDB_PERFORMANCE_PHASE_0_REPORT.md`

## 1. Resumo executivo

Foi implementado single-flight em `server/search/igdb-client.ts`, no limite de requisição HTTP à IGDB. Chamadas equivalentes que se sobrepõem no tempo compartilham uma única Promise, uma única chamada física e um único slot do throttle de 250 ms. Cada seguidor recebe seu resultado/rejeição e gera evento separado de compartilhamento. O registro é limitado a 500 operações pendentes, não retém resultados concluídos e remove entradas tanto em sucesso quanto em falha.

O consumidor pode cancelar sua própria espera por `AbortSignal`; isso não cancela o `fetch` compartilhado nem prejudica outros consumidores. O timeout físico existente continua sendo aplicado à operação compartilhada.

O fluxo de importação não precisou de alteração de produção: `findOrCreateSnapshotIgdbGame` já procura `GlobalGame` pela identidade numérica `igdbId` antes de chamar IGDB, reutiliza o snapshot sem sobrescrevê-lo e só cria snapshot a partir de detalhe consultado pelo servidor. A restrição única e a recuperação de corrida já existentes permanecem. Foram adicionados testes de regressão dessa prioridade e de metadados forjados no request.

**Limite confirmado:** o detalhe exibido anteriormente no formulário/preview normalmente já terminou antes do submit de importação. Single-flight não reutiliza resposta concluída; portanto essa segunda consulta sequencial continua possível e não foi “otimizada” por cache, persistência temporária ou confiança no browser.

Não foram introduzidos TTL, cache de respostas, Multiquery, Redis, rate limiting distribuído, schema/migração ou alteração no ATP. TypeScript, ESLint, testes e build passaram. Não foi medido tráfego real e não se afirma redução percentual em produção.

## 2. Diagnóstico da duplicação de requisições

### Fatos confirmados no código

1. `server/search/igdb-client.ts` é o limite comum das operações HTTP IGDB e já mantém a fila local de throttle.
2. `IgdbSearchProvider.getGameDetail` constrói deterministicamente a consulta principal `/games` a partir do ID numérico e dos campos fixos. Também pode consultar `/involved_companies` e `/companies` para normalizar desenvolvedores/publicadoras.
3. A rota direta `/api/igdb/games/[id]` e a rota neutra de detalhes usam o provider IGDB, enquanto importação chama `provider.getGameDetail` no servidor.
4. Assim, leituras equivalentes que se sobrepõem — por exemplo duas cargas de detalhe simultâneas ou uma leitura e importação concurrentes — podem compartilhar chamadas HTTP equivalentes no cliente.
5. `server/search/import.ts` consulta `GlobalGame.findOne({ igdbId })` antes da consulta externa e não trata metadados recebidos do browser como autoridade para o snapshot.
6. A UI carrega detalhes para preview/formulário e a importação faz sua própria leitura server-side. Em uso normal, a primeira leitura pode terminar antes do submit.

### Inferência/limitação

Single-flight compartilha somente o intervalo em que a operação está pendente. Ele não armazena resultado nem reduz chamadas de dois fluxos sequenciais. A deduplicação é por request HTTP exato, não por “jogo” de forma genérica; subconsultas só são compartilhadas se endpoint, corpo e parâmetros semânticos também coincidirem.

## 3. Arquitetura do single-flight implementado

`igdbRequest` calcula uma chave semântica e consulta `pendingRequests` antes de adquirir throttle:

```text
igdbRequest(endpoint, body, options, credentials)
        │
        ├─ chave pendente encontrada → evento shared + espera a mesma Promise
        │
        └─ chave ausente → registra Promise → throttle → token → fetch IGDB
                                                └─ remove chave em sucesso/falha
```

- A Promise é registrada antes de iniciar o trabalho assíncrono, evitando corrida de registro entre chamadas simultâneas.
- Somente a operação líder executa `executeIgdbRequest`, obtém slot e realiza o fetch. Os seguidores não ocupam slots de throttle.
- A mesma Promise de payload bruto é compartilhada; cada consumidor continua fazendo sua própria validação Zod no provider/limite superior.
- O mapa só contém operações pendentes. O handler de cleanup compara a identidade da Promise antes de remover a entrada.
- Rejeições não ficam armazenadas; o handler de cleanup também consome a Promise derivada de `finally` para evitar rejeição não observada.
- O mapa aceita no máximo 500 chaves pendentes. Ao atingir o limite, chamadas novas não são inseridas no mapa e seguem independentemente pelo throttle, com evento `capacity_bypass`; isso limita a memória do registro sem bloquear funcionalidade.
- Não há chamada a serviço compartilhado nem coordenação entre processos.

## 4. Estratégia de construção e isolamento das chaves

A chave é uma serialização JSON de array, evitando ambiguidades de concatenação:

```text
[
  endpoint,
  corpo Apicalypse exato,
  timeoutMs,
  route,
  operation (ou "other"),
  SHA-256(Client-ID + separador NUL + Client Secret)
]
```

Endpoint e corpo distinguem recursos/consultas diferentes. Timeout e os rótulos de rota/operação também entram na chave para não compartilhar chamadas configuradas com semântica de uso diferente. Método, URL base, headers e formato de resposta são constantes neste cliente. A impressão digital de credenciais isola fontes/configurações diferentes sem inserir Client Secret em texto puro na chave/log.

O corpo completo existe somente como parte da chave em memória enquanto a chamada está pendente; ele nunca é emitido em log. A chave é removida no término e não forma um cache.

`AbortSignal` não entra na chave: é cancelamento da espera de um consumidor, não uma característica da requisição HTTP compartilhada. O timeout configurado, que afeta a operação física, entra.

## 5. Tratamento de concorrência, cancelamento e erros

- **Concorrência idêntica:** todos os consumidores pendentes recebem o mesmo payload ou a mesma rejeição lógica.
- **Concorrência distinta:** corpos, endpoints, operações, timeouts, rotas ou fingerprints de credenciais diferentes não compartilham Promise.
- **Cancelamento do consumidor:** `signal` rejeita apenas a Promise daquele consumidor. Não é passado ao `fetch` compartilhado; outro consumidor continua recebendo o resultado. Se o consumidor líder cancelar, o trabalho permanece disponível para seguidores.
- **Timeout físico:** `AbortSignal.timeout(options.timeoutMs)` existente continua interrompendo o fetch após o prazo, mapeando ao mesmo `IGDB_UNAVAILABLE` 503. O single-flight remove a entrada rejeitada, permitindo nova tentativa.
- **401:** retry único e invalidação/renovação Twitch existentes foram preservados. O retry é parte da Promise compartilhada; nenhum consumidor inicia um retry adicional independente.
- **429:** continua `RATE_LIMIT_EXCEEDED` 429, sem nova política de retry. A rejeição compartilhada é removida ao terminar.
- **5xx/rede:** mantêm mapeamento existente a `IGDB_UNAVAILABLE` 503 e limpeza do registro.
- **Sucesso:** apenas Promise pendente; uma chamada sequencial posterior faz novo request externo.
- **Capacidade:** operações novas além do limite de 500 pendências deixam de deduplicar, mas continuam válidas e throttled.

## 6. Otimização realizada na importação

Não houve mudança no serviço de importação porque a prioridade segura já existia:

1. Importação IGDB valida e converte `externalId` para ID numérico.
2. Busca `GlobalGame` por `igdbId`.
3. Se existir e a política permitir, reutiliza snapshot sem fetch e sem atualização de metadados.
4. Se não existir, busca detalhes através do provider server-side e cria snapshot com a identidade IGDB.
5. Índice único e recuperação de duplicate-key permanecem como autoridade em importações concorrentes.
6. `createGame` continua responsável pela associação do `UserGame` ao usuário autenticado e pela idempotência/semântica existente.
7. O ramo ATP continua delegado a `importAtpGame`; não usa o caminho IGDB.

Foi adicionado teste que pré-cria snapshot, envia campos de catálogo forjados junto ao `externalId` e confirma que a importação reutiliza o snapshot armazenado, não chama `fetch` e não cria outro `GlobalGame`.

Single-flight pode reduzir a repetição de detalhe apenas quando a leitura do formulário/preview e a importação ainda estiverem em andamento simultaneamente, ou quando duas importações/detalhes equivalentes se sobrepuserem. Não transfere detalhes validados de uma requisição HTTP já concluída para outra requisição.

## 7. Oportunidades que permaneceram pendentes

- **Preview concluído → submit/importação posterior:** a segunda leitura de detalhe continua possível. Eliminá-la com segurança exigiria um protocolo server-side temporário, token de snapshot validado, cache curto ou outro desenho explicitamente revisto. Nenhum foi acrescentado.
- **Cache TTL de metadados/respostas:** fora do escopo e não implementado.
- **Deduplicação entre instâncias Vercel:** mapa local ao processo; instâncias diferentes não compartilham pendências.
- **Agregação do volume de chamadas evitadas:** eventos permitem consulta posterior, mas não há contador persistente/global.
- **Outras redundâncias sequenciais fora de uma mesma janela pendente:** seguem sem alteração.

## 8. Integração com observabilidade

O evento físico existente `IGDB external request` mantém os campos da Fase 0 e agora inclui `execution: "external"` em tentativas HTTP, permitindo identificar o único request que realmente saiu. Retry 401 continua representado por tentativas físicas separadas.

Cada consumidor adicional que encontra uma operação pendente gera `IGDB single-flight`, com:

- `outcome: "shared"`
- `avoidedExternalCalls: 1`
- `pending`: tamanho atual do mapa (máximo 500)

Ao atingir capacidade, `outcome: "capacity_bypass"` e o tamanho pendente são registrados. Os eventos não contêm ID IGDB, corpo/termo, usuário, resposta ou credencial. Para `N` consumidores simultâneos da mesma chave, a expectativa é uma chamada física e `N-1` eventos de compartilhamento, cada qual com uma chamada evitada. Essa é uma contagem lógica de seguidores que deixaram de iniciar fetch, não métrica persistente.

## 9. Arquivos modificados

Alterações desta Fase 1:

- `server/search/igdb-client.ts` — chave single-flight, mapa pendente limitado, cancelamento por consumidor e marcador observacional de execução externa.
- `tests/search/igdb-observability.test.ts` — cobertura de concorrência, isolamento, falhas, cancelamento, chamadas físicas e eventos.
- `tests/search/igdb-import.test.ts` — regressão de reutilização de snapshot e metadados de browser não autoritativos.
- `docs/IGDB_PERFORMANCE_PHASE_1_REPORT.md` — este relatório.

`server/search/igdb-provider.ts`, `server/search/twitch-token.ts` e `server/shared/logger.ts` também aparecem modificados na worktree, mas já estavam modificados antes desta Fase 1 pela implementação da Fase 0; não foram alterados nesta fase. A worktree já continha outros documentos não rastreados e mudanças não relacionadas; todos foram preservados. Não foram executados reset, checkout, commit, push, merge, rebase ou deploy.

## 10. Testes executados e resultados

### Novos/estendidos testes focados

`tests/search/igdb-observability.test.ts` cobre:

- 2 e 10 consumidores idênticos concorrentes: 1 fetch físico e `N-1` eventos compartilhados.
- Corpos diferentes, endpoints diferentes e operações lógicas diferentes permanecem independentes.
- Credenciais diferentes não compartilham.
- Chamada sequencial depois de sucesso faz fetch novo (sem cache pós-conclusão).
- Cancelar um consumidor não aborta o resultado de outro consumidor.
- Rejeições 429 e timeout removem o registro e permitem nova chamada física.
- 401 mantém retry único e resultado de sucesso existente.
- Falhas, logs sanitizados e contagem observacional continuam cobertos.

`tests/search/igdb-import.test.ts` valida que snapshot já existente não aciona fetch e que metadados arbitrários adicionais enviados pelo browser não substituem o snapshot.

### Resultados finais

| Verificação | Resultado |
|---|---|
| TypeScript (`pnpm exec tsc --noEmit`) | Passou |
| ESLint nos arquivos alterados nesta fase | Passou sem erros ou warnings |
| Testes direcionados de observabilidade/import/provider/IGDB direto | 4 arquivos, 65 testes passaram; execução final adicional de observabilidade/import: 2 arquivos, 32 testes passaram |
| Suíte completa (`pnpm test`) | **123 arquivos, 1459 testes passaram** |
| ESLint completo (`pnpm lint`) | 0 erros; 7 warnings fora do escopo |
| Build de produção (`pnpm build`) | Passou; Next.js compilou e gerou 60 páginas estáticas |
| `git diff --check` nos arquivos alterados | Reporta CRLF como whitespace em linhas adicionadas de `igdb-client.ts`, pois o arquivo de origem usa CRLF e a configuração local de diff não trata CR como fim de linha; os testes/import não apresentaram esse aviso. Não foi feita normalização global para preservar line endings preexistentes. |

Warnings não bloqueantes observados:

- ESLint completo: um warning de dependências de hook em `features/atp/catalog-search.tsx` e seis diretivas ESLint não utilizadas em `scripts/import-platform-images.mjs`; são fora do escopo.
- Vite/Vitest emitiu aviso sobre o `configLoader: 'native'`.
- Next.js detectou lockfiles em diretório pai e no projeto, selecionando o diretório pai como workspace root.

Nenhuma chamada real IGDB/Twitch foi feita. Não houve acesso a banco de produção, instalação de dependências, migration, seed ou deploy.

## 11. Comparação quantitativa usando testes mockados

Os testes não são benchmark de produção. Eles contam chamadas mockadas sob condições controladas:

| Consumidores simultâneos com a mesma chave | Fetch IGDB esperado/observado | Chamadas físicas evitadas | Eventos `shared` |
|---:|---:|---:|---:|
| 2 | 1 | 1 | 1 |
| 10 | 1 | 9 | 9 |

| Cenário mockado | Chamadas observadas |
|---|---:|
| Quatro chamadas concorrentes semanticamente distintas (body, endpoint ou operação) | 4 |
| Dois requests sequenciais equivalentes, após o primeiro concluir | 2 |
| Rejeição 429, timeout e nova tentativa bem-sucedida | 3, com uma chamada por invocação |
| Um consumidor cancelado e um consumidor restante | 1 chamada compartilhada; consumidor remanescente recebe sucesso |

Esses resultados demonstram o comportamento do algoritmo e não permitem inferir percentual de redução, quota, latência ou custo real. Ganho real depende de frequência de operações exatamente equivalentes que se sobreponham.

## 12. Limitações multi-instância na Vercel

`pendingRequests`, a fila de throttle e seus contadores são memória do processo Node.js. Requisições encaminhadas a instâncias diferentes não compartilham Promise, não veem o mesmo mapa e podem gerar uma chamada externa cada. Cold starts descartam pendências e contadores. Não há sincronização regional, Redis, banco ou limiter distribuído nesta fase.

O throttle de 250 ms permanece por processo, conforme comportamento existente; single-flight reduz slots apenas para seguidores no mesmo processo.

## 13. Riscos remanescentes

1. A deduplicação considera resposta bruta equivalente a partir da chave e pressupõe que as credenciais/configuração sejam equivalentes quando o fingerprint coincide.
2. O mapa pode alcançar 500 operações distintas simultâneas; além desse limite, há bypass intencional e nenhuma deduplicação para a nova chamada.
3. Cada chave pendente conserva temporariamente o corpo Apicalypse em memória; não é logado nem conservado após a conclusão.
4. Cancelamento do consumidor não cancela o trabalho físico mesmo quando todos os consumidores cancelaram. Isso evita abortar a operação de outro seguidor e mantém timeout físico como limite, mas pode concluir uma chamada sem consumidor ativo.
5. As consultas auxiliares podem continuar duplicadas se não forem idênticas byte a byte ou se não se sobrepuserem.
6. O preview concluído antes do submit não pode ser reutilizado pela política de single-flight.
7. Erros 401 compartilhados levam os consumidores da mesma chave ao mesmo retry/result; mantém-se a semântica atual, sem retry por consumidor.
8. Não há produção/telemetria suficiente para saber frequência de sobreposição ou redução real.

## 14. Recomendações para a próxima fase

1. Observar eventos `IGDB single-flight` e `IGDB external request` em logs da Vercel após implantação autorizada, agregando por endpoint/operação sem exportar corpo ou identidade.
2. Medir proporção de `shared` e `capacity_bypass`, além de concorrência/429, antes de ampliar mecanismo.
3. Caso seja importante eliminar a segunda leitura sequencial do formulário, desenhar uma fronteira server-side para reutilização de detalhe validado, com expiração/anti-replay e vínculo à identidade/configuração. Avaliar e aprovar esse contrato separadamente; não confiar em metadados arbitrários enviados pelo browser.
4. Manter a unicidade `GlobalGame.igdbId`, a prioridade do snapshot existente e a separação `GlobalGame`/`UserGame` como invariantes.
5. Considerar coordenação entre instâncias ou cache somente em fase posterior e com decisão explícita. Esta entrega não os introduz.
6. Não iniciar Fase 2 automaticamente.

## 15. Veredito final

**Fase 1 concluída para single-flight local e seguro no limite de chamadas IGDB.** Requisições idênticas pendentes compartilham uma única chamada externa e um slot do throttle; chamadas distintas e chamadas sequenciais concluídas permanecem independentes. Limpeza ocorre em sucesso/falha, timeout e 429 continuam com contratos existentes, retry 401 é preservado e cancelamento individual não interrompe consumidores restantes.

**Integridade da importação preservada:** snapshot existente continua prioritário; dados de browser não são fonte de metadados de `GlobalGame`; identidade IGDB, unicidade, associação de usuário, recuperação de corrida, idempotência e ramo ATP não foram alterados. A eliminação da consulta sequencial formulário → importação não foi implementada porque exigiria retenção temporária/reutilização além de single-flight.

Validação final: **123 arquivos/1459 testes passaram**, TypeScript, lint direcionado e build passaram. Lint completo teve zero erros e sete warnings externos ao escopo. Nenhum serviço, dependência, cache TTL ou mecanismo distribuído foi adicionado.
