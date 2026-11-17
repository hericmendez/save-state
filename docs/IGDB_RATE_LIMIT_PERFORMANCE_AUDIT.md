# Auditoria de Performance e Rate Limiting da IGDB

**Data da auditoria:** 15/11/2026  
**Escopo:** diagnóstico estático da integração IGDB/Twitch do Save State, documentação oficial pública e testes existentes.  
**Modo:** somente leitura, exceto a criação deste relatório. Não foram feitas chamadas autenticadas à IGDB/Twitch, acessos a banco, testes de carga, alterações de código, instalações ou mudanças de configuração.

## Convenção de evidência

- **Confirmada:** diretamente demonstrada pelo código, teste consultado ou documentação oficial acessível.
- **Provável:** inferência sustentada pelo fluxo, mas sem telemetria de produção ou medição externa.
- **Não verificada:** depende de configuração/ambiente remoto, regra contratual ambígua ou evidência não disponível nesta auditoria.

## 1. Resumo executivo

1. **[Confirmada]** O cliente IGDB serializa o início das requisições em cada processo com intervalo mínimo de 250 ms (4 inícios/s). O código atual implementa realmente esse throttle em `server/search/igdb-client.ts`; não se trata apenas de uma descrição antiga.
2. **[Confirmada]** Token Twitch, throttle e caches auxiliares são locais ao processo. Em Vercel, funções/instâncias independentes não compartilham estado. Portanto, cada uma pode permitir até 4 inícios/s, e o limite agregado do app pode ultrapassar 4/s quando houver concorrência entre instâncias.
3. **[Confirmada]** A IGDB publica limite de **4 requisições/s** e até **8 requisições abertas simultaneamente**. A implementação protege o espaçamento por processo, mas não controla o limite agregado multi-instância nem o teto de 8 requisições abertas.
4. **[Confirmada]** Uma busca textual normal dispara uma chamada externa `/games`; busca de navegação sem texto dispara `/games` e `/games/count`. Busca com filtros que precisam resolver taxonomias pode acrescentar chamadas. Detalhe é 1 chamada quando não há empresas relacionadas e até 3 chamadas quando há `involved_companies`.
5. **[Confirmada]** Importar identidade IGDB já existente em `GlobalGame` não consulta a IGDB; importar identidade nova consulta detalhes novamente. No fluxo de formulário externo, o detalhe é buscado para preencher o formulário e pode ser consultado outra vez no POST de importação.
6. **[Confirmada]** Não há cache de resultados de jogos/detalhes/capas no backend ou frontend. Existem somente cache de token Twitch e caches locais limitados para filtros de empresa/gênero. Não há deduplicação de Promises para chamadas IGDB idênticas.
7. **[Confirmada]** A busca do catálogo tem debounce de 400 ms para filtros não textuais e cancela a requisição HTTP anterior no browser, mas o cancelamento não é propagado à função que já está consultando IGDB. A busca textual é submetida por ação explícita. As buscas no formulário de metadata/capa não têm debounce nem abort; usam identificador de requisição apenas para descartar respostas antigas.
8. **[Confirmada]** 429 é mapeado para erro de API e não é repetido. `Retry-After` não é lido; não há exponential backoff nem jitter. O único retry automático IGDB é uma vez em 401 após invalidar token.
9. **[Provável]** A melhoria inicial de menor risco é reduzir chamadas repetidas com cache compartilhado e single-flight, iniciar instrumentação e otimizar detalhe/importação. Redis não parece justificado antes de métricas mostrarem tráfego concorrente suficiente; no entanto, se o requisito for garantir quota global em Vercel, algum mecanismo distribuído (ou gateway único) será necessário.
10. **[Não verificada]** A retenção permitida para dados IGDB deve ser confirmada conforme o uso comercial e os termos aplicáveis. A documentação IGDB apresenta o serviço como gratuito para uso não comercial sob o Twitch Developer Services Agreement; o acordo tem regras de armazenamento explícitas para “Twitch Content/Program Materials”, mas esta auditoria não confirma que cada campo de metadados de jogos IGDB esteja sujeito ao mesmo limite de 24 horas. Não se deve presumir armazenamento ilimitado nem aplicar automaticamente a regra de 24 h a todos os metadados IGDB sem validação jurídica/contratual.

**Conclusão:** o limitador local é adequado como proteção por processo, mas não garante o limite publicado em escala Vercel. Há duas classes de ganho: reduzir trabalho repetido (cache/deduplicação e reaproveitamento de metadados) e coordenar a quota entre instâncias. Recomenda-se primeiro medir e instrumentar; depois implementar otimizações locais compatíveis com um cache TTL prudente; só adotar Redis/gateway distribuído se volume ou requisito de quota global justificar.

## 2. Arquitetura atual

### Componentes e fronteiras

- **Cliente HTTP e throttle:** `server/search/igdb-client.ts`. Envia `POST https://api.igdb.com/v4/<endpoint>` com corpo Apicalypse, `Client-ID` e Bearer token. É `server-only`.
- **Autenticação Twitch:** `server/search/twitch-token.ts`. Client Credentials, timeout de 10 s, cache em memória com margem de expiração de 60 s e single-flight de renovação.
- **Provedor:** `server/search/igdb-provider.ts`. Converte consultas neutras para endpoints IGDB, valida respostas com Zod e adapta para o contrato de busca da aplicação.
- **Seleção neutra:** `server/search/service.ts`. Usa `SEARCH_METHOD` (`IGDB` default ou ATP); possui override IGDB para os endpoints especiais do formulário de novo jogo.
- **Leituras compartilhadas:** `server/search/catalog-reads.ts`. Reutiliza serviços em Route Handlers e Server Components, executa busca externa e complementa com duplicidade manual/posse local.
- **Importação:** `server/search/import.ts`. Resolve `igdbId`, encontra/cria snapshot `GlobalGame`, depois cria `UserGame`. Identidade externa permanece separada de `_id` MongoDB e de `atpDomainId`.
- **Rotas neutras:** `/api/search/*`, incluindo busca, detalhe, capa, plataformas/famílias e importação.
- **Rotas diretas IGDB:** `/api/igdb/search`, `/api/igdb/games/[id]` e `/api/igdb/covers/search`, exceção deliberada para metadata/capa no fluxo Novo Jogo, independente de `SEARCH_METHOD`.
- **Frontend:** `features/atp/catalog-search.tsx` consome endpoint neutro; `game-metadata-search.tsx`, `game-cover-search.tsx` e `game-form-container.tsx` usam endpoint direto IGDB.
- **Persistência própria:** `GlobalGame` armazena snapshot importado (`source: "igdb"`, `igdbId` e campos de metadata); `UserGame` guarda associação/dados pessoais. Não é cache transitório: import existente é reutilizado como snapshot, sem atualização automática.

### Fluxo completo

1. Usuário interage com busca geral, busca/capa do formulário, ou seleciona jogo externo.
2. O browser chama endpoint same-origin autenticado. A rota valida sessão e query/ID.
3. Rota neutra chama `searchCatalogPage`/`getCatalogDetail` e resolve o provider configurado; rota `/api/igdb/*` injeta provider IGDB explicitamente.
4. `IgdbSearchProvider` constrói query Apicalypse e chama `igdbRequest`.
5. `igdbRequest` aguarda slot local; `getTwitchToken` retorna cache local ou compartilha uma renovação pendente.
6. O cliente envia POST externo, trata status/timeout e valida payload no provider.
7. Para busca, a aplicação consulta MongoDB para posse dos IDs retornados. Para detalhe, consulta duplicidade manual e posse. Esses acessos são internos e não contam como chamadas IGDB.
8. Importação nova consulta o snapshot local; se ausente, busca detalhes IGDB, grava `GlobalGame` e cria `UserGame`. A restrição única e recuperação de corrida protegem duplicidade de identidade.

**[Confirmada]** Os endpoints neutros e os diretos são dois pontos de entrada BFF, não dois provedores/calls em série na mesma requisição. Cada fluxo de UI usa o endpoint correspondente.  
**[Confirmada]** `features/search/search-endpoints.ts` centraliza paths; o browser não chama `api.igdb.com` diretamente.  
**[Confirmada]** ATP permanece separado e a integração é por provider/HTTP, sem importar a implementação ATP para este caminho.

## 3. Fluxos de requisições

As contagens abaixo são **requisições HTTP externas à IGDB por operação**, não chamadas internas ao Save State. A chamada OAuth Twitch é indicada separadamente e só ocorre quando a instância ainda não possui token válido.

| Operação/caminho | Chamadas IGDB externas observáveis pelo código | Observação |
|---|---:|---|
| Busca por texto, filtros já resolvidos ou filtros locais | 1 | `/games`; inclui capa no próprio payload, evitando lookup por card. |
| Busca sem texto (browse/paginação) | 2 | `/games` + `/games/count`; count é usado para total exato. |
| Busca com gênero quando o cache local está vazio | +1 | `/genres`; cache permanece somente no processo e não tem single-flight. |
| Busca por developer ou publisher com empresa ainda não em cache | +2 | `/companies` para resolver nome e `/involved_companies`; depois `/games` e, se browse sem texto, `/games/count`. |
| Busca simultânea com developer e publisher frios | até +4 de resolução | Cada filtro resolve separadamente; empresa repetida pode fazer consultas duplicadas. A ordem é sequencial no código. |
| Detalhe do jogo sem empresas relacionadas | 1 | `/games` por ID; o array `involved_companies` vazio evita consultas adicionais. |
| Detalhe com empresas relacionadas | até 3 | `/games`, `/involved_companies` e `/companies`, sequenciais. Os dados das empresas degradam para listas vazias se falharem. |
| Busca de capas | 1 | `/games` com campo mínimo `cover.image_id`; não usa cache. |
| Busca de plataforma fora do catálogo local | 1 ou 2 | `/platforms`, e em geral `/games/count`; dados do catálogo conhecido são locais, mas miniaturas são buscadas novamente. |
| Listagem de plataformas do catálogo estático | 1 | `/platforms` para miniaturas da página, mesmo que a lista de metadados seja estática. |
| Importar ID já persistido como `GlobalGame` | 0 | `findOrCreateSnapshotIgdbGame` retorna o snapshot existente. Ainda há operações MongoDB e criação/verificação de `UserGame`. |
| Importar ID novo | 1–3 | `getGameDetail`, conforme tenha relações de empresa; depois grava snapshot e associação. |
| Renovação de token Twitch | 0 IGDB + 1 OAuth | Uma chamada OAuth por processo quando token frio/expirado; renovações concorrentes no mesmo processo compartilham Promise. |

### Navegação, repetição e estimativa

- **[Confirmada]** Uma página de busca textual já retorna capa para cada resultado; o teste `search-cover-url.test.ts` afirma explicitamente que uma página de 20 resultados não precisa de chamadas por capa.
- **[Confirmada]** Selecionar detalhe no formulário de metadata consulta `/api/igdb/games/[id]`. O modo externo do formulário também carrega detalhe em `game-form-container.tsx`; posteriormente, o POST `/api/search/import` chama `getGameDetail` se não existir snapshot em `GlobalGame`. Assim, no fluxo de adicionar um jogo externo ainda não importado, o detalhe pode ser obtido duas vezes: **2 × (1 a 3) chamadas externas**, ou 2 a 6 no pior caso com relações de empresas. Essa contagem não inclui a busca inicial nem OAuth frio. Isso é evidência de dois caminhos independentes, não garantia de que todo usuário percorra ambos.
- **[Confirmada]** Nova importação concorrente do mesmo ID por usuários diferentes pode realizar dois fetches de detalhe antes de disputar o índice único; a corrida é recuperada no banco, mas o detalhe externo não é deduplicado. Teste `igdb-import.test.ts` comprova import concorrente e unicidade do snapshot, não economia de consultas.
- **[Confirmada]** O reuso em importação repetida acontece após a existência de `GlobalGame`; a segunda importação não busca metadata. Teste correspondente confirma reutilização sem duplicar snapshot.
- **[Confirmada]** Em busca geral, posse é resolvida em MongoDB via `ownedExternalIds`; chamada interna não adiciona quota IGDB.
- **[Confirmada]** A busca do catálogo textual é acionada por ação (Enter/botão), não a cada tecla. Filtros aplicam debounce de 400 ms. Mudanças de página/filtros chamam novamente a rota, e não existe cache de resultados entre navegação/paginação.
- **[Confirmada]** O endpoint de capa por ID existe, mas não é necessário para cards IGDB comuns, já que a busca carrega `cover.image_id`. Uso real do endpoint em todos os fluxos não foi quantificado.
- **[Provável]** Re-renderizações comuns não disparam automaticamente nova busca caso estado não seja alterado; callbacks e efeitos controlam as operações. Sem profiling/telemetria não se pode excluir chamadas por sequência de navegação, remount ou mudança do query string.
- **[Não verificada]** Volume real de requests, proporção de cache local quente e distribuição de latência não estão disponíveis em logs/telemetria consultados.

**Estimativa quantificada permitida pelo código:** otimizar importação de título novo para reaproveitar o detalhe já carregado tem teto teórico de evitar uma segunda chamada de `/games` e até duas chamadas de enrichment por importação (até 3 chamadas IGDB por instância/fluxo externo). O número agregado de chamadas economizadas depende de quantos imports seguem esse caminho; não há base para estimar economia mensal.

## 4. Rate limiting e concorrência

### Limite documentado

**[Confirmada]** A documentação oficial atual da IGDB declara:

- 4 requests por segundo.
- Até 8 requests abertos ao mesmo tempo.
- Excesso de taxa retorna HTTP 429.

Fonte: [IGDB API Docs — Rate Limits](https://api-docs.igdb.com/#rate-limits), consultada em 15/11/2026. O documento não descreve no trecho consultado uma janela alternativa por endpoint, por token ou por IP; não inferir essas dimensões.

### Comportamento do Save State

- **[Confirmada]** `IGDB_MIN_INTERVAL_MS = 250`; `acquireSlot` enfileira o início de cada chamada em uma fila Promise no módulo Node e aguarda o intervalo mínimo após o último início.
- **[Confirmada]** O slot/fila é liberado antes do `fetch` terminar. Isso limita o ritmo de inícios a aproximadamente 4/s por processo, mas permite chamadas sobrepostas enquanto as anteriores estão abertas.
- **[Confirmada]** Não há contador/semaphore de requests em voo nem teto local de 8 conexões abertas. Com latência alta, quatro inícios por segundo podem gerar mais de oito operações abertas; isso depende da latência e do ambiente.
- **[Confirmada]** Em Vercel, mapas/Promises locais são isolados por instância/runtime. M instâncias ativas podem teoricamente iniciar até cerca de `4 × M` requests/s, antes do limite compartilhado aplicado pelo fornecedor. A quantidade M e sua simultaneidade real não foram medidas.
- **[Confirmada]** Busca sem texto realiza `/games` e `/games/count` sequencialmente; detalhe com empresas e resolução de filtros também têm dependências sequenciais. Isso reduz concorrência nesses fluxos, mas aumenta latência acumulada.
- **[Confirmada]** Chamadas independentes recebidas simultaneamente podem ser iniciadas em paralelo após slots espaçados; a fila não compara chave, query, endpoint nem Promise de trabalho.
- **[Confirmada]** OAuth single-flight é por processo apenas. Não existe cache/lease distribuído de token; várias instâncias frias podem pedir tokens simultaneamente. Isso é custo/concorrência no endpoint Twitch, não consumo da quota IGDB diretamente.
- **[Confirmada]** Renovação após 401 pode ser disparada concorrentemente por chamadas que receberam 401: invalidação e refresh não formam uma operação atômica de “401 single-flight”; chamadas que chegarem antes de a primeira iniciar a renovação podem compartilhar `inflight`, mas uma chamada que já recebeu token antigo pode invalidar o novo token após outra chamada ter renovado. Cenário raro, não coberto por evidência de ocorrência.

## 5. Tratamento de erros e HTTP 429

- **[Confirmada]** IGDB 429 é registrado em nível warn e convertido em `RATE_LIMIT_EXCEEDED`, status 429.
- **[Confirmada]** O cliente não lê `Retry-After`, não retorna esse header para cliente e não espera janela indicada.
- **[Confirmada]** Não há retry automático de 429, 5xx, timeout ou falha de conexão.
- **[Confirmada]** O retry automático único é para 401: invalida cache do token e repete uma vez. Um segundo 401 e 403 viram erro de configuração interna/500.
- **[Confirmada]** 5xx e timeout/conexão são mapeados a `IGDB_UNAVAILABLE`/503. Timeouts são 10 s para search/detail e 15 s para cover.
- **[Confirmada]** Twitch OAuth também mapeia status 429 para `RATE_LIMIT_EXCEEDED` sem Retry-After/retry. 4xx de credencial são logados como rejeição e viram configuração inválida.
- **[Confirmada]** Logger registra rota e latência em sucesso, falhas de conexão/timeout, 5xx, respostas malformadas e alguns status; não existe contagem agregada de tentativas/cache/métricas.
- **[Confirmada]** Rota `/api/search/games/[id]/cover` captura qualquer erro de `getGameCover` e retorna capa nula. Nesse endpoint, um 429 pode ser degradado para resposta bem-sucedida sem evidência explícita de rate-limit no consumidor; outras rotas propagam o contrato de erro.
- **[Provável]** Sem backoff, novas ações do usuário após erro podem voltar a atingir a IGDB imediatamente, elevando probabilidade de repetição de 429 em rajadas.
- **[Não verificada]** Não foi possível comprovar se a IGDB fornece `Retry-After` em todos ou alguns 429; o código não preserva o header. A recomendação é respeitá-lo quando presente e aplicar fallback limitado quando ausente.

**Recomendação de política futura:** para 429, uma tentativa automática máxima, atrasada por `Retry-After` quando válido; senão backoff exponencial limitado com jitter e deadline total, preservando o 429 após esgotar. Evitar retry em timeout ambíguo sem idempotência/benefício; GET-equivalentes enviados como POST de consulta são read-only, mas retries ainda consomem quota. Configurar limite de tentativas e orçamento total de latência.

## 6. Cache e armazenamento

### Cache atual encontrado

- Token Twitch: in-memory, 60 s de margem e single-flight local.
- IDs de empresas resolvidas: in-memory, TTL 10 min, capacidade máxima 200 entradas, sem single-flight.
- Gêneros: in-memory até reset do processo, sem TTL, sem single-flight.
- Resultados de busca, páginas, detalhes, capas e miniaturas de plataforma: **sem cache de resposta identificado**.
- Cache de browser/API: helper `apiRequest` não define cache, e endpoints consultados não declaram `revalidate`/política de cache. Aplicação usa sessão; cache HTTP compartilhado não foi comprovado e seria inadequado sem política explícita de privacidade.
- Snapshot importado: `GlobalGame` é persistido e reutilizado como registro de catálogo escolhido/importado, não é cache TTL. Importação existente não atualiza os dados da IGDB automaticamente.

### Proposta de TTLs (condicional à validação de uso/termos)

Valores abaixo são **recomendação inicial**, não limite oficial, nem constatação de que a retenção está autorizada:

| Categoria | TTL inicial sugerido | Justificativa |
|---|---:|---|
| Resultados de busca por texto (`q`, filtros, página) | 5–15 min | Alto potencial de repetição de consultas, conteúdo de busca volátil e cardinalidade elevada; cache exato de chave normalizada. |
| Detalhe IGDB por ID e enrichment de empresas | 24 h | Dados relativamente estáveis, impacto grande na importação repetida e menor volume; começar conservadoramente até esclarecer política de retenção. |
| Capa/imagem URL por IGDB ID | 24 h | Evitar lookup repetido; imagens podem ser removidas/substituídas, portanto renovar e não presumir URL permanente. |
| Taxonomia (gêneros, companhias por termo) | 6–24 h | Vocabulário muda pouco; cache distribuído curto com invalidação/versionamento simples. |
| Catálogo de plataformas/thumbs | 24 h | Baixa volatilidade e cache pode evitar chamadas por página; revisar dados/imagens periodicamente. |
| Token Twitch | `expires_in` menos margem atual | Seguir expiração emitida por Twitch; o cache do token é segredo e só no servidor. |

TTL efetivo deve respeitar contrato/termos, manter possibilidade de invalidação e não transformar dados cacheados em snapshot permanente sem decisão explícita. Os snapshots `GlobalGame` importados já podem durar além de qualquer TTL; sua política é distinta e deve ser validada separadamente.

### Permissões e política de armazenamento

- **[Confirmada]** IGDB Docs afirma que a API é gratuita para uso não comercial sob termos do Twitch Developer Services Agreement e aponta parceria para necessidade comercial.
- **[Confirmada]** Twitch Developer Agreement consultado contém regra de não armazenar cópias de “Twitch Content/Program Materials”, salvo autorização, direitos controlados ou cache por até 24 horas sem compartilhamento; prevê ainda atualização/deleção de materiais expirados/alterados.
- **[Não verificada]** O enquadramento exato de cada dado devolvido por IGDB como “Twitch Content/Program Materials” e sua aplicação ao Save State não ficou estabelecido pela documentação consultada. O FAQ oficial orienta consultar IGDB para parceria comercial, mas não substitui parecer contratual.
- **[Recomendação]** Confirmar com IGDB/Twitch ou assessoria se o uso do produto, eventual monetização, retenção de snapshots, exposição de capas e compartilhamento são autorizados. Até isso, adotar TTL curto para cache transitório, limitar escopo aos dados solicitados pelo usuário e não prolongar retenção de cache sem aprovação. Não apagar snapshots existentes por iniciativa desta auditoria.

## 7. Oportunidades de Multiquery

### Candidatos concretos

1. **Detalhe do jogo + envolvimentos + empresas.** Hoje são sequenciais: `/games` retorna IDs de `involved_companies`; consulta seguinte busca papéis; última busca nomes de empresas. Uma chamada `/multiquery` poderia agrupar consultas dependentes na execução de um lote, mas é necessário confirmar se a sintaxe/ordem permite referenciar o resultado anterior no `where` da consulta seguinte conforme o formato aceito pelo endpoint.
   - Ganho comprovável se suportado: até 3 requests HTTP de detalhe virariam 1 request Multiquery (redução de até 2 requests por detalhe completo).
   - Risco: respostas nomeadas/estruturadas e validação Zod precisam ser adaptadas; erro de um subquery pode impactar interpretação do lote.
2. **Busca `/games` + `/games/count` em browse sem texto.** São independentes porque usam o mesmo `where`. Uma Multiquery pode enviá-las em um único HTTP request, preservando ambas as respostas; reduziria 2 requests HTTP a 1, não elimina o custo de execução de cada query. Validar se a contagem exata ainda compensa o custo/latência.
3. **Filtros de developer e publisher.** Resolução tem dependências: procurar company IDs antes de procurar involved-company IDs. Multiquery não elimina a dependência entre etapas sem suportar variáveis/referência a resultados. Pode, porém, agrupar consultas independentes para mesma empresa/termo e evitar duplicidade se arquitetura produzir os parâmetros previamente.
4. **Plataformas:** uma consulta `/platforms` já agrupa vários IDs numa única chamada. Não há razão para Multiquery apenas para combinar operações já agrupadas.

### Limites e cautelas

- **[Confirmada]** Documentação oficial inclui referência Multi-Query e endpoint agregado.
- **[Não verificada]** Nesta auditoria, a versão textual oficial aberta não permitiu validar limites atuais de subqueries, variáveis, ordem de execução/erros e como o serviço contabiliza subconsultas no limite de taxa. Antes de implementação, conferir seção [Multi-Query](https://api-docs.igdb.com/#multi-query) e validar em testes mockados/ambiente permitido, sem teste de carga real.
- Mesmo que cada lote conte como um request HTTP para rate limit, payload e trabalho interno permanecem; não afirmar ganho de quota por subquery sem confirmação oficial.
- Não agrupar chamadas independentes em Multiquery se isso aumentar payload/latência de um fluxo simples ou fizer falha parcial difícil de tratar.

### Payload e consultas

- **[Confirmada]** Busca usa `GAME_FIELDS` com diversos campos e expansões (gêneros, plataformas, empresas envolvidas, releases e capa) para construir cards ricos em um único `/games`.
- **[Confirmada]** Detalhe reutiliza o mesmo conjunto amplo, mesmo quando a chamada de busca já trouxe parte dos metadados; o contrato de detalhe precisa de summary/releases/empresas que o card não exibe.
- **[Confirmada]** Capa isolada usa só `cover.image_id`; busca de capas também usa payload mínimo. Há boa seleção de campos nesses endpoints.
- **[Confirmada]** Busca de texto solicita `limit + 1` para detectar próxima página, sem count (o comentário documenta que `/games/count` não suporta esse total textual); browse sem texto faz chamada count.
- **[Recomendação]** Separar payload de card e detalhe, medir bytes/latência, remover campo redundante somente se testes confirmarem contrato. Priorizar evitar chamadas inteiras antes de micro-otimizar bytes.

## 8. Observabilidade

### Estado atual

- **[Confirmada]** Logs estruturados contêm evento de sucesso, rota e latência; timeout/conexão, 5xx, 401/403, 429, malformado e alguns erros de query também são registrados.
- **[Confirmada]** OAuth Twitch registra rota, motivo de falha e status rejeitado, sem logar token.
- **[Confirmada]** `logger` faz redaction de chaves sensíveis, mas orienta não passar segredos; no erro 4xx IGDB pode registrar até 300 caracteres do corpo Apicalypse. Esse é conteúdo da query, não resposta, mas pode conter termo de busca do usuário. Avaliar minimização/privacidade.
- **[Confirmada]** Não há métricas de contador de chamadas, cache hit/miss, retries, em-flight, latência percentil, instância ou economia por deduplicação.
- **[Não verificada]** Disponibilidade, retenção e correlação dos logs de produção na Vercel não foram inspecionadas; este relatório não presume acesso remoto.

### Métricas mínimas propostas

Emitir métricas agregáveis sem query completa, token, Client ID, email ou payload:

- `igdb_requests_total{endpoint,status_class}` e contagem específica de 401/429/5xx/timeout.
- `igdb_request_duration_ms{endpoint}` (histograma p50/p95/p99).
- `igdb_requests_in_flight` e `igdb_throttle_wait_ms`.
- `igdb_cache_{hit,miss,coalesced}_total{category}`.
- `igdb_retry_total{reason}` e tentativas por operação.
- `twitch_token_refresh_total{result}` e latência/status categorizado (nunca token/secret).
- `igdb_operation_external_requests{operation}` para busca, detalhe, busca de capa e import.
- Importação: `igdb_import_total{outcome}` (snapshot existente/novo/conflito/falha), sem IDs pessoais.
- Erros com request correlation ID aleatório não sensível e chave de rota/template, sem query string ou ID individual.

Alertas iniciais: aumento sustentado de 429; p95 alto; falhas OAuth; timeouts/5xx; volume externo por operação acima do baseline. Estabelecer baseline antes de limiares percentuais. Coletor/fornecedor e custos devem ser decisão separada; começar com logs Vercel existentes se suficientes.

## 9. Comparação das alternativas

| Alternativa | Complexidade | Custo | Latência | Escala/consistência | Vercel e avaliação |
|---|---|---|---|---|---|
| **A. Memória por instância** | Baixa; mapas limitados e TTL/LRU | Sem serviço adicional; custo de memória/invocações | Melhor caminho de hit (sem rede) | Isolada por instância, perde dados em cold start, não coordena quota nem dedupe entre instâncias | Compatível e boa primeira etapa para dedupe/cache de processo e redução de repetição local; não é garantia de limite agregado. |
| **B. MongoDB Atlas** | Média; coleção cache, schema/serialização, índices TTL, política de eviction/limite | Usa infraestrutura existente, mas aumenta leituras/escritas, armazenamento e pressão/custo Atlas | Uma ida ao banco em cache hit; pode ser menor que IGDB, mas depende da topologia | Compartilhado entre funções ligadas ao mesmo cluster; TTL eventual, não rate limiter atômico por si só; precisa operação atômica para locks/contadores | Deployment simples se conexão existente reutilizada. Pode ser solução pragmática de cache compartilhado quando taxa de repetição justifica. Índice TTL não expira exatamente no segundo e cache não deve usar mesmos documentos de domínio sem separação. |
| **C. Redis/serviço equivalente** | Média/alta; integração, autenticação, rede, políticas de falha e observabilidade | Serviço gerenciado e tráfego; dependência/custo recorrente | Muito baixa em região próxima; possível penalidade de rede Vercel/Redis remoto | Melhor opção das três para cache compartilhado, single-flight distribuído e contador/token bucket atômico; consistência depende da implementação e região | Tecnicamente adequado a quota multi-instância quando necessário. Adiciona dependência, custo e gestão operacional; não recomendado sem volume/429 medidos ou requisito forte de quota global. |

**Conclusão comparativa:** cache em memória é útil, mas não resolve multi-instância. Atlas pode resolver repetição entre instâncias de forma econômica aproveitando infraestrutura e também armazenar cache, porém coordenação de quota exige operações atômicas e desenho cuidadoso. Redis fornece primitives mais naturais para single-flight/limiter global. Alternativa adicional sem Redis: gateway/worker único com fila compartilhada; maior complexidade e maior latência, geralmente excessivo neste estágio.

## 10. Riscos técnicos

1. **[Confirmada, alta] Limite global não garantido:** várias instâncias Vercel somam taxas locais; throttle não coordena.
2. **[Confirmada, média] Concorrência aberta não limitada:** 4 req/s com respostas lentas pode exceder 8 requisições em voo.
3. **[Confirmada, média] Retry-After ignorado:** resposta 429 não orienta cliente nem servidor sobre quando repetir.
4. **[Confirmada, média] Detalhes repetidos:** formulário pode carregar detalhe antes de import e o import buscar de novo; chamadas duplicadas simultâneas não são deduplicadas.
5. **[Confirmada, média] Cache filtro incompleto:** company TTL é curto e por processo; genre não expira explicitamente; Promises pendentes não são compartilhadas nesses caches.
6. **[Confirmada, média] Degradação silenciosa em alguns caminhos:** dados de empresa/miniaturas degradam para vazio; endpoint de cover por ID captura erro inteiro e retorna nulo, dificultando diagnosticar 429 no consumidor.
7. **[Confirmada, média] Snapshot de importação não atualiza:** preserva integridade e evita sobrescrever dados incompletos, mas metadata pode envelhecer; atualização não pode ser confundida com cache TTL.
8. **[Não verificada, alta se houver monetização] Direitos/retention:** enquadramento contratual de metadata IGDB, uso comercial, atribuição e persistência de snapshot exigem confirmação externa.
9. **[Provável, média] Latência percebida acumulada:** chamadas sequenciais de detalhe e filtro somam latência e esperas do throttle; p95 real não existe.
10. **[Confirmada, baixa] Payload de busca amplo:** pode aumentar tráfego e parse; não é o primeiro gargalo comparado a requests extras/repetidos.
11. **[Não verificada] Rate quota de conta/credencial:** a documentação consultada publica o número, mas não especifica completamente a chave de agregação; assumir que todas as instâncias compartilham uma quota até confirmação.

## 11. Recomendações priorizadas

### P0 — antes de alterar comportamento

1. **Confirmar política IGDB/Twitch aplicável** ao produto, retenção de snapshot e possível uso comercial; aprovar TTLs e atribuição.
2. **Adicionar observabilidade sanitizada** e estabelecer baseline de chamadas/latência/429 por operação e endpoint. Isso não exige payload nem PII.
3. **Manter o limitador atual como proteção local**, mas documentar que não é limite global. Não reduzir espaçamento abaixo de 250 ms.

### P1 — otimizações de baixo risco

4. **Reutilizar metadata obtida no detalhe** durante o fluxo de importação quando o usuário acabou de carregar o mesmo ID; validar novamente a identidade e preservar regra de não confiar em metadata enviada pelo browser. Alternativa segura: cache servidor de detalhe por ID, chaveado por provedor/versão.
5. **Adicionar cache bounded com TTL e single-flight local** para detalhe, páginas idênticas, capa e resolução de filtros. Não guardar Promises rejeitadas; remover entradas expiradas; limitar tamanho; chave canônica inclui provider, parâmetros normalizados, paginação/ordenamento e campos/versão.
6. **Debounce e abort efetivo no formulário** de metadata/capa; `requestId` evita exibir stale response, mas não interrompe o fetch. Propagar abort no BFF quando runtime/fetch suportar; abort do browser sozinho não garante cancelamento upstream.
7. **Evitar endpoint de capa independente** quando URL já está no card/detalhe; confirmar consumidores antes de remoção.
8. **Instrumentar e clarificar 429**, inclusive não o converter silenciosamente em “sem capa”; preservar contrato geral e considerar Retry-After adequado no erro de API.

### P2 — após baseline

9. **Adicionar retry restrito de 429** com Retry-After, jitter, tentativa máxima/deadline e respeito a cancelamento; evitar retry em 4xx não retryable.
10. **Introduzir cache compartilhado Atlas ou Redis somente se hit rate/multi-instância justificarem.** Para cache apenas, Atlas pode bastar; para quota global atômica e single-flight distribuído, Redis/gateway.
11. **Implementar rate limiter global conservador** com orçamento abaixo de 4/s (margem para outros consumidores da mesma aplicação/credencial) e controle explícito de no máximo 8 abertas. Definir estratégia de falha do limiter (fail-closed/soft degrade) e prevenção de lock expiry.
12. **Validar Multiquery no caminho detail e games+count**, comparar requests HTTP, tempo total, payload e falhas parciais com mocks; só adotar se reduzir custo/latência medidos.
13. **Revisar payload** via benchmark de bytes e contrato, não por intuição; separar card/detail apenas se não gerar mais chamadas.

## 12. Plano de implementação em fases

1. **Fase 0 — decisão e baseline:** confirmar política de dados; instrumentar contadores/latência; obter baseline sem tráfego de carga contra IGDB.
2. **Fase 1 — correções locais de fluxo:** reaproveitar detalhe da importação; single-flight e caches bounded in-memory; validar expiração, rejeições e isolamento de chaves.
3. **Fase 2 — experiência browser:** debounce de termos no formulário, AbortController, estado stale/loading consistente; observar se abort interrompe efetivamente upstream.
4. **Fase 3 — resiliência:** Retry-After + backoff/jitter limitado para 429, retry 401 já existente, deadline total, limite de concorrência em voo.
5. **Fase 4 — decisão de distribuição:** com métricas reais, decidir Atlas cache, Redis distribuído ou manter local. Se a meta é garantia agregada de quota em Vercel, implementar contador/token bucket atômico compartilhado e teste de várias instâncias.
6. **Fase 5 — Multiquery/payload:** protótipo testado com fixture; comparar latência/requisições e preservar schemas/erros parciais.
7. **Fase 6 — homologação controlada:** em ambiente autorizado e credenciais próprias, verificar busca/detalhe/import/capa, token/401, 429 controlado sem carga real, cache TTL/invalidação, métricas e ausência de segredos. Não acessar produção sem autorização.

Cada fase deve parar no escopo acordado. Esta auditoria não autoriza iniciar qualquer fase de implementação.

## 13. Critérios de aceitação

- Todas as chamadas externas IGDB e OAuth são contadas por endpoint/operação, sem query string, tokens ou payload completo em logs.
- Painel/relatório apresenta p50/p95/p99, status 429, timeout/5xx, refresh de token, cache hit/miss/coalesced e requests em voo.
- Mesma chave concorrente no mesmo processo resulta em uma chamada externa quando single-flight está habilitado; cache expirado/rejeitado comporta-se conforme política.
- Importação após detalhe existente não repete consulta desnecessária, mas identidade e snapshot são revalidados no servidor; corrida mantém índice único e não cria associações duplicadas.
- Limite por processo continua abaixo do publicado; mecanismo distribuído, se adotado, mantém taxa agregada configurada abaixo de 4/s e concorrência aberta abaixo de 8 sob instâncias paralelas simuladas localmente.
- 429 respeita `Retry-After` quando disponível; fallback tem jitter, máximo de tentativas e timeout total. Sem loop ilimitado.
- Resultado cancelado/obsoleto não é renderizado e, quando possível, trabalho upstream é cancelado.
- Payload de cada endpoint permanece compatível com Zod, contrato neutro e `GlobalGame`/`UserGame`.
- TTL e persistência são aprovados conforme política/termos; índices/coleção só são criados em fase futura autorizada.
- Testes usam fetch mockado; nenhuma validação exige teste de carga contra IGDB real.
- Critérios de erro incluem falha OAuth, 401 único, 429 com e sem Retry-After, 5xx, timeout, cache miss/hit, falha do backend de cache e duas instâncias.

## 14. Evidências, arquivos e testes consultados

### Código

- `server/search/igdb-client.ts` — throttle 250 ms, fila por processo, timeouts, status e logs.
- `server/search/twitch-token.ts` — token, margem 60 s, single-flight local, falhas OAuth.
- `server/search/igdb-provider.ts` — query builder, fields, contagem, detalhe/enrichment, capas, filtros/caches e plataformas.
- `server/search/import.ts` — lookup do snapshot, fetch de detalhe quando novo, concorrência/índice único, criação `GlobalGame` e `UserGame`.
- `server/search/catalog-reads.ts` — busca/detalhe e enriquecimento de posse/duplicidade locais.
- `server/search/service.ts` e `server/search/types.ts` — seleção e contrato neutros.
- `app/api/search/route.ts`, `app/api/search/games/[id]/route.ts`, `app/api/search/covers/search/route.ts` — rotas neutras.
- `app/api/igdb/search/route.ts`, `app/api/igdb/games/[id]/route.ts`, `app/api/igdb/covers/search/route.ts` — exceção IGDB direta.
- `app/api/search/games/[id]/cover/route.ts` — fallback que degrada erro a capa nula.
- `app/api/search/import/route.ts` — limite HTTP de importação.
- `features/search/search-endpoints.ts`, `features/atp/catalog-search.tsx`, `features/games/game-metadata-search.tsx`, `features/games/game-cover-search.tsx`, `features/games/game-form-container.tsx`, `lib/api-client.ts`.
- `server/shared/logger.ts` — formato e redaction.
- `docs/AUTH_01C_PREDEPLOY_AUDIT.md` — evidência anterior sobre cache/throttle por processo e falta de homologação com credenciais reais.

### Testes inspecionados (não executados nesta auditoria)

- `tests/search/igdb-provider.test.ts` — campos, filtros, erro 429/5xx, detalhe/enrichment e contratos.
- `tests/search/igdb-direct.test.ts` — rotas `/api/igdb/*` e indisponibilidade.
- `tests/search/igdb-import.test.ts` — snapshot, reuso, import paralelo, identidade e falhas sem escrita parcial.
- `tests/search/neutral-routes.test.ts` — provider neutro e rotas.
- `tests/search/search-cover-url.test.ts` — capa no card e ausência de lookup por card.
- `tests/search/platform-ids.test.ts`, `igdb-platforms.test.ts` — filtros/plataformas.
- Os testes usam `fetch` mockado e fixtures. **Não** demonstram latência de produção, limites agregados de Vercel, credenciais reais ou política contratual.

### Fontes oficiais consultadas

- [IGDB API Docs — Rate Limits](https://api-docs.igdb.com/#rate-limits) — 4 requests/s, 8 abertas simultaneamente, HTTP 429.
- [IGDB API Docs](https://api-docs.igdb.com/) — autenticação Client Credentials, endpoints, fields, paginação, expansão e Multi-Query; declara uso gratuito não comercial sob Twitch Developer Services Agreement.
- [Twitch Developer Agreement](https://legal.twitch.com/en/legal/developer-agreement/) — regras de Twitch Content/Program Materials e armazenamento. Seu enquadramento específico para os dados IGDB do Save State permanece não verificado.

### Validação executada

- Inspeção estática de arquivos/código e testes listados.
- Consulta web somente a documentação pública oficial.
- **Nenhum teste foi executado**; não foi necessário para produzir esta auditoria.
- Nenhuma chamada autenticada, teste de carga, conexão de banco, seed, migration, instalação, configuração de ambiente ou alteração de produção foi feita.

## 15. Veredito final

**[Confirmada]** A implementação atual respeita o espaçamento publicado dentro de um processo, mas **não garante o limite agregado da IGDB quando múltiplas instâncias Vercel executam ao mesmo tempo**, e também não impõe o máximo de oito chamadas abertas. 429 é identificado, porém não há respeito a Retry-After nem backoff.

**[Confirmada]** As economias mais concretas sem infraestrutura nova são evitar busca de detalhe duplicada na importação, adicionar cache/single-flight para respostas repetidas, reutilizar payload rico já entregue e tornar cancelamento/debounce efetivos. As contagens por operação estão demonstradas na seção 3; não há dados para estimar economia mensal.

**[Provável]** O próximo passo proporcional é instrumentar e aplicar otimizações locais com TTL curto/bounded, mantendo a arquitetura BFF e snapshots de domínio separados do cache. **Redis não é recomendação automática**: torna-se justificável se as métricas ou uma exigência de quota global demonstrarem que memória/Atlas não bastam.

**[Não verificada]** Retenção de metadata IGDB em cache e snapshots persistentes necessita confirmação contratual apropriada ao produto antes de definir política final. A documentação pública não sustenta presumir permissão ilimitada nem afirmar que a regra Twitch de 24 h se aplica automaticamente a todos os campos IGDB.

**Decisão recomendada:** aprovar primeiro a fase de baseline/política; só então priorizar implementação. Nenhuma alteração de código foi iniciada nesta entrega.
