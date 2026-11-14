# DB-LOCAL-07 / GATE 3B.1-R — Correção read-only do B-01

**Veredito: CONCLUÍDO (correção e validação locais).**
**Auditoria remota GATE 3B.1: pendente de nova autorização.**
**GATE 3B.2: NÃO AUTORIZADO.**

## Causa raiz

O B-01 anterior passava `autoIndex: false`, mas deixava `autoCreate` no default global do Mongoose 8.24.4 (`true`). A inicialização de Models chama `Model.init()`, que pode executar `createCollection()` antes de inspecionar os índices. Assim, uma auditoria verify-only poderia criar collections ausentes.

Também era necessário garantir que as opções de conexão estivessem configuradas antes da compilação dos Models, porque `Model.init()` começa no momento em que cada Model é compilado.

## Correção aplicada

- Adicionado `scripts/lib/index-audit-options.ts` com `autoCreate: false`, `autoIndex: false` e `autoSearchIndex: false`, junto às opções existentes, aplicadas exclusivamente à conexão do B-01.
- `scripts/verify-indexes.ts` conecta primeiro com essas opções e carrega/compila os nove Models depois de a conexão estar estabelecida.
- Nenhum default global do Mongoose, schema ou modelo foi alterado.
- O caminho autorizado de provisionamento permanece create-only: continua exigindo `--create-missing`, `--yes`, `--db-name` e confirmação nominal `--confirm-db-name`; incompatibilidades bloqueiam antes das criações. A lógica compartilhada continua criando apenas índices declarados ausentes, sem drop/sync.
- O verify-only preserva inspeção de metadados, detecção de índices ausentes/incompatíveis e tratamento de namespace ausente (código MongoDB 26 como lista vazia).

## Precedência e prova de ausência de escrita

Os testes usam uma instância isolada `new mongoose.Mongoose(...)` com defaults globais `autoCreate: true`/`autoIndex: true`. O teste deixa `Model.init()` aguardando a conexão simulada, aplica `false` na configuração da conexão e então libera a inicialização. O Model inicializa sem servidor e sem chamar:

- `createCollection()`;
- `ensureIndexes()`, `createIndexes()` ou `createSearchIndexes()`;
- `syncIndexes()`;
- métodos de coleção para criação/drop de índices;
- `insertOne()`, `updateOne()` ou `deleteOne()`.

Há teste complementar com `autoCreate: true` e `autoIndex: true` no schema para confirmar a precedência schema > conexão > global. Os métodos que esse schema explicitamente habilita são mocks locais; nenhuma escrita real pode ocorrer nesse teste. Outro teste confirma que os defaults globais permanecem `true`, enquanto a conexão configurada permanece `false`.

Os testes exercitam a inicialização real do Model, não apenas o parse de argumentos CLI. A inspeção de índices valida metadados sem chamar o método de criação; namespace ausente é tratado como vazio e continua sem criação.

## Validação

- Testes focados e regressões: **4 arquivos, 36 testes aprovados** (`index-management`, novo teste read-only, inventário de schemas e CLI operacional).
- TypeScript: `pnpm exec tsc --noEmit --pretty false` — aprovado.
- ESLint nos arquivos da tarefa — aprovado.
- `git diff --check` nos arquivos da tarefa — verificado separadamente; whitespace preexistente fora do escopo não foi corrigido.
- Nenhuma dependência foi instalada; lockfile permaneceu intacto.

## Arquivos desta tarefa

- `scripts/lib/index-audit-options.ts` (novo)
- `scripts/verify-indexes.ts`
- `tests/scripts/verify-indexes-readonly.test.ts` (novo)
- `tests/db/index-inventory.test.ts`
- `docs/DB_LOCAL_07_GATE3B1_INDEX_AUDIT.md` (adendo, sem substituir diagnóstico original)
- `docs/DB_LOCAL_07_GATE3B1_READONLY_FIX.md` (este relatório)

O checkout já continha numerosas alterações preexistentes; elas foram preservadas. Nenhum outro arquivo foi intencionalmente alterado nesta tarefa.

## Processo Next.js preexistente

Inspeção passiva de PID, comando e diretório de trabalho: os processos `24526` (pnpm), `24550` (Next CLI) e `24585` (next-server) continuavam ativos no diretório do projeto. O processo e seus sockets Atlas são preexistentes. Não foram lidas variáveis de ambiente, argumentos sensíveis ou memória; não houve requisição HTTP, uso da conexão, reinício ou encerramento. Não se atribui ao processo qualquer operação remota sem evidência.

## Integridade e limites

Os testes foram isolados: a inicialização Mongoose usa conexão sem servidor, e eventuais operações escritas no caso de precedência do schema estão mockadas. Regressões existentes usam exclusivamente o MongoMemoryServer local já disponível. Nenhuma conexão Atlas foi aberta por esta tarefa; não foram executados o script B-01, o aplicativo, seed, migração, provisionamento ou operação de documentos. `.env` não foi alterado e permaneceu com modo `600`; `MONGODB_DB_NAME` permanece configurado como `save-state-dev`. Nenhuma alteração em Atlas, Vercel, credenciais ou roles.

## Próximo passo

A correção local não autoriza a auditoria remota. Solicitar autorização separada para executar o GATE 3B.1 read-only após confirmar as pré-condições; o GATE 3B.2 permanece proibido até nova autorização.

**GATE 3B.1-R: CONCLUÍDO.**
**GATE 3B.1 remoto: PENDENTE.**
**GATE 3B.2: NÃO AUTORIZADO.**

**STATUS FINAL: CONCLUÍDO — Nenhuma tarefa ou processo pendente.**
