# DB-LOCAL-07 / GATE 3B.2-A — Plano de pré-provisionamento

**Escopo desta etapa:** inspeção local, revisão de concorrência/permissões e planejamento.
**Conexão Atlas desta etapa:** nenhuma.
**Provisionamento:** não autorizado nem executado.
**GATE 3B.2-B:** NÃO AUTORIZADO.

## 1. Resumo executivo

O B-01 tem guardas explícitas e um caminho create-only para índices ausentes. Porém, o provisionamento ainda **não está pronto para execução**:

1. O Next.js preexistente (PIDs `24526`, `24550`, `24585`) continua ativo e tem sockets Atlas estabelecidos.
2. O caminho normal da aplicação em desenvolvimento executa `Model.ensureIndexes()` para todos os Models. A conexão da aplicação não desativa `autoCreate`/`autoIndex`; portanto, o processo ativo pode criar collections/índices fora do B-01. Não há evidência local de que tenha efetivamente feito isso.
3. O duplicate preflight do B-01 executa aggregation sem `maxTimeMS` e recebe até cinco chaves agrupadas contendo `userId`/`name` no processo, embora não as imprima. O driver tem `retryReads: true` por padrão e a conexão do B-01 não o desativa.
4. O comando B-01 é sequencial e não atômico. Uma falha pode deixar alguns índices já criados; o timeout de socket não é um limite de tempo garantido para o trabalho no servidor.
5. O escopo das roles da credencial não foi auditado e não pode ser inferido das consultas históricas.

O estado de `gamecollections`, a quantidade de documentos e a ausência de duplicatas precisam ser revalidados imediatamente antes de qualquer escrita. O resultado de existência do GATE 3B.1-D é histórico, não uma confirmação do estado atual.

## 2. Evidências disponíveis e ambiente local

### Histórico remoto (não reconsultado neste gate)

- GATE 3B.1-R2: referência local de 33 índices; 30 reportados presentes/compatíveis, 3 ausentes em `GameCollection`, nenhuma incompatibilidade reportada.
- GATE 3B.1-D: `gamecollections` não existia no instante da consulta filtrada anterior. Isso não prova o estado atual.
- Consultas históricas autenticaram e executaram metadados; nenhuma evidência disponível prova que a credencial seja restrita a `save-state-dev`.

### Inspeção local

| Item | Observação |
|---|---|
| Branch / HEAD | `main` / `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |
| Node / pnpm | `v24.22.2` / `11.3.0` |
| Mongoose / driver | `8.24.4` / `6.20.0` |
| `.env` | modo `600`; uma definição de `MONGODB_DB_NAME`, correspondente a `save-state-dev` |
| Shell atual | `MONGODB_DB_NAME` não exportado; o script operacional carrega `.env` |
| Arquivos dotenv | `.env` e `.env.example` presentes; `.env.local`, variantes development/production/test e diretório `.vercel` ausentes |
| Lockfile | sem alteração no status do Git |
| Working tree | 482 entradas antes deste documento e 483 após adicioná-lo; checkout amplamente modificado antes deste plano; `package.json` já aparecia modificado |

Não foram carregados módulos de aplicação nem executada a aplicação. Nenhuma URI ou credencial foi impressa. O `.env` não foi alterado.

`git diff --check` foi executado e retornou exit code 2 por whitespace/CRLF em arquivos já modificados no working tree amplo (por exemplo, `.gitignore`). Esses arquivos não foram corrigidos. O documento deste plano foi verificado separadamente e não tem whitespace final. O lockfile permaneceu sem alteração.

## 3. Índices pendentes

Schema em `db/models/game-collection.ts`:

1. `{ userId: 1 }` — desempenho.
2. `{ name: 1 }` — desempenho.
3. `{ userId: 1, name: 1 }`, `unique: true` — integridade por usuário.

O terceiro índice não declara `sparse`, filtro parcial ou collation. As regras `required`/`trim` do Mongoose não comprovam conformidade de documentos legados. A collation padrão da collection, caso exista, afeta a semântica de unicidade e deve ser confirmada no preflight remoto autorizado.

Os números 30/33 e a ausência histórica da collection não devem ser tratados como inventário atual: o Next ativo pode ter executado o ensure de índices desde aquelas consultas.

## 4. Permissões Atlas — checklist manual do proprietário

Consultar **Security → Database Access** no painel Atlas, sem compartilhar username, senha ou URI no relatório:

- Identificar privadamente qual principal corresponde à credencial local de desenvolvimento.
- Conferir database de autenticação (`authSource`) e todas as roles diretas/herdadas e seus recursos.
- Confirmar se há privilégios globais ou escopo além de `save-state-dev`.
- Confirmar se a credencial é reutilizada por Preview, produção ou outros serviços.
- Confirmar que a permissão de escrita futura, se aprovada, se limita ao database de desenvolvimento.

Historicamente, `listDatabases` foi aceito. Isso não comprova privilégios de escrita globais nem isolamento por database; não foi usado para inferir o escopo das roles.

### Privilégios que o proprietário deverá confirmar para a futura operação

Least privilege a validar no painel/na documentação Atlas para a versão em uso:

- `listCollections` no database para verificar existência e opções da collection.
- `listIndexes` em `gamecollections` para preflight/pós-verificação.
- `find` em `gamecollections` para a aggregation de duplicatas unique.
- `createIndex` no namespace/database autorizado para construir índices.
- `createCollection` no database se `gamecollections` continuar ausente e o `createIndexes` implícito precisar materializar a collection.

Não são necessários `listDatabases`, leitura de outros databases, privilégio administrativo de cluster ou acesso a Vercel. Roles built-in amplas podem incluir CRUD e outras ações; preferir credencial exclusiva de provisionamento e role customizada restrita ao database, se aprovada. Não alterar usuário/role neste gate. Se o escopo atual for amplo ou incerto, substituir/restringir a credencial por processo autorizado antes de B-02.

## 5. Concorrência e criação automática pela aplicação

### Processos observados passivamente

Na inspeção desta etapa:

- PID `24526`: `pnpm dev`.
- PID `24550`: `next dev`.
- PID `24585`: `next-server`.
- Todos continuam no diretório do checkout; sockets MongoDB estabelecidos foram associados ao PID `24585`.

Não foram lidas variáveis de ambiente, memória ou credenciais; não houve requisição HTTP. Sockets estabelecidos não comprovam que uma escrita esteja ocorrendo e não permitem atribuir comandos. Nenhum processo foi encerrado.

### Fato relevante no caminho de runtime

`db/connection.ts` conecta usando `MONGOOSE_CONNECTION_OPTIONS`, que contém timeouts/pool mas não define `autoIndex: false` nem `autoCreate: false`. Mongoose 8.24.4 tem defaults globais `autoIndex: true` e `autoCreate: true`. Além disso, no caminho normal não production e sem `readOnlyIndexes`, `connectDatabase()` chama explicitamente `ensureIndexes()` para todos os Models (`db/connection.ts`, linhas 67–88). Portanto, a aplicação em desenvolvimento tem um caminho real para criar índices e, por inicialização de Models, collections. Os flags read-only do B-01 são por conexão e **não** desativam esse caminho da aplicação.

O processo Next atual está conectado ao Atlas, mas não há evidência suficiente para afirmar que `connectDatabase()` ou `ensureIndexes()` já rodaram. Não se atribui qualquer criação passada ao Next. A presença do processo é, ainda assim, um bloqueador operacional para uma janela sem concorrência.

### Dependência para o futuro

Antes de B-02, o proprietário deve parar manualmente o Save State local e confirmar que os três PIDs saíram e que não restam sockets MongoDB desse processo. O agente não deve encerrá-los. Confirmar também ausência de outros processos próprios que escrevam, seeds, migrações, scripts de índices e acessos concorrentes conhecidos. A parada local não prova ausência global de atividade Atlas.

## 6. Revisão do B-01

### Guardas confirmadas

- `verify-indexes.ts` resolve e valida o target antes de conectar.
- Verify-only é o default; parser exige `--create-missing` e `--yes` juntos para provisionar.
- Para writes, exige `--db-name` explícito e `--confirm-db-name` nominal idêntico; os argumentos de produção/Preview não estão no comando planejado.
- `assertSafeWriteTarget()` classifica o URI. Para Atlas em desenvolvimento restringe writes a `save-state-dev`; target `other`, database default/test e nomes proibidos são recusados.
- Opções do B-01 são por conexão: `autoCreate: false`, `autoIndex: false`, `autoSearchIndex: false`; Models são importados após a conexão.
- A inspeção compara índices declarados, trata namespace code 26 como vazio, reporta missing/incompatible, e o ramo verify-only não chama provisionamento.
- Provisionamento compartilhado faz preflight de incompatibilidades e chama `createIndex()` somente para índices ausentes. Não há `dropIndex`, `dropCollection` ou `syncIndexes` no fluxo de B-01.
- Para GameCollection, o ramo create-only testa duplicatas do índice unique antes das primeiras criações. Se a collection não existir, `listIndexes` code 26 é tratado como lista vazia e o duplicate scan é pulado; a primeira criação de índice pode materializar a collection implicitamente.
- Conexão é encerrada em `finally` após o connect; erros finais omitem detalhes/URI.

### Riscos/bloqueadores encontrados

1. **Runtime dev concorrente:** `connectDatabase()` executa `ensureIndexes()` e não fixa os auto-builders em false. Parar a aplicação e refazer verify-only é obrigatório antes de B-02.
2. **Sem deadline de operação no B-01:** `findDuplicateValues()` chama `aggregate(...).toArray()` sem `maxTimeMS`; `createIndex()` também não recebe deadline. O `socketTimeoutMS` de 45 s e `serverSelectionTimeoutMS` de 10 s não são um prazo total confiável para uma operação de servidor. Um `timeout` externo encerra o cliente, mas não prova cancelamento imediato de um index build no Atlas.
3. **Retry de leitura do driver:** Mongoose não sobrescreve `retryReads`; MongoDB Driver 6.20.0 define default `retryReads: true`. A aggregation elegível pode sofrer retry automático mesmo com uma única invocação CLI.
4. **Dados de duplicidade em memória:** a aggregation agrupa por `userId`/`name`, retorna até cinco grupos com valores em `_id` ao processo. O B-01 não os imprime/persiste e só reporta o número de grupos retornados, mas esses valores existem transitoriamente em memória. Não é uma contagem total de todos os grupos duplicados.
5. **Sem atomicidade/rollback:** `provisionMissingIndexes()` cria índices sequencialmente. Para schema order de GameCollection, os índices simples podem ser criados antes de a criação unique falhar. Duplicatas concorrentes podem surgir depois do scan e antes do `createIndex`; uma falha pode deixar estado parcial.
6. **Additional indexes:** B-01 verifica os índices declarados, mas não classifica índices adicionais como parte de seu resultado normal.

Não corrigir esses pontos neste gate. Antes de B-02, solicitar autorização separada para hardening local do timeout/retry/sanitização ou obter decisão explícita do proprietário aceitando os riscos operacionais residuais. A aprovação deste plano, por si só, não os aceita.

## 7. Comando futuro e sequência de execução proposta

Comando planejado, **não executado e não autorizado neste gate**:

```bash
pnpm db:indexes -- --db-name save-state-dev --confirm-db-name save-state-dev --create-missing --yes
```

Sequência somente após nova autorização:

1. **Janela de manutenção:** proprietário para manualmente Next; confirmar PIDs `24526`, `24550`, `24585` inativos, nenhum socket MongoDB local relacionado e nenhum job próprio concorrente.
2. **Role:** proprietário conclui checklist no Atlas. Usuário de provisionamento e privilégios devem estar restritos ao database autorizado; sem role/usuário global amplo não revisado.
3. **Preflight local:** Node/pnpm corretos; `.env` protegido; database name efetivo exatamente `save-state-dev`; URI Atlas/TLS segura e sem path conflitante; contexto local não-production; nenhum arquivo/runtime concorrente sobrepondo target.
4. **Reinventário read-only:** executar B-01 verify-only uma vez, com processo concorrente parado. Registrar coleção/índices ausentes/incompatíveis. Se incompatível, abortar. Não presumir que os 3 índices continuam ausentes.
5. **Unique preflight imediatamente antes dos writes:** usar o duplicate check integrado ao caminho create-only apenas depois de resolver os riscos/deadlines acima. Qualquer duplicata, timeout ou resultado incompleto bloqueia. A verificação e criação não são atômicas; manutenção reduz, mas não elimina, escritores remotos externos.
6. **Confirmação humana:** validar em voz alta database e flags; exigir autorização GATE 3B.2-B específica, além deste plano.
7. **Provisionamento único:** executar o comando planejado uma vez, sem `--allow-production`, `--allow-preview`, seed ou migration flags. Não fazer retry automático/manual após erro.
8. **Pós-verificação:** após o comando terminar e a conexão encerrar, executar verify-only separado sob autorização, confirmando os 33 índices presentes/compatíveis. Registrar eventual namespace criado, status dos três índices e erros sanitizados.
9. **Aplicação:** somente após verificação e decisão do proprietário, reabrir o Next. O runtime de desenvolvimento mantém `ensureIndexes()` explícito; não usar sua inicialização como substituto do pós-check.

O plano não recomenda um `timeout` externo como única garantia. O requisito de tempo finito precisa ser satisfeito pelo código/operações (incluindo duplicate aggregation e criação) ou explicitamente aceito pelo proprietário antes de B-02.

## 8. Critérios de aborto

Abortar sem conectar/escrever, ou interromper sem retry, se:

- Next ou outro escritor próprio continuar ativo;
- target/resolução/env/URI/TLS não puder ser confirmada exatamente;
- role for global, compartilhada ou de escopo desconhecido;
- fresh verify-only achar incompatibilidade ou target diferente;
- duplicate scan encontrar qualquer grupo duplicado;
- deadline for excedido, falhar a conexão, houver timeout/auth error ou resultado sanitizado não puder ser confirmado;
- código B-01/versão diferir do que foi revisado;
- alguém adicionar `syncIndexes`, drop, seed, migration ou qualquer write não allowlisted.

## 9. Falha parcial e recuperação

- Não repetir o comando de provisionamento após falha, timeout ou desconexão.
- Manter a janela de manutenção e não reiniciar o aplicativo.
- Registrar fase/código seguro; não copiar stack, URI, host, documentos ou valores de `userId`/`name`.
- Confirmar manualmente no Atlas se um index build ainda está em andamento antes de nova sessão. Não assumir que fechar o cliente cancelou o build do servidor.
- Depois de estado estável, solicitar autorização específica para verify-only e identificar quais índices foram criados. Não remover índices e não executar `syncIndexes`.
- Se o unique falhar por duplicatas, não alterar/excluir documentos. Registrar somente contagens sanitizadas e solicitar decisão separada para resolução dos dados.
- Uma segunda tentativa create-only exige novo preflight, confirmação do estado parcial e nova autorização; a operação não é transacional nem tem rollback automático.

## 10. Riscos residuais e autorizações necessárias

Antes de autorizar GATE 3B.2-B, o proprietário precisa:

1. Confirmar/restringir manualmente a credencial e suas roles.
2. Parar manualmente o Next ativo e assegurar janela sem writers conhecidos.
3. Autorizar hardening local do B-01 (deadline de aggregation/índice, política de retries e minimização dos valores de duplicidade em memória) ou aceitar expressamente os riscos descritos.
4. Autorizar um fresh verify-only após a janela e, em separado, a invocação create-only.
5. Aceitar que a pré-verificação de duplicatas não elimina corrida com escritores externos.

Este GATE 3B.2-A não concede qualquer autorização remota ou de escrita. Não foram executados MongoClient/Mongoose, app, seed, migration ou B-01 nesta etapa.

**GATE 3B.2-A: CONCLUÍDO — plano preparado; provisionamento ainda bloqueado pelas dependências acima.**
**GATE 3B.2-B: NÃO AUTORIZADO.**
