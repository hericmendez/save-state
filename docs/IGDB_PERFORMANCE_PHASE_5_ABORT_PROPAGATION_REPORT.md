# Save State — IGDB Performance Optimization — Fase 5
## Propagação de AbortSignal e cancelamento de requisições obsoletas

**Data:** 17/11/2026  
**Escopo:** propagação de cancelamento do Route Handler até o `fetch` IGDB, cancelamento de buscas obsoletas no frontend e preservação integral do scheduler/single-flight das Fases 0–4.  
**Método:** inspeção estática, testes locais com `fetch` e sinais controlados, TypeScript, ESLint, suíte completa e build. Nenhuma chamada real à IGDB/Twitch, nenhum acesso remoto, nenhuma instalação ou alteração de configuração.

## 1. Resumo executivo

- **[Confirmada]** Antes desta fase, `igdb-client` já cancelava corretamente admissão, throttle, backoff e `fetch` físico por consumidor. O corte estava acima dele: o provider IGDB, os serviços de catálogo e os Route Handlers não recebiam nem repassavam `AbortSignal`.
- **[Confirmada]** `AbortSignal` agora atravessa `Route Handler → catalog-reads → SearchProvider → igdbRequest → fetch IGDB` nos fluxos de leitura compatíveis, como parâmetro opcional e sem alterar contratos HTTP.
- **[Confirmada]** Cancelamento antes da admissão não inicia `fetch` físico; durante o `fetch`, o sinal chega ao `init.signal`; durante o count/backoff, a operação deixa de degradar para resultado parcial.
- **[Confirmada]** Categorias que engoliam falhas para degradar (`fetchCompanyRoles`, thumbs de plataformas, count, gameCount) agora relançam cancelamento em vez de convertê-lo em “sem dados”.
- **[Confirmada]** O frontend aborta buscas obsoletas de metadados e capas, aborta no fechamento/unmount, ignora `AbortError` intencional e mantém a guarda de resposta fora de ordem.
- **[Confirmada]** Nenhum evento novo foi necessário: os eventos das Fases 0–4 já distinguem cancelamento do consumidor, fase, manutenção por outros consumidores e encerramento compartilhado.
- **[Confirmada]** TypeScript, ESLint direcionado, 18 arquivos/254 testes focados, suíte completa com **124 arquivos/1.488 testes**, ESLint completo e build passaram.
- **[NÃO VERIFICADA]** A emissão real de `request.signal` em desconexão de cliente no runtime Next.js/Vercel. Os testes usam `Request.signal` controlado; não são prova de cancelamento end-to-end em produção.
- **[Confirmada]** ATP, importação, modelos, OAuth, retries, throttle, limite de oito e invalidação condicional de token não foram alterados.

## 2. Diagnóstico do cancelamento anterior

Caminho auditado:

```text
Frontend
   ↓ AbortController (apenas busca geral e listas)
fetch same-origin
   ↓
Next.js Route Handler
   ↓ (request.signal não usado)
Serviço de busca / catalog-reads
   ↓ (sem signal)
IGDB Provider
   ↓ (sem signal)
igdbRequest
   ↓ (suportava signal, mas ninguém passava)
Scheduler / Single-flight
   ↓
fetch IGDB
```

Pontos observados:

1. **Cancelamento no navegador:** `features/atp/catalog-search.tsx` já abortava o `fetch` client-side e descartava respostas antigas com `requestIdRef`; `features/games/game-metadata-search.tsx` e `game-cover-search.tsx` usavam apenas `requestIdRef`, sem abortar a requisição.
2. **Route Handler:** nenhum handler de `/api/search/*` ou `/api/igdb/*` lia `request.signal`. A requisição do navegador era interrompida; o processamento do servidor não.
3. **Throttle/admissão/backoff/fetch compartilhado:** `igdbRequest` já implementava corretamente essas etapas, inclusive com testes de cancelamento por consumidor. O problema não estava no scheduler, e sim na ausência do sinal acima dele.
4. **Serviço/provider:** `searchGames`, `getGameDetail`, `getGameCover`, `searchCovers`, `listPlatforms`, `getPlatform` e `listFamilies` não aceitavam sinal. Blocos de degradação engoliam qualquer erro, inclusive cancelamento.
5. **`request.signal` do Next.js:** **[NÃO VERIFICADA]** A garantia de abortar em desconexão depende de versão/runtime. Há histórico de suporte a desconexão em Route Handlers e relatos de que o evento pode não disparar em alguns cenários. Esta fase não homologa produção.

## 3. Evidências de reprodução

A evidência desta fase é **estática e determinística**, obtida do caminho real antes da alteração; não houve execução gravada do teste contra o código anterior.

- **[Confirmada]** A assinatura anterior do provider era `searchGames(params, source?)`, sem sinal; logo, um `controller.abort()` do chamador não podia chegar ao `igdbRequest`.
- **[Confirmada]** As rotas chamavam `searchCatalogPage(query, session.id)` e `getSearchProvider().searchCovers(query)`, sem `request.signal`; portanto o servidor não recebia o cancelamento do navegador.
- **[Confirmada]** Mesmo quando `igdbRequest` recebia sinal, os `catch` de degradação do provider retornavam dados vazios ou fallback de paginação. Um consumidor cancelado podia receber sucesso parcial em vez de cancelamento.
- **[Confirmada]** Os dois componentes de metadados/capa chamavam `apiRequest` sem `signal`, então nem o `fetch` do navegador era interrompido; apenas a resposta era descartada.

Os testes acrescentados expressam exatamente essas lacunas: se o sinal não atravessar as camadas, `init.signal` não é abortado, o count continua aguardando e o Route Handler não consegue interromper o `fetch`. Eles passam após a implementação; o comportamento anterior falharia nessas asserções.

## 4. Fluxos e camadas modificados

- **Route Handlers de leitura:** `/api/search`, `/api/search/games/[id]`, `/api/search/games/[id]/cover`, `/api/search/platforms`, `/api/search/platforms/[id]`, `/api/search/families`, `/api/search/covers/search`, `/api/igdb/search`, `/api/igdb/games/[id]`, `/api/igdb/covers/search` repassam `request.signal`.
- **Serviços:** `catalog-reads` aceita `signal?` em `searchCatalogPage`, `getCatalogDetail`, `listCatalogPlatforms`, `getCatalogPlatform`, `listCatalogFamilies` e `getAllCatalogPlatforms`, com verificação entre etapas.
- **Provider:** `SearchProvider` ganhou parâmetro opcional `signal`; `IgdbSearchProvider` repassa em todas as chamadas `igdbRequest`, inclusive resolução de filtros, capas, plataformas, contagem e detalhe.
- **Frontend:** busca geral (já abortava) teve o comentário corrigido; metadados e capas ganharam `AbortController`; capa preguiçosa e detalhe externo do formulário abortam no cleanup.
- **Boundary de erro:** `handleRoute` não registra mais `AbortError` intencional como erro não tratado; o formato de erro permanece o mesmo.

**Não modificados:** `/api/search/import` e mutações de criação/edição. Cancelar uma mutação poderia interromper efeitos persistentes já iniciados.

## 5. Estratégia de propagação

- `AbortSignal` é opcional em todas as camadas; chamadas existentes continuam compilando e funcionando sem sinal.
- Nenhum controller redundante foi criado no servidor: o sinal é o mesmo desde o Route Handler.
- No provider, cancelamento é normalizado para `Error` com `name = "AbortError"`, independentemente do `reason` original.
- Verificações explícitas entre provider e leitura de ownership evitam trabalho posterior desnecessário.
- `catch` de degradação relança cancelamento; erros reais continuam degradando como antes.
- Nenhum contrato HTTP público foi alterado. A resposta para requisição já desconectada continua sendo o envelope de erro existente; o cliente não a recebe.

## 6. Integração com single-flight

- **[Confirmada]** A correção apenas entrega o sinal existente ao consumidor. O single-flight não foi reimplementado.
- **Um consumidor cancela:** somente sua espera termina; a Promise compartilhada e o `fetch` continuam para os demais. Cobertura já existente da Fase 1 preservada.
- **Todos cancelam:** o controller compartilhado aborta o `fetch` e libera a vaga; a próxima chamada funciona normalmente. Cobertura existente preservada.
- **Cancelamento na admissão/throttle:** o waiter é removido da fila; nenhum `fetch` é iniciado. Cobertura existente preservada.
- **Cancelamento no backoff:** o `abortableDelay` é interrompido; não há nova tentativa física. Cobertura existente preservada.
- **Token Twitch:** o refresh OAuth continua single-flight e sem sinal; um cancelamento do cliente não interrompe um refresh compartilhado.

## 7. Comportamento do frontend

- **Busca geral do catálogo:** mantém `AbortController`, descarte de resposta obsoleta, silêncio para `AbortError`, reset de loading e navegação por submissão explícita. Nenhum debounce textual novo.
- **Metadados (Novo Jogo):** cada nova busca/preview aborta a anterior; fechar/aplicar/unmount aborta; `AbortError` não gera mensagem; erro real continua exibido.
- **Capas (Novo Jogo):** mesmo padrão; selecionar/fechar/unmount abortam.
- **Capa preguiçosa por card:** o controller é abortado no cleanup do efeito; falha/cancelamento degradam para placeholder como antes.
- **Detalhe externo do formulário:** leitura inicial aborta no cleanup; falha real continua marcando erro; cancelamento não marca falha.
- **Mutações:** não receberam sinal e seguem o comportamento anterior.

## 8. Observabilidade

- Nenhum evento novo foi introduzido. A instrumentação das Fases 0–4 já cobre:
  - `IGDB consumer cancelled` com `phase` (`token`, `admission`, `request`, `backoff`), `remainingConsumers` e `cancelsSharedOperation`;
  - `IGDB admission cancelled` com fase e esperas;
  - `IGDB external request` com `statusClass: "cancelled"` / `failure`;
  - eventos de single-flight e retry existentes.
- `handleRoute` deixa de emitir “Unhandled route handler error” para `AbortError`; isso evita falso alarme de falha do servidor.
- Nenhum termo de busca, id individual, token, Client-ID, Client Secret, header ou payload é registrado por esta fase.
- **Quota:** uma chamada cancelada antes da admissão evita o `fetch` físico. Uma chamada já enviada à IGDB **não** é contabilizada como economia de quota, mesmo que o cliente tenha ido embora.

## 9. Arquivos modificados

Produção:

- `server/search/types.ts`
- `server/search/igdb-provider.ts`
- `server/search/catalog-reads.ts`
- `server/shared/route-handler.ts`
- `app/api/search/route.ts`
- `app/api/search/games/[id]/route.ts`
- `app/api/search/games/[id]/cover/route.ts`
- `app/api/search/platforms/route.ts`
- `app/api/search/platforms/[id]/route.ts`
- `app/api/search/families/route.ts`
- `app/api/search/covers/search/route.ts`
- `app/api/igdb/search/route.ts`
- `app/api/igdb/games/[id]/route.ts`
- `app/api/igdb/covers/search/route.ts`
- `features/atp/catalog-search.tsx`
- `features/atp/use-atp-cover.ts`
- `features/games/game-metadata-search.tsx`
- `features/games/game-cover-search.tsx`
- `features/games/game-form-container.tsx`

Testes e documentação:

- `tests/search/igdb-abort-propagation.test.ts` (novo)
- `docs/IGDB_PERFORMANCE_PHASE_5_ABORT_PROPAGATION_REPORT.md`

**Worktree:** as alterações preexistentes das Fases 0–4 em `igdb-client.ts`, `igdb-provider.ts`, `twitch-token.ts`, `logger.ts`, `igdb-import.test.ts`, `igdb-observability.test.ts` e relatórios não rastreados foram preservadas. O diff desses arquivos não pertence integralmente a esta fase.

## 10. Testes executados

- TypeScript (`pnpm exec tsc --noEmit`): passou.
- ESLint direcionado (produção + teste): 0 erros; 1 warning preexistente em `features/atp/catalog-search.tsx`.
- Testes focados (`tests/search`, `tests/route-handler.test.ts`, `tests/catalog-navigation`): **18 arquivos, 254 testes passaram**.
- Novo arquivo de propagação: **8 testes passaram**.
- Suíte completa (`pnpm test`): **124 arquivos, 1.488 testes passaram**.
- ESLint completo (`pnpm lint`): 0 erros; 7 warnings preexistentes (`catalog-search.tsx` e `scripts/import-platform-images.mjs`).
- Build (`pnpm build`): passou; aviso preexistente de múltiplos lockfiles/workspace root.
- Vitest emitiu o aviso preexistente sobre `configLoader: 'native'`; não impediu nada.

## 11. Evidências dos cenários mockados

| Cenário | Resultado |
|---|---|
| Cancelar durante `fetch` externo | **[Confirmada]** `init.signal` fica abortado e a Promise rejeita com `AbortError`. |
| Cancelar durante `/games/count` | **[Confirmada]** Não retorna paginação fallback; rejeita cancelamento. |
| `request.signal` controlado no Route Handler | **[Confirmada]** Chega ao `fetch` físico e o aborta. |
| `request.signal` já abortado antes da rota | **[Confirmada]** Nenhum `fetch` IGDB é iniciado. |
| `AbortError` no `handleRoute` | **[Confirmada]** Não é logado como erro não tratado. |
| Fiação dos componentes | **[Confirmada por contrato de fonte]** controllers, `signal`, descarte e cleanup presentes. |
| Single-flight: um de dois consumidores cancela | **[Confirmada]** O segundo recebe o resultado; cobertura da Fase 1. |
| Single-flight: todos cancelam | **[Confirmada]** `fetch` físico é abortado; chamada posterior funciona; cobertura da Fase 1. |
| Cancelamento no throttle | **[Confirmada]** Waiter removido, sem `fetch`; cobertura das Fases 1–4. |
| Cancelamento no backoff 429 | **[Confirmada]** Retry interrompido; cobertura da Fase 2. |

**Limite dos testes:** são mocks com sinais controlados. Não simulam socket real, proxy, Vercel ou desconexão de navegador.

## 12. Compatibilidade ATP/IGDB

- **[Confirmada]** `AtpSearchProvider` não foi alterado: continua aceitando a assinatura anterior e **ignora** o sinal. Nenhum comportamento ATP mudou; cancelamento não chega ao ATP Engine.
- **[Confirmada]** IGDB mantém contratos neutros, envelopes, códigos de erro, validação e autorização.
- **[Confirmada]** Importação IGDB/ATP, GlobalGame/UserGame e associações não foram tocados.
- **[Confirmada]** OAuth Twitch, retry 401, retry 429, Retry-After, throttle de 250 ms, oito requests, FIFO, deadlines e invalidação condicional da Fase 4 permanecem intactos.

## 13. Limitações do Next.js/Vercel

- **[NÃO VERIFICADA]** Se `request.signal` é abortado de forma confiável quando o navegador fecha a conexão nesta versão/runtime. A documentação e o histórico do Next.js indicam suporte em Route Handlers, mas há relatos de cenários em que o evento não dispara; nada foi validado em produção.
- **Runtime Node.js:** todos os handlers de busca declaram `runtime = "nodejs"`; comportamento de desconexão pode diferir de Edge e de ambientes serverless.
- **Plataforma:** um proxy/CDN pode manter a requisição viva mesmo após o navegador desistir.
- **Operações não canceláveis:** consultas MongoDB de ownership/duplicidade, refresh OAuth compartilhado e o cliente ATP continuam sem sinal.
- **Cancelamento parcial:** quando uma chamada IGDB já foi enviada, o cancelamento interrompe a espera e libera recursos locais, mas não desfaz trabalho remoto já aceito.

## 14. Riscos remanescentes

- **[Provável]** Em produção, cancelamentos podem chegar tarde ou não chegar; o benefício será menor que o observado nos testes controlados.
- **[Confirmada]** Abortar um consumidor não afeta os demais; porém, se o navegador não envia o abort, o servidor conclui a operação.
- **[Provável]** `AbortError` deixar de ser logado pode ocultar cancelamentos inesperados; os eventos específicos do `igdb-client` continuam registrando cancelamentos reais.
- **[Confirmada]** Nenhuma economia de quota é presumida para requisições já enviadas.

## 15. Recomendações posteriores

- Homologar `request.signal` em um ambiente de teste real (não produção) com desconexão de cliente, documentando runtime e versão.
- Se a desconexão não for confiável, considerar timeout curto de resposta/streaming como mitigação — decisão separada, fora desta fase.
- Avaliar, em fase própria, propagação de sinal ao cliente ATP e cancelamento de consultas MongoDB, se houver evidência de custo relevante.
- Manter testes de contrato de fonte para fiação de componentes até existir infraestrutura DOM no projeto.
- **Não iniciar a Fase 6 automaticamente.**

## 16. Veredito final

**Fase 5 concluída no escopo seguro e verificável.** O cancelamento agora atravessa as camadas compatíveis até o `igdbRequest`, integra-se ao single-flight existente, interrompe buscas obsoletas no frontend sem erros visuais e não toca mutações persistentes, ATP, retries ou scheduler. TypeScript, testes completos e build passaram.

**Ressalva obrigatória:** o cancelamento end-to-end por desconexão real do navegador **não foi comprovado** neste ambiente. A homologação de runtime permanece pendente e não deve ser declarada garantida.
