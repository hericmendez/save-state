# DB-LOCAL-07 / GATE 3B.1 — Auditoria read-only dos índices Atlas

**Veredito: BLOQUEADO antes da conexão.** Nenhuma auditoria remota foi executada.  
**Database previsto:** `save-state-dev`.  
**GATE 3B.2:** não autorizado e não iniciado.

## 1. Resumo executivo

As pré-condições locais confirmaram Node `v24.22.2`, resolução de `MONGODB_DB_NAME=save-state-dev`, URI SRV do domínio Atlas/Cluster0 sem database path nem opções TLS inseguras detectadas, e parsing do comando estritamente em verify-only.

A inspeção do Mongoose `8.24.4` encontrou um caminho de escrita implícito: o B-01 passa `autoIndex: false`, mas não `autoCreate: false`. O default global instalado de Mongoose é `autoCreate: true`; a inicialização de cada Model chama `createCollection()` salvo se `autoCreate` estiver desligado. Os schemas locais não sobrescrevem essa opção. Portanto, abrir a conexão poderia criar coleções ausentes, violando a autorização read-only.

Conforme instruído, o comando B-01 **não foi executado**. Nenhuma conexão Atlas foi aberta. Não houve alteração de código nesta etapa; o bloqueador e as evidências estão registrados aqui.

## 2. Ambiente e integridade

| Verificação | Resultado |
|---|---|
| Checkout | `/home/revi/Documentos/Projects/The Save State Project/AGORA_VAI/save-state` |
| Branch / HEAD | `main` / `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |
| Git status antes do preflight | 479 entradas |
| Node / pnpm | `v24.22.2` / `11.3.0` |
| Mongoose | `8.24.4` |
| `.env` | arquivo regular, modo `600` |
| `MONGODB_DB_NAME` | uma definição; valor `save-state-dev` |
| `pnpm-lock.yaml` | sem alteração no status do Git |

O preflight local carregou o `.env` sem imprimir variáveis secretas. O shell não tinha `MONGODB_URI` nem `MONGODB_DB_NAME` predefinidos. Nenhuma configuração foi alterada.

Depois de criar este relatório, o status ficou com 480 entradas (440 modificados e 40 não rastreados); as mudanças de código preexistentes do GATE 3A permanecem intactas.

## 3. Pré-condições

| Pré-condição | Resultado | Evidência local |
|---|---|---|
| Node.js 24.x | aprovada | `v24.22.2` |
| Database efetivo | aprovada | loader + `resolveMongoDbName` retornaram `save-state-dev` |
| URI Atlas | aprovada localmente | esquema SRV, domínio termina em `mongodb.net` e indica Cluster0; URI não reproduzida |
| Opções TLS inseguras | não detectadas | sem `tls=false`, `ssl=false`, `tlsInsecure=true`, `tlsAllowInvalidCertificates=true`, `tlsAllowInvalidHostnames=true` ou `sslValidate=false` |
| Database path inesperado | não | URI sem path de database |
| Parser do comando informado | aprovada | `--db-name save-state-dev` aceito; `createMissing=false`, `yes=false`, sem confirmação/opt-ins de escrita |
| `autoIndex` | desligado no connect | B-01 passa `autoIndex: false` |
| `autoCreate` | **FALHOU — BLOQUEADOR** | B-01 não passa `autoCreate: false`; default global Mongoose é `true` |
| `connectDatabase()` | não chamado | o script usa `mongoose.connect()` diretamente |
| Seed/migração | não chamados | nenhum caminho para seed/migração no B-01 verify-only |

A checagem TLS acima é inspeção local de URI; não constitui handshake TLS desta etapa. O TLS já havia sido validado em DB-LOCAL-06.

## 4. Inspeção do B-01

### Caminho pretendido read-only

- O parser recebe exatamente `--db-name save-state-dev` e retorna `createMissing=false` e `yes=false`.
- `resolveVerifyIndexesTarget()` seleciona explicitamente `save-state-dev`.
- O script chama `inspectModelIndexes()`; esse fluxo usa `readIndexesOrEmpty()` e `listIndexes()`.
- A chamada `provisionMissingIndexes()` está dentro do ramo `if (createMissing && missing.length > 0)`, falso para este comando.
- Não há `connectDatabase()`, `listDatabases`, `dbStats`, consulta de documentos, seed ou migração no verify-only.
- O erro de conexão é sanitizado e o log de destino não inclui URI ou hostname.

### Bloqueador antes da consulta

O script importa e compila nove Models antes de conectar. No Mongoose instalado:

- `mongoose.get("autoCreate")` retorna `true`;
- `Model.init()` executa `createCollection()` salvo quando `autoCreate` é falso;
- `autoIndex: false` só evita `ensureIndexes()`; não desliga a criação automática de coleções;
- não foi encontrada configuração `autoCreate` nos schemas dos modelos.

Assim, a conexão pode enviar `createCollection` para coleções da aplicação ausentes. Isso é uma escrita e não pode ser permitido nesta auditoria. A consulta local da implementação do Mongoose confirmou o comportamento; nenhuma tentativa remota foi feita.

**Decisão:** não executar `pnpm db:indexes -- --db-name save-state-dev`. Não alterar o script durante este gate e não contornar a proteção por configuração externa.

## 5. Comando e exit codes

| Item | Resultado |
|---|---|
| Comando B-01 previsto | `pnpm db:indexes -- --db-name save-state-dev` |
| Execução B-01 | **não executada** |
| Exit code B-01 | não aplicável |
| Preflight local | concluído, exit 0 |
| Duração remota | não aplicável |

Foi uma única inspeção local de pré-condições. Nenhuma repetição de conexão ocorreu porque não houve conexão.

## 6. Inventário remoto

Não obtido nesta etapa. Não há resultado novo para coleções, índices presentes/ausentes/incompatíveis, índices adicionais ou contagem de índices impostos/desempenho.

A referência local continua sendo 9 modelos, 33 índices declarados e 12 impostos, conforme GATE 3A. A evidência remota anterior sobre a coleção `teste` e seu `_id_` é histórica; não foi reconsultada. `teste` não foi tratada como coleção da aplicação nem alterada.

## 7. Permissões e erros

- Nenhuma operação de metadados chegou ao Atlas; portanto, nenhuma permissão de leitura foi testada neste gate.
- Nenhuma role, usuário ou IP Access List foi consultada ou alterada.
- Sem erro de DNS, TLS, autenticação ou seleção de servidor: não houve tentativa de conexão.
- A revisão de roles no painel Atlas permanece pendente.

## 8. Integridade e efeitos persistentes

- Nenhuma conexão Atlas aberta por esta execução; nenhum database remoto selecionado por conexão dela.
- Nenhuma coleção criada, índice criado, documento lido/escrito ou recurso remoto alterado.
- Nenhum seed, migração ou aplicativo iniciado.
- `.env` permaneceu `600`, sem alteração de conteúdo; `MONGODB_DB_NAME` segue único e com valor `save-state-dev`.
- Sem instalação de dependências ou alteração de lockfile.
- Nenhuma modificação de código nesta etapa.
- O preflight temporário foi removido; nenhum processo ou socket foi criado por esta etapa.
- Na checagem final foi detectado um `pnpm dev`/servidor Next já em execução com sockets estabelecidos para hosts MongoDB Atlas. Esta execução não iniciou esse processo, não inspecionou seu ambiente, não interagiu com ele e não o encerrou, conforme a regra de preservar processos preexistentes. Sua origem/autor não foi determinada.
- Por causa desse processo preexistente, não se pode afirmar que o aplicativo esteja globalmente parado ou que nenhum tráfego Atlas ocorra no ambiente; afirma-se apenas que o GATE 3B.1 não iniciou conexão nem enviou comandos ao Atlas.

## 9. Bloqueador e próxima autorização

Antes de qualquer consulta remota read-only, o B-01 precisa garantir explicitamente tanto `autoIndex: false` quanto `autoCreate: false` na conexão, ou demonstrar por outro mecanismo que a inicialização dos Models não emite comandos de criação. Essa correção requer alteração local e testes isolados; não foi feita neste GATE 3B.1 porque a instrução determinava parar ao detectar o caminho de escrita.

Após a correção, solicitar nova autorização para repetir o preflight e executar uma única auditoria read-only. Só depois de registrar coleções/índices e revisar roles poderá ser considerada uma autorização separada para GATE 3B.2.

**GATE 3B.1: BLOQUEADO — interrompido corretamente antes da conexão.**  
**GATE 3B.2: NÃO AUTORIZADO.**  
**STATUS FINAL: PARCIAL — auditoria remota bloqueada pelo caminho implícito de `createCollection()`; servidor Next preexistente com sockets Atlas foi preservado e permanece fora do controle desta execução.**

---

## Adendo — GATE 3B.1-R (correção local)

Em acompanhamento, o B-01 recebeu `autoCreate: false` além de `autoIndex: false` e `autoSearchIndex: false`, e passou a importar/compilar os Models somente depois de a conexão aplicar essas opções por conexão. Isso remove o bloqueador local descrito acima para o caminho verify-only.

A correção foi testada localmente com inicialização real de `Model.init()` em uma instância Mongoose isolada, conexão simulada e sem servidor; a precedência schema > conexão > global também foi testada com operações de escrita mockadas. Os testes focados (4 arquivos/36 testes), TypeScript e ESLint passaram. Nenhuma auditoria Atlas foi executada neste adendo. O diagnóstico histórico e o veredito do GATE 3B.1 original permanecem preservados; para estado atual, consultar `docs/DB_LOCAL_07_GATE3B1_READONLY_FIX.md`.

---

## Retomada GATE 3B.1-R2 — Auditoria remota após correção do autoCreate

### Pré-condições

- Node `v24.22.2`; pnpm `11.3.0`; Mongoose `8.24.4`.
- O loader e `resolveMongoDbName()` resolveram `save-state-dev`; o parser recebeu `--db-name save-state-dev`, com `createMissing=false`, `yes=false` e sem confirmação ou opt-ins de escrita.
- A URI foi analisada localmente sem reproduzi-la: SRV, domínio Atlas/Cluster0, path ausente ou `/`, sem parâmetros TLS inseguros detectados. Nenhuma tentativa de conexão foi feita durante o preflight.
- `scripts/lib/index-audit-options.ts` fornece `autoCreate: false`, `autoIndex: false` e `autoSearchIndex: false` no connect do B-01. Os modelos são importados somente depois do connect.
- O caminho verify-only chama `inspectModelIndexes()`/`listIndexes()`; `aggregate()` está somente no ramo de criação explícita, e `provisionMissingIndexes()` também está protegido por `createMissing && missing.length > 0`. O parser rejeita flags desconhecidas e não recebeu flags de escrita. Testes de GATE 3B.1-R cobrem `Model.init()` sem servidor, ausência de métodos de escrita, precedência e namespace ausente.
- O B-01 não executa seed, migração, `connectDatabase()`, `listDatabases`, `dbStats` ou consultas a documentos no verify-only.
- `.env` estava modo `600`; lockfile sem alteração registrada. O comando foi executado uma única vez, sem editar código.

### Execução

Comando exato: `pnpm db:indexes -- --db-name save-state-dev`

Duração observada: **1.985 s**. Exit code: **1**. O script concluiu a comparação e retornou erro por índices declarados ausentes; o texto detalhado do erro final é intencionalmente sanitizado pelo B-01. Não houve retry.

### Inventário obtido

- Destino informado pelo B-01: `atlas`; database `save-state-dev`.
- Os nove modelos configurados foram compilados após a conexão e incluídos na inspeção; total local declarado de referência: 33 índices.
- Nenhuma incompatibilidade foi reportada.
- Foram reportados como ausentes, todos em `GameCollection`:
  - `{ userId: 1 }` — desempenho.
  - `{ name: 1 }` — desempenho.
  - `{ userId: 1, name: 1 }`, `unique: true` — imposto/integridade.
- Contra a referência local de 33 declarações: 3 ausentes e 30 presentes/compatíveis. Ausentes impostos: **1**; ausentes de desempenho: **2**.
- O B-01 não emite inventário completo de collections nem calcula índices adicionais. Como `NamespaceNotFound` é convertido em lista vazia, não é possível distinguir por esta saída se a collection `gamecollections` está ausente ou existe sem esses índices. A collection histórica `teste` não é uma collection de modelo e não foi consultada/alterada.
- Nenhum dado de documento foi retornado ou incluído no log.

### Segurança, encerramento e limitações

- A verificação usou `listIndexes()` e inicialização com os três auto-builders Mongoose desativados por conexão. Nenhum caminho de escrita do B-01 verify-only foi executado; não houve provisionamento, criação de collections/índices, consulta de documentos, seed ou migração.
- Após a inspeção, o fluxo entra no `finally` do B-01 e chama `mongoose.disconnect()`. O processo do comando terminou com exit code 1; não restou processo `tsx`/`verify-indexes` desta auditoria.
- Os PIDs preexistentes `24526`, `24550` e `24585` continuavam ativos no diretório do projeto. Havia sockets Atlas estabelecidos associados ao `next-server` PID `24585`, observados sem expor endereços. Esses processos não foram iniciados, inspecionados por ambiente, acessados, reiniciados ou encerrados. Portanto, não se afirma ausência global de atividade Atlas nem se atribui qualquer operação remota independente a esses processos.
- `.env` permaneceu modo `600`, `MONGODB_DB_NAME` continua com uma definição `save-state-dev`; lockfile intacto. Nenhuma dependência, código, credencial, role, configuração Atlas ou Vercel foi modificada nesta retomada.
- `git diff --check` retornou exit 2 no working tree amplo, apontando whitespace/CRLF em alterações preexistentes (incluindo `.gitignore`); esses arquivos não foram corrigidos. A seção R2 deste relatório foi verificada separadamente e não contém whitespace final.
- Índice único ausente é bloqueador para o futuro provisionamento até revisão. Não houve análise de duplicatas, pois isso exigiria leitura de documentos e não faz parte desta auditoria.

### Próximos bloqueadores e recomendação

Antes de preparar GATE 3B.2: confirmar no Atlas se `gamecollections` existe e avaliar a criação do índice único ausente com procedimento separado, incluindo verificação autorizada de duplicatas e revisão de roles no painel Atlas. Os dois índices de desempenho ausentes também devem ser considerados no plano. A auditoria não detectou incompatibilidades, mas não inventariou índices adicionais.

**GATE 3B.1-R2: PARCIAL — auditoria read-only executada; há um índice imposto ausente e o B-01 não distingue collection ausente nem inventaria índices adicionais.**
**GATE 3B.2: NÃO AUTORIZADO.**
