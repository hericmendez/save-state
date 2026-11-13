# DB-LOCAL-07 / GATE 3A — Segurança operacional e preparação do provisionamento

**Veredito:** GATE 3A concluído localmente; GATE 3B não iniciado.
**Database-alvo futuro de desenvolvimento:** `save-state-dev`.
**Atlas:** nenhuma conexão foi aberta nesta etapa; nenhum recurso remoto foi alterado.

## 1. Resumo executivo

O `.env` teve somente seu modo corrigido de `755` para `600`. Foram adicionadas validação pura de alvo/argumentos e guardas aos CLIs de verificação de índices, seed Atlas e migração de listas. O verify-only continua sendo o padrão; a conexão B-01 desativa auto-indexação. O seed Atlas agora verifica índices em modo read-only e só começa quando recebe nome explícito, confirmação nominal e autorização operacional.

Testes focados, TypeScript e ESLint passaram. O inventário local confirmou **33 índices declarados em 9 modelos, 12 impostos**. Nada foi provisionado no Atlas; o database continua **não provisionado** com os índices da aplicação.

## 2. Estado inicial e integridade

| Item | Estado observado no início |
|---|---|
| Checkout | `/home/revi/Documentos/Projects/The Save State Project/AGORA_VAI/save-state` |
| Branch / HEAD | `main` / `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |
| Git status | 476 linhas: 440 modificados e 36 não rastreados; alterações preexistentes foram preservadas |
| Node / pnpm | `v24.22.2` / `11.3.0` no Fish |
| `.env` | arquivo comum, 426 bytes, inode preservado, modo `755`, owner/group `revi:revi` |
| `MONGODB_DB_NAME` | uma definição, valor `save-state-dev` |

Os scripts, modelos, serviços e testes já possuíam alterações no working tree antes deste GATE. Foram inspecionados antes da edição; não houve reset, stash, clean, instalação, alteração do lockfile, commit ou push. O conteúdo do `.env` foi comparado por SHA-256 antes/depois da mudança de modo; os hashes coincidiram e nenhum valor de segredo foi impresso.

Ao final, `git status --short` apresentou 479 entradas (440 modificados e 39 não rastreados), incluindo os novos arquivos listados na seção 6. `.env` permanece ignorado e `pnpm-lock.yaml` não aparece como alterado.

## 3. Proteção local do `.env`

O `.env` era arquivo regular, não symlink. Como o modo observado era `755`, foi aplicado somente `chmod 600 .env`.

Validação posterior:

- modo `600`;
- owner/group `revi:revi` preservados;
- tamanho 426 bytes, inode e mtime preservados;
- conteúdo byte a byte idêntico ao estado anterior à mudança de modo;
- uma única definição de `MONGODB_DB_NAME`, ainda `save-state-dev`, com newline final.

Nenhuma outra variável foi exibida ou alterada.

## 4. Evidências Atlas e permissões

### Fatos disponíveis

- Em verificação remota anterior, autorizada separadamente, `save-state-dev` apareceu em `listDatabases`; havia uma coleção `teste`, vazia, com `_id_`.
- A mesma credencial conseguiu listar cinco databases. Isso evidencia visibilidade ampla, mas **não** comprova privilégios globais de escrita nem identifica roles.
- O database legado `save-state` existe e não foi acessado nesta etapa.
- Nenhum usuário, role, IP Access List ou credencial foi inspecionado ou alterado no GATE 3A.
- Nenhuma conexão Atlas foi aberta durante esta execução.

### Checklist manual para o proprietário no Atlas

1. Identificar usuário, authentication database (`authSource`) e roles atribuídos.
2. Confirmar que nenhum usuário de runtime/provisionamento reutiliza credencial de produção.
3. Verificar se roles são escopadas ao database e não ao cluster/projeto.
4. Preferir usuário de runtime separado. Definir permissões de aplicação e de índices conforme o comportamento de `connectDatabase()`; o modo de desenvolvimento da aplicação ainda pode chamar `ensureIndexes()`.
5. Preferir usuário estrutural separado para B-01, com apenas leitura de metadados/índices e `createCollection`/`createIndex` necessários; o preflight de índices unique também precisa ler dados para detectar duplicatas.
6. Não conceder `listDatabases` ou roles globais sem necessidade operacional comprovada.

**Recomendação:** não reutilizar a credencial atual no runtime até revisar suas roles no painel. O sucesso de `listDatabases` não basta para concluir que a credencial seja administradora.

## 5. Guardas implementadas

### `scripts/lib/db-target-guard.ts` e `scripts/lib/operational-cli.ts`

Helpers puros, sem Mongoose, carregamento de ambiente, filesystem de dados ou rede. Validam nomes por `resolveMongoDbName`, exigem confirmação nominal exata e classificam Atlas somente quando o host termina em `mongodb.net`. Não incluem URI, hostname ou IP nos resumos.

Os fluxos futuros de Preview/Production não foram bloqueados globalmente: B-01 e migração aceitam opt-ins explícitos `--allow-preview` ou `--allow-production`, além do nome e da confirmação do database. No contexto comum de desenvolvimento, escrita Atlas fica restrita a `save-state-dev`. O seed é deliberadamente dev-only.

### `scripts/verify-indexes.ts` — B-01

- verify-only permanece default;
- `--create-missing` continua exigindo `--yes`;
- criação exige também `--db-name` explícito e `--confirm-db-name` idêntico;
- destino Atlas de desenvolvimento diferente de `save-state-dev` é recusado;
- alvo e argumentos são validados antes de conectar;
- log mostra apenas classificação do alvo e database, sem host/URI;
- `autoIndex: false` impede criação implícita pelo Mongoose no modo de verificação;
- comparação, detecção de incompatibilidade, preflight de duplicatas unique, pós-verificação e create-only foram preservados;
- conflitos unique reportam modelo/campos e quantidade de grupos, sem imprimir valores dos documentos;
- não há `drop`, `syncIndexes` ou substituição de índices.

Exemplo futuro, **não executado neste GATE**:

```bash
pnpm db:indexes -- --db-name save-state-dev
```

A criação futura exigirá, além de autorização própria para GATE 3B:

```bash
pnpm db:indexes -- --db-name save-state-dev --confirm-db-name save-state-dev --create-missing --yes
```

### `scripts/seed-atlas.ts` e `server/seeds/atlas-seed.ts`

- seed exige `--db-name`, confirmação nominal e `--allow-atlas-seed`;
- exige destino Atlas e, no fluxo de desenvolvimento, somente `save-state-dev`;
- recusa ambiente Preview/Production e conflito entre CLI e `MONGODB_DB_NAME`;
- carrega `.env` somente dentro de execução direta, após o entrypoint ser chamado;
- importar o CLI não inicia seed nem conexão;
- `runAtlasSeed()` usa `connectDatabase({ readOnlyIndexes: true })`, evitando que seed crie índices incidentalmente;
- os dados sintéticos e a lógica de seed foram preservados;
- mensagens de erro/provider e falhas por título não imprimem detalhes de infraestrutura.

### `scripts/migrate-lists-to-collections.ts`

- dry-run continua sendo o modo default e é somente leitura;
- todos os modos exigem database explícito (CLI ou `MONGODB_DB_NAME`); `test` é recusado;
- live exige `--db-name`, confirmação nominal e `--backup-dir`;
- drop exige confirmação nominal, contagem esperada e flag adicional `--allow-drop-legacy`;
- operações persistentes exigem opt-in separado para Preview/Production;
- a conexão passa `dbName` explicitamente e `autoIndex: false`;
- importação do CLI não conecta nem migra;
- lógica de migração, backup e verificação existente não foi modificada.

## 6. Arquivos tocados

- `scripts/lib/db-target-guard.ts` — novo.
- `scripts/lib/operational-cli.ts` — novo.
- `scripts/verify-indexes.ts` — guardas, logs sanitizados, auto-index desativado e execução direta explícita.
- `scripts/seed-atlas.ts` — guardas, carregamento de env apenas em execução direta e proteção contra import acidental.
- `server/seeds/atlas-seed.ts` — validação read-only de índices na conexão do seed.
- `scripts/migrate-lists-to-collections.ts` — alvo explícito, confirmação e conexão sem auto-index.
- `tests/scripts/operational-cli.test.ts` — testes isolados de parsing, guardas e importação segura.
- `tests/db/index-inventory.test.ts` — regressão do inventário dos schemas.
- `docs/DB_LOCAL_07_GATE3A_PREPROVISION_SECURITY.md` — este relatório.

## 7. Testes e validações

| Verificação | Resultado |
|---|---|
| `pnpm exec vitest run tests/scripts/operational-cli.test.ts tests/db/mongo-config.test.ts tests/db/index-inventory.test.ts --maxWorkers=1` | exit 0; 3 arquivos, 28 testes passaram |
| `pnpm exec tsc --noEmit --pretty false` | exit 0 |
| ESLint nos arquivos tocados | exit 0; sem erros ou warnings reportados |
| Import de seed/migration/B-01 nos testes | sem conexão, seed, migração, carregamento de `.env` ou provisionamento |
| Conexão Atlas nesta fase | nenhuma |
| Escrita/criação remota | nenhuma |
| Dependências/lockfile | inalterados |

Vitest emitiu o aviso conhecido da configuração do Vite (`configLoader: native`); os testes concluíram com sucesso.

`git diff --check` terminou com exit 2 e 75.838 linhas de diagnóstico no diff amplo (principalmente CRLF já usado pelos arquivos modificados). Com `core.whitespace=cr-at-eol`, o diff amplo ainda reporta 150 diagnósticos em outros arquivos preexistentes; os arquivos rastreados tocados passam essa verificação isolada e nenhum arquivo tocado contém espaços/tabs finais. Os arquivos novos também foram checados diretamente. Nenhum diagnóstico preexistente foi corrigido fora do escopo.

## 8. Inventário local dos índices

Inspeção feita lendo `schema.indexes()` dos modelos; sem conexão MongoDB.

| Modelo | Declarados | Impostos |
|---|---:|---:|
| User | 1 | 1 |
| GlobalGame | 4 | 4 |
| UserGame | 7 | 1 |
| GameReview | 3 | 1 |
| GameCollection | 3 | 1 |
| PasswordResetToken | 3 | 2 |
| EmailVerificationToken | 3 | 2 |
| Activity | 5 | 0 |
| UserGameNote | 4 | 0 |
| **Total** | **33** | **12** |

Tipos/opções relevantes: 10 índices `unique`, 2 `sparse`, 1 `partialFilterExpression` e 2 TTL (`expireAfterSeconds: 0`). Os 12 impostos são os índices com `unique`, `sparse`, filtro parcial ou TTL. Os totais são protegidos por `tests/db/index-inventory.test.ts`.

## 9. Procedimento futuro read-only

Somente após autorização própria para consulta remota:

1. Confirmar que a credencial apropriada e `MONGODB_DB_NAME` apontam a `save-state-dev`; não usar fallback.
2. Usar `pnpm db:indexes -- --db-name save-state-dev` (sem `--create-missing`/`--yes`).
3. Confirmar que o script informa somente `target: atlas; database: save-state-dev`, sem host/URI.
4. O script usa `autoIndex: false` e apenas lista índices por coleção/modelo; não chama `connectDatabase()`.
5. Registrar índices presentes, ausentes e incompatíveis. Incompatibilidade bloqueia qualquer provisionamento; não tentar reparo automático.
6. A falta de índices fará verify-only terminar com status de erro após informar os ausentes; isso é esperado antes do provisionamento.
7. Confirmar ausência de writes, seeds ou migrações.

Esse procedimento foi preparado, mas **não executado contra o Atlas no GATE 3A**.

## 10. Riscos residuais e dependências do GATE 3B

- Roles e usuário atual continuam desconhecidos; a credencial listou databases anteriormente. Revisão manual no Atlas é necessária.
- A coleção remota `teste` permanece intacta; nenhum índice da aplicação foi provisionado.
- A aplicação ainda pode executar `ensureIndexes()` via `connectDatabase()` em desenvolvimento. Não iniciar a aplicação contra Atlas antes de confirmar destino e planejar readiness; B-01 não depende dessa conexão.
- Outros utilitários operacionais fora do escopo nominal desta etapa, como backfill/seed local, não foram modificados. Revisar seus destinos antes de qualquer uso remoto.
- Antes do GATE 3B, confirmar credencial/roles, autorização específica, inventário read-only, ausência de incompatibilidades e alvo exato `save-state-dev`.
- GATE 3B deve continuar create-only e separado de seed/migração; não executar seed ou app como parte do provisionamento.

## 11. Garantias e encerramento

- Nenhuma conexão Atlas foi aberta nesta etapa.
- Nenhum database, coleção, índice, usuário, role ou IP Access List foi criado/alterado.
- Nenhum documento foi lido/escrito; nenhum seed ou migração foi executado.
- O `mongod` local preexistente em `127.0.0.1:27017` permaneceu intacto; não foi iniciado, encerrado ou acessado. Nenhum socket `27017` foi aberto por esta etapa.
- Nenhum processo preexistente foi encerrado.
- Não houve alteração de dependências, lockfile, Git history, deploy ou Vercel.
- `.env` foi protegido sem alteração de conteúdo.

**Próxima autorização necessária:** GATE 3B, incluindo autorização explícita para a verificação read-only remota de índices e, separadamente, qualquer criação de índices. Revisão manual de roles Atlas permanece pendente.

**STATUS FINAL: GATE 3A CONCLUÍDO — nenhuma tarefa ou processo pendente; GATE 3B não iniciado.**
