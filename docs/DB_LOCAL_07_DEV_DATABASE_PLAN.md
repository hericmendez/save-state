# DB-LOCAL-07 — Plano de preparação segura do database de desenvolvimento

**Data:** 12/11/2026
**Fase:** DB-LOCAL-07 / GATE 1 — planejamento
**Nome aprovado pelo proprietário:** `save-state-dev`
**Veredito do GATE 1:** **CONCLUÍDO — PLANO PRONTO PARA AUTORIZAÇÃO**
**Criação/configuração do database:** **NÃO AUTORIZADA**
**Provisionamento de índices/seeds:** **NÃO AUTORIZADO**

## 1. Escopo e não objetivos

Este documento registra o diagnóstico e o plano da fase DB-LOCAL-07, limitada ao GATE 1. O objetivo é preparar o uso seguro de um database exclusivo de desenvolvimento no MongoDB Atlas, sem executar qualquer alteração real.

Estão fora do escopo do GATE 1:

- criar, acessar, alterar ou validar o database `save-state-dev`;
- abrir qualquer conexão autenticada adicional com o Atlas;
- executar `ping`, `listDatabases`, `listCollections`, `listIndexes`, `dbStats` ou comandos equivalentes;
- alterar `.env`, credenciais, URI, `authSource`, usuários ou permissões do Atlas;
- alterar código, scripts, testes, dependências, lockfile, Vercel ou configurações de rede;
- criar coleções, índices, seeds, migrações ou documentos;
- iniciar a aplicação, rodar testes com banco ou executar build;
- instalar ou trocar a versão do Node.js;
- fazer commit, push ou deploy.

A única decisão já autorizada pelo proprietário é o nome `save-state-dev`. As demais etapas dependem de autorização explícita e separada.

## 2. Resumo executivo

- O checkout atual **não** aponta para `save-state-dev`. Sem `MONGODB_DB_NAME`, `resolveMongoDbName` usa o fallback de desenvolvimento `save-state`.
- A URI local não possui database path e não define `authSource`; o `.env` também não define `MONGODB_DB_NAME`.
- Com Mongoose, definir `MONGODB_DB_NAME=save-state-dev` seleciona o database da aplicação **sem** alterar o `authSource` implícito. O Mongoose remove `options.dbName` antes de criar o `MongoClient` e seleciona o database com `client.db(dbName)`.
- O comportamento é diferente de usar `MongoClient` diretamente com a opção `dbName`: nesse caso o driver herda `credentials.source = dbName` quando não há `authSource` explícito. Essa diferença é crítica e está detalhada na seção 7.
- O inventário local atual declara **33 índices** em 9 modelos, dos quais **12** são índices impostos (`unique`, `sparse`, `partialFilterExpression` ou TTL).
- Em desenvolvimento, `connectDatabase()` executa `ensureIndexes()` em todos os modelos e pode criar os 33 índices. Em produção ou com `readOnlyIndexes`, apenas os 12 índices impostos são verificados, sem escrita.
- O script B-01 (`pnpm db:indexes`) inspeciona e cria somente índices ausentes; nunca remove, substitui ou sincroniza índices. Ele cria os 33 índices declarados, não apenas os 12 impostos.
- O usuário de runtime de desenvolvimento precisa de leitura/escrita e de criação de coleções/índices no database `save-state-dev`, pois o código atual provisiona índices automaticamente em desenvolvimento. Para produção, recomenda-se um usuário separado e mais restrito.
- Riscos identificados: `seed-atlas.ts` não valida o nome do database; `migrate-lists-to-collections.ts` usa `mongoose.connect(uri)` sem `dbName` e pode cair no database padrão `test`; `verify-indexes.ts` imprime o host sem máscara e não tem allowlist de database; o fallback para `save-state` é silencioso fora da Vercel; o Node.js 24 declarado não está instalado.
- Nenhum database foi criado, acessado ou alterado nesta fase. O GATE 2 depende de autorização explícita do proprietário.

## 3. Premissas e decisões do proprietário

| ID | Decisão | Status |
|---|---|---|
| D-01 | O nome do database de desenvolvimento é `save-state-dev` | Aprovado pelo proprietário |
| D-02 | DB-LOCAL-07 GATE 1 é somente diagnóstico e planejamento | Cumprido |
| D-03 | Nenhuma criação implícita de database, coleção, índice ou documento | Regra vigente |
| D-04 | Não reutilizar credenciais de produção em desenvolvimento | Regra vigente |
| D-05 | Não desabilitar TLS nem usar opções inseguras | Regra vigente |
| D-06 | Não executar seeds, migrações ou testes com banco nesta fase | Regra vigente |
| D-07 | Não alterar `.env`, código, credenciais ou Atlas nesta fase | Regra vigente |
| D-08 | Estratégia de usuário/`authSource` do Atlas | Pendente de decisão no GATE 2 |
| D-09 | Cluster/projeto do Atlas para desenvolvimento | Pendente |
| D-10 | Nome e ciclo de vida do database de Preview | Pendente |
| D-11 | Método de instalação e validação do Node.js 24 | Pendente |
| D-12 | Implementação de guardas nos scripts operacionais | Pendente; recomendações na seção 12 |

## 4. Ambiente Linux observado

| Item | Valor observado |
|---|---|
| Sistema | Garuda Linux (rolling), KDE |
| Kernel | `7.2.14-zen1-1-zen` x86_64 |
| Diretório do projeto | raiz do checkout local do Save State |
| Branch / HEAD | `main` / `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |
| Node.js ativo | `v22.23.4` |
| Pacote do Node.js | `nodejs-lts-jod 22.23.4-1` |
| npm | `12.2.2` |
| pnpm | `11.3.0` |
| OpenSSL | `3.6.5` |
| Gerenciadores de Node detectados | nenhum (`nvm`, `fnm`, `volta`, `asdf`, `mise`, `n`, `corepack` ausentes) |
| Node.js 24 instalado | não detectado |
| Declaração do projeto | `.nvmrc` com `24`; `engines.node` com `24.x` |

O projeto declara Node.js 24.x, mas o runtime disponível é Node.js 22.23.4. A conectividade já foi validada no Node.js 22 (DB-LOCAL-06), porém isso não substitui a validação de paridade com o runtime declarado para produção. Nenhuma instalação ou alteração de versão foi feita nesta fase.

## 5. Configuração atual sanitizada

O `.env` local permaneceu inalterado durante esta fase.

| Campo | Resultado permitido |
|---|---|
| `MONGODB_URI` | Presente; valor não impresso |
| Formato | `mongodb+srv` |
| Credenciais | Presentes; valores não impressos |
| Database path na URI | Ausente |
| `MONGODB_DB_NAME` | Ausente |
| `authSource` na URI | Ausente (implícito) |
| Opções de query | Nenhuma |
| TLS inseguro | Ausente |
| `NODE_EXTRA_CA_CERTS` / `NODE_TLS_REJECT_UNAUTHORIZED` | Não definidos |
| `SSL_CERT_FILE` / `SSL_CERT_DIR` | Não definidos |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY` | Não definidos |

Chaves presentes no `.env`, sem valores: `MONGODB_URI`, `JWT_SECRET`, `APP_URL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `SEARCH_METHOD`.

O `.env` não contém `MONGODB_DB_NAME`. Portanto, fora da Vercel, a aplicação resolve o database para o fallback `save-state`.

### 5.1 Regras de resolução do nome

`db/mongo-config.ts` aplica a seguinte ordem:

1. `override` explícito, quando fornecido por script;
2. `MONGODB_DB_NAME`;
3. em Vercel (`VERCEL=1`, `VERCEL_ENV=production` ou `VERCEL_ENV=preview`), erro explícito;
4. fora da Vercel, fallback de desenvolvimento `save-state`.

O nome é normalizado com `trim()` e validado por `/^[A-Za-z0-9_-]{1,63}$/`. Nomes vazios, com ponto, espaço, barra ou caracteres não ASCII são recusados.

## 6. Nome aprovado e semântica de seleção

`save-state-dev` atende à validação atual: 13 caracteres, apenas letras minúsculas e hífen, dentro do limite de 63 bytes.

Recomendações:

- selecionar o database por `MONGODB_DB_NAME=save-state-dev`, não por path na URI;
- manter a URI sem database path para reduzir ambiguidade;
- não usar `save-state-dev` como nome de usuário, projeto, cluster ou coleção;
- não criar variações como `save-state-dev-2` sem uma decisão explícita de nomenclatura;
- tratar o nome como case-sensitive;
- no GATE 2, alterar somente o `.env` local após autorização, sem imprimir a URI;
- não usar o fallback `save-state` como destino de desenvolvimento quando o objetivo é `save-state-dev`.

O código atual passa `dbName` explicitamente ao Mongoose, tanto em `connectDatabase()` quanto em `scripts/verify-indexes.ts`. O comentário do script confirma que um pathname na URI não sobrescreve o `dbName` explícito.

## 7. Descoberta crítica: `dbName` e `authSource`

Esta é a principal descoberta técnica do GATE 1. O resultado depende de usar Mongoose ou o driver diretamente.

### 7.1 Comportamento do driver MongoDB 6.20.0

No arquivo `node_modules/.pnpm/mongodb@6.20.0/node_modules/mongodb/lib/connection_string.js`, quando há credenciais e `dbName` é fornecido sem `authSource` explícito, o driver faz:

```text
credentials.source = mongoOptions.dbName
```

As linhas relevantes são aproximadamente `303-309`. Se nenhum `dbName` for fornecido, o driver aplica o padrão `test` nas linhas `323-325`.

Consequência: usar `new MongoClient(uri, { dbName: "save-state-dev" })` com uma URI sem `authSource` faz o driver autenticar contra `save-state-dev`, não contra `admin`.

### 7.2 Comportamento do Mongoose 8.24.4

No arquivo `node_modules/.pnpm/mongoose@8.24.4/node_modules/mongoose/lib/drivers/node-mongodb-native/connection.js`:

- a linha `311` captura `options.dbName`;
- a linha `315` executa `delete options.dbName`;
- a linha `343` cria `new mongodb.MongoClient(uri, options)` já sem `dbName`;
- a linha `442` seleciona o database com `client.db(dbName)`.

Consequência: com Mongoose, `dbName` seleciona o database da aplicação, mas **não** entra nas opções do `MongoClient` e, portanto, **não altera** o `authSource` implícito.

### 7.3 Matriz de comportamento

| Cenário | Database da aplicação | `authSource` efetivo | Observação |
|---|---|---|---|
| Mongoose + `dbName`, URI sem `authSource` | `save-state-dev` | implícito `admin` | Cenário previsto para a aplicação |
| Mongoose + `dbName`, URI com `authSource=admin` | `save-state-dev` | `admin` | Explícito e equivalente ao implícito |
| Mongoose + URI com path, `dbName` explícito | `save-state-dev` | implícito `admin` | O `dbName` explícito vence para a aplicação |
| `MongoClient` + `dbName`, URI sem `authSource` | `save-state-dev` | `save-state-dev` | Evitar sem planejamento |
| `MongoClient` com path na URI, sem `authSource` | database do path | database do path | Evitar como mecanismo de seleção |
| `MongoClient` sem path e sem `dbName` | `test` | `admin` | Comportamento padrão do driver |

### 7.4 Decisão recomendada

- Criar o usuário de aplicação no banco de autenticação `admin` do Atlas, com roles limitadas ao database `save-state-dev`.
- Manter `authSource` implícito ou fixar `authSource=admin` na URI, desde que o usuário esteja em `admin`.
- Não criar o usuário de aplicação dentro de `save-state-dev` sem uma decisão explícita, pois isso mudaria o `authSource` efetivo.
- Não usar `MongoClient` diretamente com `{ dbName }` para operações de aplicação sem revisar o `authSource`.
- Não reutilizar o usuário amplo atual para desenvolvimento sem antes confirmar suas roles no painel do Atlas.

Nenhuma verificação de usuário, role ou `authSource` real foi executada nesta fase. A conclusão acima é baseada em inspeção de código e em testes locais com URI fictícia, sem conexão com o Atlas.

## 8. Inventário de modelos e índices (B-01)

O inventário foi extraído dos schemas Mongoose no checkout Linux atual, sem conexão com banco. O total é **33 índices declarados** e **12 índices impostos**.

| Modelo | Declarados | Impostos | Índices impostos relevantes |
|---|---:|---:|---|
| `User` | 1 | 1 | `{ email: 1 }` unique |
| `GlobalGame` | 4 | 4 | `{ slug: 1 }` unique; `{ atpDomainId: 1 }` unique sparse; `{ igdbId: 1 }` unique sparse; `{ name: 1 }` unique com `partialFilterExpression: { source: "manual" }` |
| `UserGame` | 7 | 1 | `{ userId: 1, gameId: 1 }` unique |
| `GameReview` | 3 | 1 | `{ userGameId: 1 }` unique |
| `GameCollection` | 3 | 1 | `{ userId: 1, name: 1 }` unique |
| `PasswordResetToken` | 3 | 2 | `{ tokenHash: 1 }` unique; `{ expiresAt: 1 }` TTL `expireAfterSeconds: 0` |
| `EmailVerificationToken` | 3 | 2 | `{ tokenHash: 1 }` unique; `{ expiresAt: 1 }` TTL `expireAfterSeconds: 0` |
| `Activity` | 5 | 0 | Apenas índices de desempenho |
| `UserGameNote` | 4 | 0 | Apenas índices de desempenho |

Os demais índices são de desempenho e não são exigidos pelo readiness de produção. Ainda assim, o B-01 completo os inspeciona e os cria quando ausentes.

### 8.1 Comportamento do B-01

`scripts/verify-indexes.ts`:

- é verify-only por padrão;
- exige **ambos** `--create-missing` e `--yes` para criar;
- nunca remove, substitui ou sincroniza índices;
- usa `--db-name`, depois `MONGODB_DB_NAME`, depois o fallback `save-state`;
- imprime o host e o database alvo antes de qualquer operação;
- trata `code 26` como namespace ausente/lista vazia;
- detecta índices incompatíveis e aborta antes de qualquer escrita;
- antes de criar índices unique, procura duplicatas e aborta se houver conflito;
- após provisionar, verifica novamente e falha se restar índice ausente ou incompatível;
- usa `createIndex`, que pode materializar coleções e o database.

`db/index-management.ts`:

- compara chaves de índice de forma estável;
- considera apenas `unique`, `sparse`, `partialFilterExpression` e `expireAfterSeconds` como opções relevantes;
- falha fechado quando um índice imposto está ausente ou incompatível;
- não altera documentos;
- não executa `dropIndexes`, `syncIndexes` ou `dropCollection`.

### 8.2 Desenvolvimento versus produção

- Desenvolvimento e testes: `connectDatabase()` chama `model.ensureIndexes()` em todos os models. Isso pode criar os 33 índices e as coleções correspondentes.
- Produção ou `readOnlyIndexes`: `connectDatabase()` chama `verifyEnforcedModelIndexes()`, que verifica somente os 12 índices impostos e não escreve.
- O B-01 cria os 33 índices declarados; não se limita aos 12 impostos.
- O database `save-state-dev` deve ser provisionado com os 33 índices para manter paridade com desenvolvimento, mesmo que o readiness de produção só exija 12.

### 8.3 Contagem histórica

Documentos anteriores mencionam 30 índices em uma validação e 33 em outra. O checkout Linux atual declara 33. O script deriva a lista diretamente dos schemas, portanto a contagem de 33 é a referência para o GATE 3. A diferença deve ser confirmada novamente no momento do provisionamento, sem confiar apenas em números históricos.

## 9. Requisitos de permissões no Atlas

Usuários do MongoDB Atlas são diferentes dos usuários da aplicação. Criar um usuário da aplicação (`users`) é uma escrita de documento e não exige criação de usuário do Atlas.

### 9.1 Matriz recomendada

| Carga | Usuário | Banco de autenticação | Permissões recomendadas | Justificativa |
|---|---|---|---|---|
| Runtime de desenvolvimento | `app-dev` | `admin` | `readWrite` em `save-state-dev` ou role customizada equivalente | Leitura/escrita de dados e criação automática de índices no modo dev |
| Verificação B-01 | `index-verifier` | `admin` | `read`, `listCollections`, `listIndexes` em `save-state-dev` | Verificar sem escrever |
| Provisionamento B-01 | `index-provisioner` | `admin` | `read`, `createCollection`, `createIndex`, `listCollections`, `listIndexes` em `save-state-dev` | Criar somente índices/coleções ausentes |
| Seed sintético (GATE 4) | `seeder-dev` | `admin` | `read`, `insert`, `update`, `remove` em `save-state-dev` | Upserts idempotentes sem drops |
| Runtime de produção | `app-prod` | `admin` | Role mínima de leitura/escrita no database de produção, sem gestão de coleções/índices | Código de produção não deve criar índices |

Observações:

- `readWrite` é amplo dentro do database e inclui gestão de coleções/índices. Para produção e para o provisionador, prefira uma role customizada sem `dropCollection` e sem `dropDatabase`.
- Não conceder `atlasAdmin`, `clusterAdmin`, `readWriteAnyDatabase`, `dbAdminAnyDatabase`, `root` ou roles equivalentes para a aplicação.
- Não conceder `listDatabases` se não for necessário.
- Transações exigem apenas leitura/escrita nas coleções envolvidas; não exigem role administrativa. O Atlas oferece replica set.
- TTL não exige permissão especial além de `createIndex`.
- O usuário de provisionamento deve ser separado do usuário de runtime quando possível, para que a aplicação não tenha poder de alterar índices em produção.
- O usuário de desenvolvimento não deve ser reutilizado em Preview ou Produção.

### 9.2 `authSource` recomendado

- Criar usuários no banco de autenticação `admin` do Atlas, com roles por database.
- Manter `authSource` implícito ou `authSource=admin` na URI.
- Se o proprietário decidir criar o usuário dentro de `save-state-dev`, a URI precisará refletir `authSource=save-state-dev`; isso deve ser decidido e documentado antes da conexão.
- Não misturar credenciais de `admin` com `authSource` de `save-state-dev` sem teste controlado.

## 10. Estratégia de isolamento

### 10.1 Dev, Preview e Produção

- Desenvolvimento usa `save-state-dev`.
- Preview deve usar um database próprio, por exemplo `save-state-preview`, ou um nome único por preview. Não compartilhar com desenvolvimento.
- Produção deve usar um database próprio e, preferencialmente, um cluster/projeto separado.
- O nome do database de Preview e sua política de limpeza ainda precisam ser definidos.
- Não usar dados de produção em desenvolvimento. Seeds devem ser sintéticos.

### 10.2 Mesmo cluster versus cluster separado

Usar o mesmo cluster para desenvolvimento e produção oferece isolamento lógico por database, mas compartilha:

- capacidade de CPU, memória e I/O;
- backups e restaurações em nível de cluster;
- manutenção e janelas de upgrade;
- lista de acesso de rede;
- limites e incidentes do cluster;
- risco de uma credencial ampla atravessar databases.

Para produção, recomenda-se cluster/projeto separado e credencial separada. Se o mesmo cluster for mantido, o isolamento depende de credenciais com roles estritamente limitadas e de um allowlist de nomes de database nos scripts.

### 10.3 Rede e TLS

- Manter a lista de acesso atual, restrita.
- Não abrir `0.0.0.0/0` para facilitar desenvolvimento.
- Não desabilitar TLS.
- Não usar `tlsInsecure`, `tlsAllowInvalidCertificates` ou equivalentes.
- Reutilizar a evidência de TLS da DB-LOCAL-05/06 somente como referência; o GATE 3 deve registrar a validação da conexão autorizada.

## 11. Riscos de scripts, seeds e migrações

| Item | Guarda atual | Risco | Status no GATE 1 |
|---|---|---|---|
| `db/connection.ts` | Resolve `dbName`; fallback `save-state` fora da Vercel; `ensureIndexes()` em dev | Escrita implícita de índices/coleções no primeiro uso; fallback silencioso | Não executado |
| `scripts/verify-indexes.ts` | `--create-missing` + `--yes`; create-only; pós-verificação | Sem allowlist de database; imprime host sem máscara; pode criar database/coleções | Não executado |
| `scripts/seed-atlas.ts` | Exige URI classificada como Atlas; upserts idempotentes | Não valida o nome do database; usa `connectDatabase()` e pode criar índices; cria/reutiliza usuário de teste; requer `MOCK_EMAIL`/`MOCK_PASSWORD` | Não executado |
| `scripts/seed.ts` | Exige localhost/127.0.0.1 e database exatamente `save-state` | Seguro apenas para o banco local; não serve para Atlas | Não executado |
| `scripts/migrate-lists-to-collections.ts` | Default dry-run; live exige `--backup-dir`; drop exige confirmação e contagem | Usa `mongoose.connect(uri)` sem `dbName`; sem guarda de Atlas; sem path, o driver usa `test`; `--live` escreve; `--drop-legacy` remove coleção | Não executado |
| `db/readiness.ts` | Verifica índices impostos em produção, read-only | Não cobre os índices de desempenho; depende de conexão | Não executado |
| `tests/e2e-perf/global-setup.ts` | Exige `E2E_DATABASE_EPHEMERAL=1`, `E2E_ALLOW_DATABASE_RESET=1`, `save-state-e2e`, host local e replica set | Padrão forte; não usar contra Atlas | Não executado |
| Runtime da aplicação | Fallback `save-state`; `MONGODB_DB_NAME` obrigatório na Vercel | Se o `.env` for esquecido, o alvo pode ser o banco errado | Não iniciado |

### 11.1 Detalhe do seed Atlas

`server/seeds/atlas-seed.ts` chama `connectDatabase()` na linha 395. Em ambiente diferente de produção, isso executa `ensureIndexes()` em todos os models. Portanto, rodar o seed Atlas sem `NODE_ENV=production` pode provisionar índices e coleções como efeito colateral, além de escrever documentos. O script não verifica se o database alvo é `save-state-dev`; ele apenas verifica se a URI é Atlas.

### 11.2 Detalhe da migração

`scripts/migrate-lists-to-collections.ts` chama `mongoose.connect(uri)` na linha 75, sem `dbName`. Com a URI atual (sem path), o driver aplicaria o database padrão `test`, não `save-state` nem `save-state-dev`. O script não tem guarda de Atlas. Não deve ser executado com a URI do Atlas.

## 12. Guardas recomendadas para os scripts

Estas recomendações não foram implementadas nesta fase.

1. Criar um resolvedor central de alvo que:
   - exija `--db-name` ou `MONGODB_DB_NAME` para operações de escrita;
   - recuse o fallback `save-state` quando a intenção for `save-state-dev`;
   - valide o nome pelo mesmo regex de `resolveMongoDbName`;
   - mantenha um allowlist explícito por fase.
2. Em `verify-indexes.ts`:
   - exigir `--db-name save-state-dev` ou `MONGODB_DB_NAME=save-state-dev`;
   - exigir uma confirmação adicional, por exemplo `--confirm-db-name save-state-dev`;
   - recusar execução se `VERCEL_ENV=production` ou se o database estiver em uma denylist de produção;
   - imprimir apenas um fingerprint mascarado do host, não o host completo;
   - manter a pré-checagem de índices incompatíveis e duplicatas;
   - manter create-only, sem drops.
3. Em `seed-atlas.ts`:
   - exigir database explícito `save-state-dev`;
   - exigir confirmação nominal;
   - recusar produção e recusar fallback;
   - exigir `--yes` explícito;
   - imprimir apenas alvo mascarado;
   - manter upserts idempotentes e nunca usar `dropDatabase`;
   - preferir um usuário de seed sem `dropCollection`.
4. Em `migrate-lists-to-collections.ts`:
   - exigir `--db-name` explícito;
   - recusar Atlas sem autorização específica;
   - manter dry-run como padrão;
   - exigir confirmação para `--live` e `--drop-legacy`;
   - nunca permitir o database padrão `test` como destino acidental.
5. Em logs:
   - não imprimir URI, usuário, senha, hostname ou IP;
   - usar fingerprint SHA-256 ou prefixo curto do hash de identidade;
   - manter mensagens de erro sem `error.stack` que possa conter detalhes sensíveis.
6. Antes de operações de escrita:
   - verificar a versão do Node.js contra `engines.node`;
   - verificar que o lockfile está inalterado;
   - registrar o database alvo e o modo (verify-only, provision, seed);
   - falhar fechado se a configuração estiver ambígua.

## 13. Pré-requisitos de runtime Linux e Node.js 24

- O projeto declara Node.js 24.x em `.nvmrc` e `engines.node`.
- O runtime atual é Node.js 22.23.4, instalado via `nodejs-lts-jod`.
- Não há `nvm`, `fnm`, `volta`, `asdf`, `mise`, `n` ou `corepack` disponíveis.
- `pnpm 11.3.0` está disponível em `/usr/bin/pnpm`.
- A instalação do Node.js 24 deve ser feita com autorização específica, preferencialmente em nível de usuário, sem alterar pacotes do sistema sem necessidade.
- Após instalar, validar `node -v`, `pnpm -v`, `node -p "process.versions.openssl"` e a compatibilidade com o projeto.
- Não executar `pnpm install` sem necessidade; se necessário, usar `--frozen-lockfile` para preservar o lockfile.
- A evidência de conectividade da DB-LOCAL-06 foi obtida no Node.js 22 e não deve ser apresentada como validação final de produção.
- O GATE 5 deve ser executado no Node.js 24 ou a exceção deve ser registrada e aprovada pelo proprietário.

## 14. Plano por gates

| Gate | Autorização necessária | Ações permitidas | Proibições | Evidência esperada |
|---|---|---|---|---|
| GATE 1 | Aprovação do nome e do escopo de planejamento | Diagnóstico, inspeção local, documentação | Qualquer conexão Atlas, escrita, alteração de código/env | Este documento, addendum e validações |
| GATE 2 | Autorização explícita para configuração | Definir `MONGODB_DB_NAME=save-state-dev` no `.env` local; confirmar/criar usuário dev com roles mínimas; decidir `authSource` | Criar índices, seeds, migrações, app, testes com banco | Configuração sanitizada, usuário/role documentados, nenhuma escrita |
| GATE 3 | Autorização explícita para provisionamento | Criar database/coleções/índices via B-01, com `--db-name save-state-dev --create-missing --yes`; verificar depois | Seed, migração, drop, produção, tráfego do app | 33 índices declarados, 12 impostos, zero ausentes/incompatíveis, alvo mascarado |
| GATE 4 | Autorização explícita para dados sintéticos | Seed idempotente com dados sintéticos, se necessário; verificar contagens | Dados de produção, drop, reset destrutivo, outro database | Contagens, segunda execução idempotente, nenhum drop |
| GATE 5 | Autorização explícita para validação da aplicação | Conexão Mongoose, readiness, fluxos autorizados, sem tráfego de produção | E2E contra produção, seeds, migrações, alterações de índice | Readiness OK, logs sem segredos, Node.js 24 validado |

### 14.1 Rollback

- Se o alvo estiver errado, interromper imediatamente.
- Não executar drops automáticos.
- Revogar a credencial usada, se houver suspeita de exposição.
- Preservar evidências e registrar o ocorrido.
- Excluir database/coleções somente com autorização explícita, backup e confirmação nominal.
- Não usar `git reset`, `git clean` ou `git stash` para “limpar” o ambiente.

## 15. Comandos futuros permitidos e proibidos

### 15.1 Permitidos somente após autorização do gate correspondente

Verificação read-only no GATE 3:

```bash
pnpm db:indexes -- --db-name save-state-dev
```

Provisionamento create-only no GATE 3:

```bash
pnpm db:indexes -- --db-name save-state-dev --create-missing --yes
```

Seed sintético no GATE 4, somente após atualizar as guardas:

```bash
pnpm db:seed:atlas
```

Seed local, nunca Atlas:

```bash
pnpm db:seed
```

### 15.2 Proibidos no GATE 1

- Qualquer conexão autenticada adicional com o Atlas.
- `listDatabases`, `listCollections`, `listIndexes`, `dbStats`, `ping` ou equivalentes no Atlas.
- `createIndex`, `createIndexes`, `ensureIndexes`, `syncIndexes` ou `dropIndexes`.
- `seed-atlas`, `seed`, migrações live ou drop.
- Iniciar a aplicação, rodar testes com banco ou build.
- Alterar `.env`, credenciais, URI, `authSource`, usuários, roles, rede ou TLS.
- Alterar código, scripts, testes, dependências, lockfile, Vercel ou Atlas.
- Instalar Node.js 24 ou trocar o runtime.
- Commit, push, deploy, `git reset`, `git clean` ou `git stash`.

## 16. Critérios de aceite

### 16.1 GATE 1

- Documento de plano criado e addendum registrado no DB-LOCAL-06.
- Nenhuma alteração em código, `.env`, credenciais, Atlas, Vercel, rede ou lockfile.
- Nenhuma conexão Atlas adicional.
- Nenhum database, coleção, índice ou documento criado/alterado.
- Inventário de índices documentado: 33 declarados, 12 impostos.
- Matriz de permissões e riscos documentada.
- `git status` e `git diff --check` registrados sem novos problemas de whitespace.
- Nenhum segredo nos documentos.

### 16.2 GATE 3

- Alvo exatamente `save-state-dev`, confirmado de forma mascarada.
- Usuário com role limitada ao database, sem roles de cluster.
- 33 índices declarados presentes e compatíveis.
- 12 índices impostos presentes.
- Zero índices ausentes ou incompatíveis ao final.
- Nenhum drop, substituição ou sincronização.
- Nenhum seed, documento de produção ou tráfego do app.

### 16.3 GATE 4

- Dados sintéticos, sem PII de produção.
- Seed idempotente: segunda execução não altera contagens indevidamente.
- Nenhum `dropDatabase`, drop de coleção ou reset destrutivo.
- Usuário de seed sem permissão de drop, quando possível.

### 16.4 GATE 5

- Node.js 24 validado ou exceção aprovada.
- `connectDatabase()` e readiness funcionando no database correto.
- Logs sem URI, credenciais ou hostname.
- Fluxos autorizados funcionando sem E2E contra produção.

## 17. Riscos residuais e decisões pendentes

| Risco/decisão | Situação | Mitigação |
|---|---|---|
| Roles e `authSource` reais do usuário atual | Desconhecidos; não inspecionados | Confirmar no painel do Atlas no GATE 2 |
| Cluster/projeto de desenvolvimento | Não decidido | Definir antes do GATE 3 |
| Isolamento de Produção | Não decidido | Preferir cluster/projeto e credencial separados |
| Nome/limpeza do database de Preview | Não decidido | Definir política antes de habilitar Preview |
| Node.js 24 ausente | Confirmado | Instalar com autorização e validar no GATE 5 |
| Auto-provisionamento de índices em dev | Comportamento atual | Aceitar com role adequada ou mudar para read-only em fase futura |
| Guardas dos scripts | Ainda não implementadas | Implementar e testar antes do GATE 3/4 |
| Contagem histórica 30 versus 33 | Divergência documental | Reconfirmar no GATE 3; usar 33 do checkout atual |
| Host impresso pelo B-01 | Risco de exposição | Mascarar antes do provisionamento |
| `MongoClient` direto com `dbName` | Pode mudar `authSource` | Evitar ou fixar `authSource` explicitamente |
| Backups do Atlas | Nível de cluster | Não usar restore de produção em dev sem plano |
| Credencial ampla atual | Risco de atravessar databases | Criar usuário dev dedicado e de menor privilégio |
| Dados reais em dev | Proibido | Usar apenas dados sintéticos |
| Migração sem `dbName` | Pode usar `test` | Não executar; adicionar guarda antes de qualquer uso |

## 18. Garantias de integridade e validação do GATE 1

### 18.1 O que foi feito

- Leitura de código e documentação do projeto.
- Inspeção local dos schemas Mongoose e contagem de índices, sem conexão com banco.
- Inspeção do comportamento de `dbName`/`authSource` no Mongoose e no driver instalados.
- Levantamento do ambiente Linux, versões e gerenciadores de Node.
- Registro de riscos, permissões e gates.
- Criação deste documento e addendum no DB-LOCAL-06.

### 18.2 O que não foi feito

- Nenhuma conexão Atlas.
- Nenhum `ping`, `listDatabases`, `listCollections`, `listIndexes` ou `dbStats` no Atlas.
- Nenhuma criação/acesso/alteração de `save-state-dev`.
- Nenhum índice, coleção, documento, seed ou migração.
- Nenhuma alteração em `.env`, código, credenciais, Atlas, Vercel, rede, TLS, dependências ou lockfile.
- Nenhum processo de probe iniciado ou encerrado.
- Nenhum commit, push ou deploy.

### 18.3 Validação

| Verificação | Resultado esperado |
|---|---|
| `git status --short` | 440 modificados e 34 não rastreados preexistentes; este documento passa a contar como um novo não rastreado e o addendum altera o DB_LOCAL_06, que já era não rastreado |
| `git diff --check` | exit `2` por 75.858 diagnósticos preexistentes; nenhum novo diagnóstico nos documentos |
| `.env` | tamanho `394` e mtime `2026-11-09 16:14:13` inalterados |
| `pnpm-lock.yaml` | tamanho `245026` e mtime `2026-11-09 17:34:50` inalterados |
| Processos do probe | nenhum |
| `mongod` local | processo preexistente em `127.0.0.1:27017`, iniciado às `09:29:12`, não iniciado/encerrado nesta fase; nenhuma conexão estabelecida |
| Sockets Atlas | nenhum aberto por esta fase |
| Segredos nos documentos | nenhum |

### 18.4 Veredito

**DB-LOCAL-07 / GATE 1: CONCLUÍDO — PLANO PRONTO PARA AUTORIZAÇÃO.**

O nome `save-state-dev` está aprovado. A configuração ainda não foi aplicada, o database não foi criado e o provisionamento não foi autorizado. O próximo passo exige autorização explícita do proprietário para o GATE 2.
