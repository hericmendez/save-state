# DB-LOCAL-07 / GATE 3B.1-C — Pré-verificação local de GameCollection

**Escopo concluído:** revisão local e plano de auditoria.
**Conexão Atlas nesta etapa:** nenhuma.
**Autorização para consultas remotas:** pendente.
**GATE 3B.2:** não autorizado.

## 1. Fatos revisados

### Schema e namespace

`db/models/game-collection.ts` declara `GameCollection` com:

- `userId`: `ObjectId`, obrigatório, `index: true`.
- `name`: `String`, obrigatório, `trim: true`, `index: true`.
- Índice composto `{ userId: 1, name: 1 }`, `unique: true`.
- Timestamps `createdAt` e `updatedAt`.

Mongoose pluraliza o model `GameCollection` para o namespace `gamecollections`. Os três índices observados como ausentes no GATE 3B.1-R2 foram exatamente esses dois simples e o composto único. O índice composto é o requisito de unicidade por usuário; os dois índices simples são de desempenho. `required: true` e `trim: true` são regras de schema/aplicação e não provam que documentos legados existentes as satisfaçam.

O índice composto declara `unique: true`, sem `sparse`, `partialFilterExpression` ou collation explícitos. Ainda é necessário verificar opções padrão da collection, especialmente collation, para definir corretamente a equivalência de strings na consulta de duplicatas e no futuro índice.

### Banco e auditoria anterior

- Destino autorizado: `save-state-dev`.
- GATE 3B.1-R2 reportou 3 índices ausentes em `GameCollection`, nenhuma incompatibilidade reportada, e exit code 1 por índices ausentes.
- O verificador trata `NamespaceNotFound` como lista vazia; portanto, o resultado anterior não prova se `gamecollections` existe.
- O verificador não enumera índices extras nem informa a quantidade de documentos.
- O B-01 usa `autoCreate: false`, `autoIndex: false` e `autoSearchIndex: false` por conexão. Nenhuma alteração de configuração é proposta nesta etapa.

## 2. Plano de consultas — somente após autorização remota específica

Todas as operações devem usar uma conexão autenticada com database explicitamente selecionado como `save-state-dev`. Não usar `listDatabases`, não consultar outro database e não chamar rotas do aplicativo. O resultado de cada consulta deve ser sanitizado antes de ser registrado.

### 2.1 Existência e opções mínimas da collection

Proposta: executar `listCollections` com filtro exato `name: "gamecollections"`, sem listar outras collections. Solicitar apenas os metadados necessários para existência e opções padrão (em particular collation); não registrar validator ou opções que não sejam necessárias.

Saída permitida no relatório: `exists: true/false`, database autorizado e presença/ausência de collation padrão, sem imprimir conteúdo de documentos nem nomes de collections de usuários.

Se `listCollections` retornar vazio, erro de permissão ou resposta ambígua por filtragem de collections autorizadas, não concluir automaticamente que a collection está ausente. Registrar como inconclusivo e bloquear as consultas dependentes até esclarecer a permissão/resultado.

### 2.2 Índices atuais e adicionais

Somente se a collection estiver confirmada: chamar `listIndexes()` exclusivamente em `save-state-dev.gamecollections`.

Comparar as especificações com:

1. `{ userId: 1 }`;
2. `{ name: 1 }`;
3. `{ userId: 1, name: 1 }`, único.

Tratar `_id_` como índice automático separado, não como um dos três declarados. Detectar índices adicionais pela comparação de todas as especificações retornadas com esses três e `_id_`. Registrar apenas chaves e opções relevantes (unique, sparse, partial, TTL, collation), não documentos ou valores de usuários. O nome literal de cada índice pode ser omitido se for redundante com as chaves.

Se `listIndexes()` retornar `NamespaceNotFound`, registrar namespace não encontrado; não converter esse resultado em prova de coleção vazia. Não criar collection ou índice.

### 2.3 Quantidade de documentos

Somente após confirmação da collection, propor uma contagem exata por `countDocuments({})` limitada por `maxTimeMS` finito. A operação devolve apenas um inteiro, mas pode exigir leitura/varredura de toda a collection e, em drivers MongoDB, pode ser implementada através do comando de aggregation. Não usar `dbStats` nem `estimatedDocumentCount` como substituto silencioso de uma contagem exata.

Registrar somente o total. Se houver timeout, erro de autorização ou resultado não confirmado, classificar a contagem como inconclusiva; não fazer retry automático.

### 2.4 Duplicatas do índice composto único

Somente se a collection estiver confirmada e a consulta de documentos/aggregation estiver autorizada: executar pipeline limitado por `maxTimeMS`, agrupando internamente pelos campos do índice `{ userId, name }`, filtrando grupos com contagem maior que um e retornando apenas um resumo agregado, por exemplo:

```js
[
  { $group: { _id: { userId: "$userId", name: "$name" }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
  {
    $group: {
      _id: null,
      duplicateKeyGroups: { $sum: 1 },
      excessDocuments: { $sum: { $subtract: ["$n", 1] } }
    }
  },
  { $project: { _id: 0, duplicateKeyGroups: 1, excessDocuments: 1 } }
]
```

O pipeline nunca deve retornar `_id` de grupo, `userId`, `name` ou documentos. A aplicação cliente deve aceitar somente os dois contadores agregados e não registrar pipeline results brutos, erros brutos, URI ou host.

Antes de interpretar zero duplicatas como prova suficiente, comparar a collation efetiva do índice pretendido com a collation padrão da collection. Se houver collation padrão, a análise deve usar semântica equivalente à do índice futuro. Se isso não puder ser determinado, bloquear a conclusão. O agrupamento também deve tratar campos ausentes/nulos de modo compatível com a chave do índice; a validação de `required` do Mongoose não garante conformidade de dados históricos.

Este passo lê dados de todos os documentos da collection para agrupá-los e pode consumir CPU/memória. Um timeout ou falha não equivale a “sem duplicatas”. Não usar `$out`, `$merge`, writes ou armazenamento temporário persistente. Não usar `allowDiskUse` sem avaliação e autorização próprias.

## 3. Permissões mínimas a confirmar

Não consultar roles automaticamente nem solicitar elevação nesta etapa. O proprietário deve confirmar no painel Atlas que a credencial existente tem somente o necessário:

- `listCollections` para consultar a existência/metadados do namespace no database `save-state-dev` (o comando deve permanecer filtrado ao nome exato).
- `listIndexes` na collection `gamecollections`.
- `find` na collection para contagem e aggregation de duplicatas; aggregation é uma operação de leitura de documentos, embora a resposta seja somente agregada.

Uma role read-only no database pode conceder mais alcance que o estritamente necessário; preferir role customizada de menor privilégio, se já aprovada pelo proprietário. Não alterar roles como parte da auditoria. Erros de autorização devem ser registrados por fase, categoria e código seguro, sem texto bruto ou credenciais.

## 4. Riscos e critérios de bloqueio

Bloquear antes de qualquer consulta dependente se:

- database não puder ser fixado exatamente em `save-state-dev` ou a URI/segurança TLS não passar o preflight;
- a existência do namespace for ambígua ou faltar permissão necessária;
- o índice atual tiver incompatibilidade ou opções inesperadas que impeçam comparação correta;
- collation efetiva para a unicidade não puder ser determinada;
- contagem/aggregation exceder `maxTimeMS`, houver falha de servidor ou o resultado não for sanitizável;
- a consulta proposta precisar retornar ou registrar valores individuais de `userId`, `name` ou documentos;
- o processo Next preexistente gerar atividade Atlas concorrente que impeça atribuir com segurança as operações da auditoria.

Resultados possíveis para duplicatas: zero grupos duplicados permite avançar apenas para revisão do plano de provisionamento; qualquer grupo duplicado bloqueia a criação do índice único até resolução autorizada. Resultado inconclusivo também bloqueia. Ausência da collection exige decisão explícita sobre provisionamento futuro; não criar durante a auditoria.

Mesmo com zero duplicatas, a auditoria não autoriza criar índices. A criação requer autorização separada e revisão de permissões, impacto e plano operacional.

## 5. Processo preexistente e estado da execução

O GATE 3B.1-R2 observou os processos Next preexistentes `24526`, `24550` e `24585`, com sockets Atlas associados ao `next-server`. Esta pré-verificação não interagiu com eles, não inspecionou ambiente/memória, não os encerrou e não abriu conexão Atlas.

Nenhuma consulta deste plano foi executada. Nenhum dado de documento foi lido. Nenhum código, schema, `.env`, credencial, role, dependência ou lockfile foi alterado.

## 6. Próximo passo

Solicitar autorização remota específica para executar, uma vez e sem retries, as consultas de metadados e, se explicitamente autorizadas, a contagem e aggregation descritas acima. A autorização deve confirmar que a leitura de documentos por `countDocuments`/aggregation é permitida e definir timeout finito. GATE 3B.2 continua não autorizado.

**STATUS FINAL: PARCIAL — Pré-verificação concluída; aguardando autorização para consultas remotas.**

---

## Auditoria remota complementar — Resultados

### Pré-condições

- Node `v24.22.2`, pnpm `11.3.0`, Mongoose `8.24.4` e MongoDB Driver `6.20.0` confirmados localmente.
- `MONGODB_DB_NAME` foi resolvido como `save-state-dev`; `.env` tinha modo `600`.
- URI validada sem reproduzi-la: SRV Atlas/Cluster0, sem database path conflitante nem parâmetros TLS inseguros detectados. A URI não foi modificada e `authSource` não foi definido nem alterado.
- O probe usou `MongoClient` diretamente, sem modelos Mongoose; selecionou o database após a conexão (`client.db("save-state-dev")`). Pool limitado a 1, timeouts finitos, `retryReads: false` e `retryWrites: false`.
- Revisão estática do probe: uma conexão, uma chamada filtrada a `listCollections`; nenhuma chamada de escrita, `listDatabases`, consulta de documentos, `listIndexes`, contagem ou agregação antes da decisão de existência.

### Execução e resultado do namespace

- A conexão e autenticação foram aceitas o suficiente para executar a consulta `listCollections`.
- Comando operacional: `pnpm exec tsx /tmp/opencode/gate3b1c-gamecollection-audit.mts` (script temporário sanitizado e removido após o uso).
- Consulta executada uma vez: database selecionado `save-state-dev`, filtro exato `name: "gamecollections"`, opções `nameOnly: false` e `authorizedCollections: true`.
- Duração: **1,340 s**. Exit code do probe: **2**, usado para sinalizar resultado inconclusivo; não houve retry.
- Resultado sanitizado: zero entradas retornadas pelo filtro. Classificação: **`exists: inconclusive`**, não `false`. A resposta vazia não foi tratada como prova de ausência porque a visibilidade pode depender das permissões/semântica de `authorizedCollections`.
- Não houve erro explícito de autorização; ainda assim, o resultado não permite distinguir namespace ausente de visibilidade insuficiente/ambígua.

### Consultas dependentes não executadas

Como a existência do namespace não foi confirmada de forma inequívoca:

- `listIndexes()` não foi executado; índices atuais/adicionais e opções remotas continuam desconhecidos.
- `countDocuments()` não foi executado; quantidade de documentos desconhecida.
- A agregação de duplicatas não foi executada; duplicatas não foram avaliadas.
- Os três índices anteriormente reportados como ausentes permanecem pendentes de confirmação no estado remoto atual. Não houve qualquer tentativa de provisionamento.

### Segurança, concorrência e integridade

- O probe não carregou Models Mongoose, não executou operações de escrita e não retornou nem persistiu documentos ou dados de usuários.
- A conexão foi fechada em `finally` (`closed: true`); o processo temporário terminou e o script temporário foi removido.
- Os PIDs Next preexistentes `24526`, `24550` e `24585` continuavam ativos. Foram observados sockets Atlas associados ao PID `24585`; não foi possível determinar atividade de comandos. Não se atribui qualquer operação a esses processos. A consulta desta auditoria foi somente leitura, mas não se declara ausência global de atividade Atlas.
- `.env` continuou em modo `600`, com `MONGODB_DB_NAME=save-state-dev`; lockfile sem alteração. Nenhum código de aplicação, schema, credencial, role ou configuração Atlas foi modificado.

### Bloqueio e próximo passo

Não fazer fallback nem repetir a consulta sob esta autorização já utilizada. Para retomar, solicitar autorização específica para esclarecer a visibilidade de `listCollections` no namespace exato, usando a credencial existente e sem alterar roles. Só após confirmação inequívoca da existência poderá ser considerada nova autorização para `listIndexes`, contagem e aggregation, cada qual com limites e sanitização previstos neste plano.

**GATE 3B.1-C: PARCIAL — conexão e consulta filtrada concluídas; existência da collection inconclusiva, portanto índices, contagem e duplicatas não foram consultados.**
**GATE 3B.2: NÃO AUTORIZADO.**

---

## GATE 3B.1-D — Confirmação de existência da coleção

### Revisão local da consulta anterior

- O arquivo temporário do probe anterior já havia sido removido. Não foi recriado nem executado novamente.
- O código e o log preservados no registro desta sessão mostram seleção explícita por `client.db("save-state-dev")`, filtro exato `{ name: "gamecollections" }` e consumo completo do cursor com `.toArray()`.
- A chamada usou `{ nameOnly: false, authorizedCollections: true }`. Conforme a semântica MongoDB especificada nesta autorização, `authorizedCollections` só altera o comportamento de autorização junto com `nameOnly: true`; nesta chamada, não limitou os resultados por coleção autorizada.
- A consulta terminou sem exceção: o probe teria emitido um evento `audit-error` sanitizado no `catch`, mas esse evento não aparece no log preservado. O cursor retornou zero entradas. O `exitCode: 2` foi atribuído deliberadamente pelo ramo que classificava o resultado vazio como inconclusivo; não foi um erro da consulta.
- O log registra fechamento bem-sucedido da conexão (`closed: true`).

### Decisão sobre nova consulta

A evidência anterior é suficiente e não foi repetida: a consulta estava filtrada corretamente, o cursor foi consumido, o destino era `save-state-dev` e não há erro de execução ocultado no log sanitizado. Como `authorizedCollections: true` não restringe essa chamada com `nameOnly: false`, zero resultados confirma:

**`exists: false` no instante da consulta GATE 3B.1-C.**

Isso não afirma que `gamecollections` nunca existiu nem garante que continue ausente depois daquele instante. Nenhuma nova conexão ou consulta remota foi aberta no GATE 3B.1-D.

### Pré-condições e integridade desta retomada

- Node `v24.22.2`; pnpm `11.3.0`.
- `.env` permaneceu modo `600`; `MONGODB_DB_NAME` continua configurado para `save-state-dev`; lockfile sem alteração.
- Os PIDs Next `24526`, `24550` e `24585` continuam ativos, com sockets Atlas associados ao `next-server`. Foram apenas observados passivamente; nenhuma operação é atribuída a eles.
- Não houve processo temporário, acesso a documentos, escrita remota, alteração de código, schema, credenciais, roles ou infraestrutura nesta etapa.

### Consequências e próximo passo

Na consulta confirmatória não havia namespace, portanto nenhum índice, documento ou duplicata foi consultado. A ausência remota naquela observação implica que os três índices declarados para `GameCollection` ainda não podiam estar materializados nessa collection naquele instante. A criação futura da collection e dos índices continua dependendo de autorização separada do GATE 3B.2; nenhuma criação foi autorizada ou executada.

Se for necessário afirmar o estado atual após possíveis mudanças concorrentes, solicitar nova autorização para uma consulta `listCollections` filtrada. Para avaliar índices e duplicatas depois de eventual criação da collection, também será necessária autorização explícita para essas consultas.

**GATE 3B.1-D: CONCLUÍDO — `gamecollections` não existia no instante da consulta anterior, confirmada como completa e sem erro.**
**GATE 3B.2: NÃO AUTORIZADO.**
