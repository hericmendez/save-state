# POST-KUBUNTU-01 — Reconhecimento, auditoria e retomada segura

**Etapa:** DB-LOCAL-07 / POST-KUBUNTU-01
**Data:** 14/11/2026
**Natureza:** auditoria local somente diagnóstica
**Conexão Atlas:** nenhuma
**Escrita remota:** nenhuma
**Alteração de código/configuração:** nenhuma (exceto este documento)

> Este documento registra apenas fatos observáveis no checkout atual e separa explicitamente
> fato, inferência e recomendação. Nenhum segredo, URI completa, senha, token ou mensagem bruta
> de autenticação é reproduzido aqui.

---

## 0. Contexto do projeto

Save State é uma aplicação de gerenciamento de biblioteca, catálogo, backlog, coleções e
avaliações de videogames. O checkout auditado é o monólito modular Next.js (App Router) que
consolida frontend e API do Save State. O ATP Engine permanece um serviço independente e não
foi tocado nesta auditoria.

O histórico relevante deste handoff é o ciclo DB-LOCAL-07: preparação de um database de
desenvolvimento isolado no MongoDB Atlas (`save-state-dev`), endurecimento de scripts
operacionais, auditoria de índices e o incidente de autenticação da credencial dedicada
`MONGODB_DEV_URI`.

---

## A. Identificação do ambiente

| Item | Valor observado |
|---|---|
| Distribuição | Ubuntu 26.04.1 LTS (base do Kubuntu), codename `resolute` |
| Kernel | `7.0.0-43-generic` |
| Shell | `/usr/bin/fish` |
| Usuário Linux | `heric` |
| Diretório auditado | `/home/heric/Documents/Projects/The Save State Project/AGORA_VAI/save-state` |
| Gerenciador de Node | `fnm` (`/home/heric/.local/share/fnm/fnm`) |
| Node.js | `v24.22.3` (via fnm) |
| npm | `11.19.1` |
| pnpm | `11.3.0` |
| Git | `2.53.0` |
| Docker | `29.9.3` instalado; daemon **inacessível** ao usuário (`permission denied` no socket) |
| Docker Compose | `v5.7.1` |
| mongosh | `2.14.2` |
| MongoDB nativo | `mongodb-org 9.0.8`, serviço `mongod` **ativo** em `127.0.0.1:27017` |
| MongoDB Compass | **não instalado** (não encontrado em PATH, flatpak ou snap) |
| OpenCode | presente em `/home/heric/.opencode/bin/opencode` |

Observações:

- **Fato:** o runtime Node (`v24.22.3`) atende à declaração `engines.node: 24.x` e ao `.nvmrc` (`24`).
- **Fato:** o usuário `heric` não pertence ao grupo `docker`; por isso `docker ps` falhou. O
  Docker está instalado, mas o acesso ao daemon não foi validado nesta auditoria.
- **Fato:** existe um MongoDB local nativo rodando. Ele é independente do Atlas e não foi
  acessado, reiniciado ou modificado.
- **Inferência:** o ambiente mudou em relação ao Garuda (shell Fish mantido, Node via fnm,
  MongoDB local nativo em vez de contêiner). Não há evidência de que o MongoDB local seja usado
  pela aplicação.

---

## B. Git e repositório

| Item | Resultado |
|---|---|
| Raiz Git | `/home/heric/Documents/Projects/The Save State Project/AGORA_VAI/save-state` |
| Branch | `main` |
| HEAD | `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |
| HEAD (assunto) | `feat(reviews): complete markdown editor integration and UI refinement` (2026-11-09) |
| `origin` | `git@github.com:hericmendez/save-state.git` |
| `origin/main` vs `HEAD` | `0` ahead / `0` behind |
| Entradas em `git status --short` | **485** (440 `M` + 45 `??`) |
| Staged | **0** |
| Unstaged | 440 entradas marcadas como modificadas |
| Arquivos com diff de conteúdo (`git diff --name-only`) | **382** |
| Lockfile | `pnpm-lock.yaml` **sem alteração** no status |
| `git diff --check` | exit code **2** (whitespace/CRLF preexistentes) |

### Divergências e observações

- **Fato:** o HEAD coincide exatamente com o hash histórico informado no handoff.
- **Fato:** o diretório mudou em relação ao Windows/Garuda; o repositório está aberto em sua
  própria raiz, conforme a decisão de que Save State é um repositório independente.
- **Fato:** `package.json` tem alteração não commitada em `engines.node` (`>=22` → `24.x`).
- **Fato:** `.nvmrc` tem 4 bytes (`24\r\n`), ou seja, terminador CRLF; isso aparece como
  modificação não commitada.
- **Fato:** 440 entradas `M` no status contra 382 nomes em `git diff --name-only`. A diferença
  **não foi reconciliada** nesta auditoria; nada foi normalizado ou limpo.
- **Fato:** 17 dos 18 documentos em `docs/` estão untracked, incluindo todos os relatórios
  `DB_LOCAL_07_*`, `AUTH_01C`, `VERCEL_PRODUCTION_READINESS` e o diagnóstico Atlas.
- **Preservação:** nenhuma operação `reset --hard`, `clean`, `stash`, checkout destrutivo,
  rebase, merge, commit ou push foi executada.

---

## C. Configuração local (sem exibir valores)

| Verificação | Resultado |
|---|---|
| `.env` | existe, modo **600**, tamanho 529 bytes |
| `.env.example` | existe (modelo parcial) |
| `MONGODB_URI` | presente |
| `MONGODB_DEV_URI` | presente |
| `MONGODB_DB_NAME` | presente e igual a **`save-state-dev`** |
| `JWT_SECRET` | presente |
| `APP_URL` | presente |
| `SEARCH_METHOD` | `IGDB` |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | presentes |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ATP_BASE_URL`, `READINESS_PROBE_TOKEN` | ausentes |
| `MOCK_EMAIL`, `MOCK_PASSWORD` | ausentes (seed Atlas não pode rodar assim) |
| Overrides relevantes no shell | nenhum exportado |
| Identidade da `MONGODB_DEV_URI` (mascarada) | usuário `hericmendez00_db_dev`, scheme `mongodb+srv`, sem database path, sem opções de query |
| Identidade da `MONGODB_URI` (mascarada) | usuário `hericmendez00_db_user`, mesmo cluster/host `cluster0.*.mongodb.net`, sem database path, sem opções de query |

### Riscos de configuração

- **Fato:** o fallback `DEFAULT_DEVELOPMENT_DB_NAME = "save-state"` ainda existe em
  `db/mongo-config.ts` para contextos fora da Vercel quando `MONGODB_DB_NAME` está ausente.
- **Fato:** no `.env` atual `MONGODB_DB_NAME=save-state-dev`, portanto o alvo efetivo é o
  database de desenvolvimento correto.
- **Recomendação:** manter a exigência explícita de `MONGODB_DB_NAME` em qualquer execução
  operacional; não depender do fallback.
- **Fato:** a identidade da credencial principal da aplicação (`MONGODB_URI`) é diferente da
  credencial dedicada de desenvolvimento. O escopo real das roles de ambas **não** pode ser
  comprovado localmente e não foi consultado.

Nenhum valor sensível foi impresso, copiado ou persistido.

---

## D. Arquitetura encontrada

### Stack efetiva instalada

| Componente | Versão instalada |
|---|---|
| Next.js | `15.5.29` |
| React | `19.3.0` |
| Mongoose | `8.24.4` |
| Zod | `4.6.2` |
| Vitest | `4.1.11` |
| TypeScript | `^5.8` (devDependency) |
| Node | `24.x` |
| pnpm | `11.3.0` |

### Persistência e seleção de database

- `db/connection.ts` implementa conexão Mongoose cacheada globalmente (promise em voo,
  sobrevivência a hot reload, proteção contra reuso com URI/database diferentes).
- `db/mongo-config.ts` resolve o database explicitamente; em Vercel exige `MONGODB_DB_NAME` e
  recusa fallback compartilhado.
- A conexão do runtime **não** define `autoCreate: false` nem `autoIndex: false`.
- Em desenvolvimento (não-production e sem `readOnlyIndexes`), `connectDatabase()` executa
  `Model.ensureIndexes()` para todos os modelos; em produção ou `readOnlyIndexes`, apenas
  `verifyEnforcedModelIndexes()` (read-only, fail-closed).
- **Inferência fundamentada:** iniciar Next.js em desenvolvimento pode criar índices e, por
  inicialização de Models, coleções. Por isso a aplicação não foi iniciada.

### Modelos e índices

- **9 modelos:** `User`, `GlobalGame`, `UserGame`, `GameReview`, `GameCollection`,
  `PasswordResetToken`, `EmailVerificationToken`, `Activity`, `UserGameNote`.
- **33 índices declarados**, dos quais **12** são impostos (`unique`, `sparse`, `partial`,
  TTL), conforme `tests/db/index-inventory.test.ts`.
- `GameCollection` declara exatamente os três índices históricos:
  1. `{ userId: 1 }` (desempenho)
  2. `{ name: 1 }` (desempenho)
  3. `{ userId: 1, name: 1 }` `unique: true`

### Scripts operacionais

| Script | Comportamento |
|---|---|
| `scripts/verify-indexes.ts` | Verify-only por padrão. Escrita só com `--create-missing --yes`, `--db-name` explícito e `--confirm-db-name` idêntico. Usa `autoCreate/autoIndex/autoSearchIndex: false` via `scripts/lib/index-audit-options.ts`. Não remove/sincroniza índices. |
| `scripts/seed-atlas.ts` | Exige target Atlas, `save-state-dev`, `--allow-atlas-seed`, confirmação explícita e `MOCK_EMAIL`/`MOCK_PASSWORD`. Idempotente, sem drop. |
| `scripts/migrate-lists-to-collections.ts` | Dry-run por padrão; live exige backup/confirmações; drop exige flags adicionais. Não executado. |
| `scripts/lib/operational-cli.ts` | Parser puro, testável sem banco. |
| `scripts/lib/db-target-guard.ts` | Classifica alvo, recusa `save-state`/`test` em desenvolvimento e restringe escrita Atlas de desenvolvimento a `save-state-dev`. |

---

## E. Documentação localizada

Foram encontrados **18 documentos** em `docs/`:

- `AUTH_01C_PREDEPLOY_AUDIT.md`
- `DB_LOCAL_02_ATLAS_CONNECTION.md`
- `DB_LOCAL_03_TLS_DIAGNOSIS.md`
- `DB_LOCAL_04_NETWORK_COMPARISON.md`
- `DB_LOCAL_05_LINUX_TLS_COMPARISON.md`
- `DB_LOCAL_06_ATLAS_AUTH_PROBE.md`
- `DB_LOCAL_07_ATLAS_AUTH_INCIDENT.md`
- `DB_LOCAL_07_DEV_DATABASE_PLAN.md`
- `DB_LOCAL_07_GATE2_LINUX_CONFIGURATION.md`
- `DB_LOCAL_07_GATE3A_PREPROVISION_SECURITY.md`
- `DB_LOCAL_07_GATE3B1C_GAMECOLLECTION_PREFLIGHT.md`
- `DB_LOCAL_07_GATE3B1_INDEX_AUDIT.md`
- `DB_LOCAL_07_GATE3B1_READONLY_FIX.md`
- `DB_LOCAL_07_GATE3B2A_PROVISIONING_PLAN.md`
- `DB_LOCAL_07_GATE3B2_AUTH_VALIDATION.md`
- `DB_LOCAL_CONNECTION_DIAGNOSIS.md`
- `RPGUI_LOADING_SCREEN_IMPLEMENTATION.md`
- `VERCEL_PRODUCTION_READINESS.md`

Estado:

- **Nenhum relatório histórico está ausente** em relação à lista pedida no handoff.
- **17 estão untracked**; apenas `RPGUI_LOADING_SCREEN_IMPLEMENTATION.md` está rastreado.
- **Fato:** não há `README` na raiz.
- **Fato:** os documentos históricos não foram alterados.

### Estado mais recente documentado

1. `GATE 3B.1-R` (correção read-only do B-01): **CONCLUÍDO** localmente.
2. `GATE 3B.1` remoto: **PENDENTE** de autorização.
3. `GATE 3B.2-AUTH-R3`: **FALHOU** com `MONGO_8000`.
4. `GATE 3B.2-B`: **NÃO AUTORIZADO**.
5. `VERCEL_PRODUCTION_READINESS`: histórico **NO-GO**, com bloqueador focado no provisionamento
   de índices em banco vazio. A correção read-only posterior toca esse caminho, mas **não há
   evidência de revalidação end-to-end em banco vazio** neste checkout.

---

## F. MongoDB Atlas — situação real

### Comprovado (histórico documentado)

- Houve falhas TLS no Windows, sem causa raiz estabelecida.
- No Linux (Garuda), a credencial original estabeleceu conexão autenticada e executou ping.
- O database de desenvolvimento escolhido foi `save-state-dev`.
- O inventário remoto read-only histórico encontrou 30 de 33 índices, com os 3 índices de
  `GameCollection` ausentes; nenhuma incompatibilidade foi reportada.
- A coleção `gamecollections` estava ausente no momento do preflight histórico.
- `GATE 3B.2-AUTH-R3` confirmou localmente `username_matches_expected: true`, mas `connect()`
  retornou `MONGO_8000`; o ping não foi executado.

### Não comprovado

- Que as roles de `hericmendez00_db_dev` estão restritas a `save-state-dev`.
- Que `authSource` seja a causa do `MONGO_8000`.
- Que a senha no `.env` corresponda à senha atualmente cadastrada no Atlas.
- Que o estado remoto de índices/coleções continue igual ao histórico.
- Que o TLS tenha sido validado de forma independente no R3 (o erro ocorreu durante a conexão;
  não houve teste TLS isolado).

### Situação atual desta execução

- Nenhuma conexão Atlas foi aberta.
- Nenhum `connect()`, `ping`, `listDatabases`, `listCollections`, `listIndexes` ou aggregation.
- A identidade da URI de desenvolvimento foi conferida localmente apenas como booleano/valor
  mascarado; o username esperado está presente.
- **Hipótese principal em aberto:** falha de credencial/registro do usuário no Atlas ou
  incompatibilidade entre a senha codificada na URI e a senha cadastrada. **Não é fato.**
- **Hipótese secundária:** regras de `authSource`/mecanismo de autenticação. **Não testada.**

---

## G. Índices — inventário e riscos

| Item | Estado |
|---|---|
| Declaração local | 33 índices em 9 modelos |
| Índices impostos | 12 (`unique`, `sparse`, `partial`, TTL) |
| `GameCollection` | 3 índices (`userId`, `name`, composto unique) |
| Último inventário remoto | 30/33; 3 ausentes em `GameCollection` (histórico) |
| Rechecagem remota nesta execução | **não executada** |
| Criação de índices | **não autorizada** |
| Risco de criação implícita | Runtime de desenvolvimento pode executar `ensureIndexes()` |
| Guarda dos scripts | `autoCreate/autoIndex/autoSearchIndex: false` por conexão |

Riscos residuais do B-01 continuam registrados no plano:

- Ausência de `maxTimeMS` na aggregation de duplicatas e na criação de índice.
- `retryReads: true` padrão do driver na conexão do script.
- Valores de `userId`/`name` transitam em memória no preflight de duplicatas.
- Operação sequencial, sem atomicidade/rollback.
- Concorrência com processos Next ou outros escritores.
- Permissões e collation da coleção ainda não revalidadas.

---

## H. Qualidade — testes seguros e não executados

### Testes puros identificados como seguros (sem rede/DB)

Candidatos que não abrem conexão real, não usam Atlas e não exigem `mongod`:

- `tests/db/index-inventory.test.ts` — inspeciona schemas Mongoose em memória.
- `tests/db/mongo-config.test.ts` — funções puras de configuração.
- `tests/scripts/operational-cli.test.ts` — parser/guards com argumentos sintéticos.
- `tests/scripts/verify-indexes-readonly.test.ts` — inicialização de Model sem servidor e
  métodos de escrita mockados.
- `tests/db/readiness-check.test.ts` — dependências mockadas.
- `tests/security-headers.test.ts`, `tests/env.test.ts`, `tests/auth/password.test.ts` e
  `tests/auth/normalization.test.ts` — lógica local.

> **Motivo:** esses arquivos não chamam `connect()` real, não usam `MongoMemoryServer` e não
> dependem de rede. Mesmo assim, **não foram executados nesta etapa** porque a autorização
> pedida foi somente leitura/diagnóstica e a execução pode gerar caches/artefatos.

### Testes que exigem banco local e não devem rodar agora

- `tests/db/index-management.test.ts` (`MongoMemoryServer`)
- `tests/db/mongo-connection.integration.test.ts` (`MongoMemoryServer`)
- `tests/seeds/atlas-seed.test.ts` (`MongoMemoryServer`)

### Não executado

- Suíte Vitest completa.
- `next build`.
- `tsc --noEmit`.
- ESLint.
- Playwright/E2E/Lighthouse.
- `pnpm db:indexes`, seed ou migração.
- Next.js dev/start.

**Razão:** build e testes de integração podem importar módulos com efeitos remotos, iniciar
processos e/ou escrever artefatos. Isso requer autorização separada.

---

## I. Plano de continuidade

### Ordem proposta

1. **Revisão privada da credencial (proprietário).**
   Conferir no Atlas, sem compartilhar segredos: usuário `hericmendez00_db_dev`, database de
   autenticação `admin`, senha atual, roles e escopo. Confirmar que a senha no `.env`
   corresponde à senha vigente. **Dependência:** ação humana; não executada pelo agente.

2. **Validação independente via Compass (opcional, recomendada).**
   O Compass não está instalado. Se o proprietário autorizar a instalação, testar host,
   usuário, senha e `authSource=admin` com TLS. Isso separa falha de credencial de falha de
   construção/decodificação da URI no Node. **Gate:** instalação e conexão exigem autorização.

3. **Diagnóstico local adicional da URI (sem conexão).**
   Comparar o valor carregado por `@next/env` com o valor do processo; verificar dupla
   codificação, caracteres especiais, opções conflitantes e presença de `authSource`. Emitir
   somente booleanos sanitizados. **Gate:** nenhum; é local.

4. **AUTH-R4 — nova tentativa limitada (somente se autorizada).**
   Uma única conexão + um único ping, exclusivamente com `MONGODB_DEV_URI`, sem retry, sem
   escrita, com TLS válido. Registrar código sanitizado e resultado. **Gate:**
   `GATE 3B.2-AUTH` reaberto por autorização explícita.

5. **Revisão de permissões.**
   Confirmar roles efetivas e isolamento em `save-state-dev` antes de qualquer escrita.

6. **Ativação controlada da credencial de desenvolvimento.**
   Planejar a troca da URI principal apenas após autenticação e permissões aprovadas.

7. **Hardening do B-01.**
   Adicionar deadlines (`maxTimeMS`), política explícita de retry e minimização dos valores de
   duplicidade, ou aceitar formalmente os riscos residuais.

8. **B-02 — provisionamento create-only (somente após todos os gates).**
   Revalidar índices read-only, garantir janela sem escritores, confirmar alvo/permissões e
   executar uma única vez com autorização específica.

9. **Retomada funcional.**
   Testes, typecheck, lint, build, fluxos de autenticação e readiness para Preview/Production.

### Dependências e riscos

- AUTH-R4 depende de revisão humana da credencial; repetir a tentativa sem mudança tende a
  reproduzir o `MONGO_8000`.
- B-02 depende de AUTH aprovado, permissões revisadas, inventário fresco e ausência de
  concorrência.
- Produção depende de W-06 (rate limiting distribuído), homologação de e-mail, isolamento de
  ambientes e configuração Vercel.
- A correção read-only do B-01 não substitui a revalidação do caminho de provisionamento em
  banco vazio.

### Primeira mudança recomendada

**Nenhuma alteração de código nesta etapa.** A próxima ação concreta recomendada é a revisão
privada da credencial pelo proprietário e, se desejar, a validação via Compass. Em paralelo,
pode ser autorizado o diagnóstico local da URI (item 3), que não abre conexão.

---

## J. Integridade — confirmações desta execução

- **Nenhuma conexão Atlas iniciada.**
- **Nenhuma escrita remota.**
- **Nenhuma alteração no database.**
- **Nenhuma criação de índices ou coleções.**
- **Nenhuma migração ou seed.**
- **Nenhuma instalação/atualização de dependências.**
- **Nenhum processo encerrado ou iniciado.**
- **Nenhum segredo exibido, copiado ou persistido.**
- **Nenhum commit, push ou deploy.**
- **Nenhum comando Git destrutivo.**
- **Nenhuma alteração em `.env`, código, schemas, scripts ou lockfile.**
- A única escrita foi este documento novo em `docs/POST_KUBUNTU_HANDOFF_AUDIT.md`.
- Nenhum relatório histórico foi sobrescrito.

> Itens que **não** podem ser confirmados por esta execução: ausência de atividade Atlas por
> outros clientes, escopo real das roles e estado remoto atual de índices/coleções.

---

## Status final

**CONCLUÍDO — auditoria de retomada realizada; próxima etapa aguardando autorização.**
