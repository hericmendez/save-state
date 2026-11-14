# DB-LOCAL-07 / GATE 3B.2-AUTH-401 — Investigação do HTTP 401 e rastreamento estático da conexão MongoDB

**Data:** 14/11/2026
**Escopo:** análise estática e inspeção local. Nenhuma requisição HTTP, nenhuma conexão MongoDB, nenhum `connectDatabase()`, nenhum modelo inicializado.
**Branch:** `main` — HEAD histórico `9aaa952bae0bbe0bfca5674d301b0284c44bc824`.
**Resultado:** **CONCLUÍDO** — o 401 do `POST /api/auth/login` pressupõe `connectDatabase()` resolvido e consulta concluída; não prova qual banco, qual credencial, existência do usuário ou correção da senha.

> Sanitização: este documento não reproduz URI, senha, host, IP, hash de credencial nem mensagem bruta de driver. Identidades são referidas por categoria (“credencial antiga”, “credencial de desenvolvimento”).

---

## A. Contexto

O projeto foi migrado para Kubuntu 26.04.1 LTS. O gate de autenticação Atlas (`GATE 3B.2-AUTH`) continua não aprovado: o probe isolado com `MONGODB_DEV_URI` falhou com `MONGO_8000`, e o diagnóstico local (`docs/DB_LOCAL_07_AUTH_LOCAL_DIAGNOSTIC.md`) não encontrou defeito de carregamento, aspas, CRLF, percent-encoding, username, `authSource` ou TLS.

Nova evidência: o proprietário tentou login com credenciais antigas e recebeu **HTTP 401**, não 500. A hipótese levantada é que a aplicação consiga consultar o MongoDB via `MONGODB_URI` (credencial antiga) enquanto o probe isolado falha com `MONGODB_DEV_URI` (credencial nova).

Esta investigação responde se o 401 é evidência suficiente de consulta bem-sucedida ao MongoDB e mapeia todos os caminhos que produzem 401.

**Fatos de configuração observados (sem valores):**

| Item | Observação |
|---|---|
| `MONGODB_DB_NAME` | `save-state-dev` |
| `MONGODB_URI` | presente; scheme `mongodb+srv`; identidade = **credencial antiga**; sem database path |
| `MONGODB_DEV_URI` | presente; identidade = credencial de desenvolvimento; sem database path |
| `.env` | único arquivo de ambiente carregado; modo `600` |
| Driver efetivo | `mongodb@6.20.0` via `mongoose@8.24.4` |
| Next.js | `15.5.29`, App Router, runtime `nodejs` nas rotas de auth |

---

## B. Fluxo de autenticação

```text
features/auth/login-form.tsx:18-30   handleSubmit
        │  api.login(email, password)
        ▼
lib/api-client.ts:54-58              fetch POST /api/auth/login, credentials: include
        │
        ▼
app/api/auth/login/route.ts:14-26    POST (runtime = nodejs)
  16  checkRateLimit(...)            → 429 se excedido
  17  parseBody(loginSchema, ...)    → 400 se inválido
  18  loginUser(body)
        │
        ▼
server/auth/service.ts:165-180       loginUser
 169  await connectDatabase()        → abre/reutiliza conexão; falha = erro genérico
 170  User.findOne({ email })        → consulta MongoDB
 171  bcrypt.compare(...)
 175  if (!user || !passwordMatches || !user.emailVerifiedAt)
 176      throw ApiError("UNAUTHENTICATED", ..., 401)
        │
        ▼
app/api/auth/login/route.ts:19-24    signToken + setAuthCookie + 200 { data }
```

O `try/catch` efetivo não está na rota: `handleRoute` (`server/shared/route-handler.ts:61-86`) envolve o handler. `ApiError` é convertido com o próprio status; qualquer outro erro vira `INTERNAL_ERROR` 500 sanitizado (`lib/api-error.ts:68-72`, `server/shared/route-handler.ts:64-84`).

---

## C. Mapa dos retornos HTTP 401

### C.1 Produtores de `UNAUTHENTICATED`

`UNAUTHENTICATED` mapeia para 401 em `lib/api-error.ts:72`. Os únicos produtores no código de aplicação são:

| # | Arquivo | Função | Condição | Consulta MongoDB anterior | Falha de conexão pode gerar 401? | Evidência |
|---|---|---|---|---|---|---|
| 1 | `server/auth/service.ts` | `loginUser` | `!user \|\| !passwordMatches \|\| !user.emailVerifiedAt` | **Sim** (`User.findOne`, linha 170) | **Não** | linhas 165-177 |
| 2 | `server/auth/session.ts` | `getSessionUserFromToken` | cookie `token` ausente | Não | Não | linhas 111-112 |
| 3 | `server/auth/session.ts` | `getSessionUserFromToken` | JWT inválido/expirado (`jwt.verify` lança) | Não | Não | linhas 114-119 |
| 4 | `server/auth/session.ts` | `getSessionUserFromToken` | payload não é objeto | Não | Não | linhas 121-123 |
| 5 | `server/auth/session.ts` | `getSessionUserFromToken` | claim `userId` inválida | Não | Não | linhas 125-127 |
| 6 | `server/auth/session.ts` | `getSessionUserFromToken` | claim `sessionVersion` inválida | Não | Não | linhas 128-134 |
| 7 | `server/auth/session.ts` | `getSessionUserFromToken` | usuário inexistente ou e-mail não verificado | **Sim** (`User.findById`, linha 137) | Não | linhas 136-142 |
| 8 | `server/auth/session.ts` | `getSessionUserFromToken` | `sessionVersion` do banco ≠ do token | **Sim** (linha 137) | Não | linhas 143-146 |
| 9 | `app/api/logout/route.ts` | `POST` | rethrow de `UNAUTHENTICATED` vindo de `getSessionUser` | Condicional | Não | linha 25 |
| 10 | `app/api/auth/me/route.ts` | `GET`/`PATCH` | via `getSessionUser` (caminhos 2-8) | Condicional | Não | linhas 17, 32 |

Além desses, **69 arquivos** em `app/` usam `getSessionUser`/`getCurrentSession`; qualquer rota autenticada pode responder 401 pelos caminhos 2–8. `/api/ready` **não** retorna 401: usa 404 (não autorizado), 503 (falha) e 200 (pronto) — `app/api/ready/route.ts:20-42`.

### C.2 O que o `POST /api/auth/login` pode retornar

| Status | Condição | Origem | Evidência |
|---|---|---|---|
| 200 | credencial válida e e-mail verificado | `ok()` + cookie | `app/api/auth/login/route.ts:19-25` |
| 400 | corpo inválido (schema Zod) | `VALIDATION_ERROR` | `route.ts:17`; `server/shared/validation.ts:47-48`; `lib/api-error.ts:70` |
| 400 | JSON malformado? **Não** | `request.json()` lança `SyntaxError` → 500 | `route.ts:17`; `route-handler.ts:64-84` |
| 401 | usuário inexistente, senha errada ou e-mail não verificado | `UNAUTHENTICATED` | `service.ts:175-176` |
| 403 | **não existe** nesse fluxo | — | nenhum produtor de 403 em auth |
| 429 | limite de 20 tentativas / 15 min por IP+rota | `RATE_LIMIT_EXCEEDED` | `server/auth/rate-limit.ts:28-31,76-82`; `lib/api-error.ts:79` |
| 500 | falha de conexão, índice, env, JWT ou erro inesperado | `INTERNAL_ERROR` | `db/connection.ts:70-73,90-96`; `route-handler.ts:64-84`; `lib/api-error.ts:69` |
| 503 | indisponibilidade de serviço externo (ATP/IGDB) | `ATP_UNAVAILABLE` / `IGDB_UNAVAILABLE` | `lib/api-error.ts:101,104` — **não no login** |

**Fato:** existe **um único** 401 no `POST /api/auth/login`, em `server/auth/service.ts:176`.

---

## D. Conexão MongoDB — cadeia de chamadas

```text
loginUser (server/auth/service.ts:169)
   ↓
connectDatabase (db/connection.ts:36-109)
   ├─ loadServerEnv()                lib/env.ts:4-57        → MONGODB_URI
   ├─ resolveMongoDbName(...)        db/mongo-config.ts:14-43
   ├─ mongoConnectionIdentity(...)   db/mongo-config.ts:46-48 (sha256, não reversível)
   ├─ guarda de identidade           db/connection.ts:46-50
   ├─ cache global                   db/connection.ts:39-40,52-62
   └─ mongoose.connect(MONGODB_URI, { dbName, ...MONGOOSE_CONNECTION_OPTIONS })
                                     db/connection.ts:67-69
        ↓
Mongoose 8.24.4 openUri → NativeConnection.createClient
        ↓
new mongodb.MongoClient(uri, options) → client.connect()
   (Mongoose remove options.dbName antes do MongoClient)
        ↓
_setClient(..., dbName) → seleciona o database após conectar
        ↓
mongodb driver 6.20.0 (SCRAM, authSource = admin)
```

### D.1 Respostas objetivas

| Pergunta | Resposta | Evidência |
|---|---|---|
| Qual função estabelece a conexão? | `connectDatabase` | `db/connection.ts:36` |
| Qual variável o runtime consome? | **`MONGODB_URI`** | `db/connection.ts:42,67`; `lib/env.ts:5` |
| `MONGODB_DEV_URI` é usada pelo runtime? | **Não.** Só existe em `.env` e docs; nenhuma referência em `db/`, `lib/`, `server/`, `app/`, `scripts/`, `tests/`, `schemas/` | grep de código |
| Existe fallback de URI? | **Não.** `MONGODB_URI` é obrigatória; ausência = erro de env → 500 | `lib/env.ts:5` |
| Existe fallback de database? | Sim: `"save-state"` quando `MONGODB_DB_NAME` está ausente e não é Vercel | `db/mongo-config.ts:11,18-30` |
| `MONGODB_DB_NAME` é aplicado antes ou depois do cliente? | Passado ao `mongoose.connect`; o Mongoose **remove** `dbName` antes de criar o `MongoClient` e o aplica em `_setClient` após conectar | `db/connection.ts:67-69`; Mongoose `connection.js` |
| O database é explicitamente `save-state-dev`? | **Na configuração atual, sim** (`MONGODB_DB_NAME=save-state-dev`). Se o processo que atendeu o login carregou este `.env`, é esse o database. | `.env` (chave apenas) |
| Alguma variável pode ser sobrescrita pelo processo? | Sim. `@next/env` respeita `process.env` existente; não é possível provar o env do processo que atendeu a tentativa. | `@next/env` (expand) |
| O cache pode reutilizar cliente anterior? | Sim, via `globalThis.__saveStateMongooseCache`, com guarda de identidade que **lança erro** se URI/database mudarem no mesmo processo | `db/connection.ts:21-24,39-62` |
| O login pode retornar 401 sem MongoDB? | **Não pelo `POST /api/auth/login`**: `connectDatabase()` é a primeira operação de `loginUser`. Sim por rotas de sessão (2–8). | `service.ts:169` |

### D.2 Consequência do `dbName` sobre autenticação

Como o Mongoose não repassa `dbName` ao `MongoClient`, o `authSource` efetivo da aplicação continua **`admin`** — igual ao dos probes que usaram `MongoClient` diretamente. Não há divergência local de `authSource` entre app e probe.

---

## E. Tratamento de falhas

| Cenário | Comportamento | Evidência |
|---|---|---|
| `mongoose.connect` rejeita (DNS, TLS, auth, timeout) | Erro genérico sanitizado → `INTERNAL_ERROR` 500 | `db/connection.ts:70-73`; `route-handler.ts:64-84` |
| Índices falham em development | `ensureIndexes` lança → 500 | `db/connection.ts:85-96` |
| `User.findOne` lança (erro de driver/rede) | Erro do Mongoose não é `ApiError` → 500 | `route-handler.ts:65-84` |
| `MONGODB_URI` ausente/inválida | Erro de env → 500 | `lib/env.ts:5`; `db/connection.ts:42` |
| `JWT_SECRET` inválido | 500 (fail closed) | `server/auth/service.ts:11`; teste `login-failures.test.ts:111-132` |
| JSON malformado no corpo | 500 (`SyntaxError` não é `ApiError`) | `route.ts:17`; `route-handler.ts:65` |
| Rate limit excedido | 429 | `rate-limit.ts:76-82` |
| Validação Zod | 400 | `validation.ts:47-48` |

### E.1 Respostas A–E

- **A. Consulta bem-sucedida pode resultar em 401?** **Sim.** Usuário inexistente, senha incorreta e e-mail não verificado colapsam no mesmo 401 (`service.ts:175-176`). O teste `register-login.test.ts:278-295` confirma que “senha errada” e “usuário inexistente” são indistinguíveis.
- **B. Falha de conexão resulta em 500/503?** **Sim, 500** no fluxo de login. `login-failures.test.ts:66-90` exige `500 INTERNAL_ERROR`; `:92-109` exige explicitamente **não 401**.
- **C. Falha de conexão poderia ser convertida em 401?** **Não no código atual.** Não há `catch` que mapeie erro arbitrário para `UNAUTHENTICATED`. O único 401 de login é lançado **depois** de `findOne` retornar.
- **D. Middleware pode gerar 401 antes do handler?** **Não.** Não existe `middleware.ts`/`middleware.js`; não há `next.config` rewrites; não há server actions/guards. `next.config.ts` tem apenas `headers()` e `redirects()` de compatibilidade.
- **E. O 401 pode ter outra origem?** **Sim, teoricamente**: qualquer rota autenticada (69 arquivos usam sessão) pode responder 401. A página de login em si **não** chama `/api/auth/me`; `app/(auth)/layout.tsx:11-14` captura a falha de sessão e redireciona/renderiza, sem 401 HTTP. Portanto, sem a URL e o corpo da resposta, a origem exata não é atribuível.

---

## F. Middleware e guards

| Mecanismo | Existe? | Pode gerar 401 sem banco? | Evidência |
|---|---|---|---|
| `middleware.ts` / `middleware.js` | **Não** | — | busca em todo o repositório (fora `node_modules`) |
| Rewrites no `next.config.ts` | **Não** | — | `next.config.ts` só tem `headers()`/`redirects()` |
| Server Actions (`"use server"`) | **Não** | — | grep em `app/`, `server/`, `lib/`, `features/` |
| Guard de layout `(app)` | Sim, mas **redireciona** para `/login`; não responde 401 | — | `app/(app)/layout.tsx:12-17` |
| Guard de layout `(auth)` | Sim; captura e renderiza login | — | `app/(auth)/layout.tsx:11-14` |
| Rate limiting | Sim, **429** | — | `server/auth/rate-limit.ts:76-82` |
| Validação de origem/CSRF | Não implementada | — | grep sem resultados |
| Tratamento global | `handleRoute` | Não gera 401 espontaneamente | `server/shared/route-handler.ts:61-86` |

---

## G. Testes existentes

| Teste | Comportamento comprovado | Limitação |
|---|---|---|
| `tests/auth/register-login.test.ts:256-276` | login válido → 200 + cookie `token` httpOnly/SameSite/Path/Max-Age | usa `mongodb-memory-server` |
| `:278-295` | senha errada e usuário inexistente → **401** com body idêntico | não distingue as causas (por design) |
| `:297-306` | credencial válida com e-mail não verificado → **401**, sem cookie | idem |
| `:335-341` | entrada inválida → **400** `VALIDATION_ERROR` | — |
| `tests/auth/login-failures.test.ts:66-90` | queda de banco → **500 `INTERNAL_ERROR`** | `mongoose.connect` mockado |
| `:92-109` | queda de banco **não é mascarada como 401** | mock |
| `:111-132` | env/JWT inválido → 500 fail closed, sem vazar nome | mock |
| `tests/auth/session-me.test.ts:50-...` | sem cookie / JWT malformado / expirado / `sessionVersion` obsoleto → **401** | usa banco em memória |
| `tests/auth/rate-limit.test.ts` | limite excedido → **429**; `NODE_ENV=test` desativa o limiter | — |

**Limitação geral:** nenhum teste prova conectividade real com o Atlas; eles provam o contrato de código. Mocks de `mongoose.connect` não demonstram que a aplicação em execução conseguiu conectar.

---

## H. Interpretação — o que o 401 comprova

### H.1 Se o 401 veio de `POST /api/auth/login`

Comprova:

1. a requisição chegou ao handler da rota;
2. o rate limit não bloqueou (senão 429);
3. o corpo passou na validação Zod (senão 400);
4. `loginUser` executou;
5. **`connectDatabase()` resolveu sem lançar**;
6. **`User.findOne` concluiu sem lançar**;
7. em development, a verificação/criação de índices também concluiu (senão 500);
8. uma das três condições de `service.ts:175` era verdadeira.

Não comprova:

- qual banco foi consultado (Atlas, local ou outro);
- que o processo usava o `.env` atual;
- que o database era `save-state-dev`;
- que o usuário existia;
- que a senha estava correta;
- que a credencial antiga autenticou (o 401 é justamente compatível com falha de credencial);
- que a conexão era recém-estabelecida (pode ter vindo do cache global);
- que a resposta veio do handler de login (poderia ser outra rota autenticada).

### H.2 Se o 401 veio de outra rota

Pode ter ocorrido **sem qualquer consulta ao MongoDB** (cookie ausente ou JWT inválido — `session.ts:111-134`). Nesse caso, nada se conclui sobre a conexão.

### H.3 Resposta à pergunta central

> **O HTTP 401 observado é evidência suficiente de que o Save State conseguiu consultar o MongoDB?**

**Não por si só.** É suficiente apenas sob a premissa de que a resposta veio de `POST /api/auth/login`. Sob essa premissa, o 401 é evidência **forte** de que `connectDatabase()` resolviu e de que uma consulta a `User` foi concluída — porque uma falha de conexão produz 500, comportamento coberto por teste dedicado. Fora dessa premissa, o 401 pode ser emitido antes de qualquer acesso ao banco.

---

## I. Hipóteses

| # | Hipótese | Classificação | Justificativa |
|---|---|---|---|
| 1 | O 401 veio de `POST /api/auth/login` (`service.ts:176`) | **Compatível, não comprovada** | Único 401 de login; falta URL/corpo da resposta |
| 2 | `connectDatabase()` resolveu e `findOne` concluiu | **Confirmada se (1)** | `service.ts:169-176`; falha de conexão = 500 |
| 3 | O runtime usa `MONGODB_URI` (credencial antiga) | **Confirmada no código** | `db/connection.ts:42,67`; `lib/env.ts:5` |
| 4 | `MONGODB_DEV_URI` alimenta a aplicação | **Descartada** | Nenhuma referência em código; só `.env`/docs |
| 5 | O database é `save-state-dev` | **Confirmada na configuração atual; não comprovada na execução** | `MONGODB_DB_NAME=save-state-dev`; env do processo naquele momento é desconhecido |
| 6 | O banco consultado era o Atlas | **Não comprovada** | Há MongoDB local ativo (loopback, não acessado); URI é `mongodb+srv`, mas o processo poderia ter outro env |
| 7 | Falha de conexão virou 401 | **Descartada** | `connection.ts:70-73` + `login-failures.test.ts:92-109` |
| 8 | Middleware/guard gerou 401 antes do handler | **Descartada** | Não existe middleware/server action/guard que responda 401 |
| 9 | Rate limit gerou 401 | **Descartada** | Rate limit = 429 |
| 10 | Validação gerou 401 | **Descartada** | Validação = 400 |
| 11 | Usuário existe e a senha está errada | **Compatível, não comprovada** | Colapsa no mesmo 401 |
| 12 | Usuário não existe no banco consultado | **Compatível, não comprovada** | Idem |
| 13 | Usuário existe, mas e-mail não verificado | **Compatível, não comprovada** | `service.ts:175` |
| 14 | Credencial antiga válida no banco antigo, usuário ausente no banco atual | **Compatível, não comprovada** | Explica 401 com consulta bem-sucedida |
| 15 | O 401 veio de `/api/auth/me` ou outra rota de sessão | **Compatível, improvável na página de login** | Página de login não chama `/api/auth/me`; outras telas sim |
| 16 | Conexão cacheada de um URI anterior mascarou o alvo | **Descartada como reuso silencioso** | Guarda de identidade lança erro se URI/db mudarem (`connection.ts:46-50`) |
| 17 | O processo usava um `.env` diferente do atual | **Não verificada** | Nenhum processo Next estava ativo no momento da auditoria |
| 18 | A hipótese “app conecta via `MONGODB_URI` enquanto probe falha via `MONGODB_DEV_URI`” | **Não comprovada (plausível)** | Exige (1) + (6) + env do processo; nenhum é observável agora |

---

## J. Próximo passo

Verificação mínima, em ordem, **sem conectar ao banco**:

1. **Capturar a requisição real.** No navegador, DevTools → Network, repetir a tentativa e registrar: método, URL exata, status e corpo `{ error: { code, message } }`.
   - `message: "Invalid credentials"` + URL `/api/auth/login` → confirma (1), portanto conexão/consulta bem-sucedidas.
   - `"Authentication is required"` ou `"Invalid authentication token"` → 401 de sessão, **sem** conclusão sobre o banco.
   - `code: "RATE_LIMIT_EXCEEDED"` → 429, não 401.
2. **Se (1) for confirmado, identificar o alvo da conexão sem abrir socket nova:** inspecionar o ambiente do processo Next em execução (`/proc/<pid>/environ`, comparando apenas presença/identidade de `MONGODB_URI` vs `MONGODB_DEV_URI` e `MONGODB_DB_NAME`, sem imprimir valores) ou usar o resultado de `GET /api/ready` (200/503/404), que usa `MONGODB_URI` e o `dbName` resolvido.
3. **Somente então** decidir entre: (a) validar a credencial antiga contra o banco atual, ou (b) autorizar AUTH-R4 com `MONGODB_DEV_URI`.
4. **Não alterar** `.env`, URI, `authSource`, senha, roles ou código por iniciativa do agente.

---

## Integridade

Confirmado nesta execução:

- Nenhuma conexão MongoDB (local ou Atlas), nenhum `ping`, nenhuma leitura/escrita remota.
- Nenhum `MongoClient.connect()`, nenhum `connectDatabase()`, nenhum modelo Mongoose inicializado.
- Nenhum Next.js iniciado, nenhuma requisição HTTP, nenhum teste executado.
- Nenhum índice, seed ou migração.
- Nenhuma alteração de `.env`, código, schema, dependências ou lockfile.
- Nenhum processo iniciado/encerrado; nenhum commit/push/deploy; nenhum comando Git destrutivo.
- Nenhum segredo, URI, host, IP ou hash reproduzido neste documento.
- **Única escrita:** este arquivo, `docs/DB_LOCAL_07_AUTH_401_INVESTIGATION.md`.

### Nota operacional de segurança

Durante a inspeção, um `grep` por `MONGODB_DEV_URI` incluiu o `.env` e exibiu o valor da credencial de desenvolvimento no transcript da ferramenta. O valor **não** foi copiado para este documento, mas deve ser tratado como exposto e **rotacionado pelo proprietário** no Atlas. Nenhuma outra ação foi tomada com base nesse valor.

---

## Conclusão

- O `POST /api/auth/login` só retorna 401 em `server/auth/service.ts:176`, **após** `connectDatabase()` e `User.findOne`.
- Falha de conexão vira **500**, não 401 — comportamento coberto por teste.
- O runtime usa **`MONGODB_URI`**; `MONGODB_DEV_URI` não é referenciada por código.
- `MONGODB_DB_NAME=save-state-dev` é aplicado via `dbName`, sem afetar o `authSource` (`admin`).
- Não há middleware, guard ou rate limit capaz de produzir 401 no login.
- **O 401, se veio do login, prova conexão e consulta concluídas; não prova Atlas, database, existência do usuário nem senha correta.**

**GATE 3B.2-AUTH:** não aprovado.
**AUTH-R4:** não autorizado.
**GATE 3B.2-B:** não autorizado.

**STATUS FINAL: CONCLUÍDO — investigação estática documentada; nenhuma conexão executada.**
