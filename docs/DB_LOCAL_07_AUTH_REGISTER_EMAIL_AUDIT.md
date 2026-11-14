# DB-LOCAL-07 / POST-KUBUNTU-02 — Auditoria de login, cadastro e envio de e-mail

**Data:** 14/11/2026
**Modo:** análise estática e inspeção local não destrutiva.
**Nenhuma conexão MongoDB, nenhuma requisição HTTP, nenhum teste, nenhum envio de e-mail, nenhuma escrita.**
**Branch:** `main` — HEAD `9aaa952bae0bbe0bfca5674d301b0284c44bc824`.
**Resultado:** **CONCLUÍDO** — cadastro persiste antes do 201; envio é pós-resposta e silencioso; Resend não está configurado no ambiente carregado; as duas credenciais não foram comprovadas de forma independente.

> Sanitização: nenhuma URI, senha, host, IP, token ou valor de credencial é reproduzido. Identidades são descritas por categoria. A inspeção de `.env` foi feita por código que emite apenas booleanos e categorias.

---

## A. Contexto e objetivo

O proprietário autorizou o IP no Atlas, rotacionou senhas e executou manualmente dois cenários, obtendo 401 no login, 201 no cadastro e nenhum e-mail de confirmação em ambos. Esta auditoria responde:

1. o que 401 e 201 comprovam sobre MongoDB;
2. qual variável alimenta a conexão;
3. se as duas credenciais foram realmente exercitadas;
4. se o cadastro grava antes de responder 201;
5. por que os e-mails não chegam;
6. se há risco de contas inativáveis;
7. qual o próximo passo seguro.

**Mudança de estado detectada nesta auditoria:** o `.env` atual (mtime `2026-11-14 12:03:37`, modo `600`) tem 12 chaves e **não contém mais `MONGODB_DEV_URI`**. Contém `MONGODB_URI`, `MONGODB_DB_NAME`, `MONGODB_DEV_NAME`, `MONGODB_DEV_PASSWORD`, `MONGODB_USER_NAME`, `MONGODB_USER_PASSWORD`, `MONGODB_URI_DEFAULT`, `APP_URL`, `JWT_SECRET` e chaves auxiliares. Nenhum arquivo `.env.local`/`.env.development` existe; o único arquivo carregado é `.env`.

---

## B. Evidências do login

Fluxo atual (revalidado):

```text
app/api/auth/login/route.ts:14-26
  16 checkRateLimit            → 429
  17 parseBody(loginSchema)    → 400
  18 loginUser(body)
server/auth/service.ts:165-180
 169 await connectDatabase()
 170 User.findOne({ email })
 171 bcrypt.compare(...)
 175 if (!user || !passwordMatches || !user.emailVerifiedAt)
 176   throw ApiError("UNAUTHENTICATED", "Invalid credentials", 401)
```

- O 401 continua ocorrendo **depois** de `connectDatabase()` e de `User.findOne()` — `service.ts:169-176`.
- `ensureIndexes()` é executado em development no primeiro `connectDatabase()` (`db/connection.ts:74-89`): em `NODE_ENV !== "production"` roda `model.ensureIndexes()`; falha → 500, não 401.
- Falhas de conexão são convertidas em `Error` genérico (`connection.ts:70-73`) e o `handleRoute` as traduz em 500 `INTERNAL_ERROR` (`server/shared/route-handler.ts:61-86`).
- Não existe `middleware.ts`, rewrite, server action ou guard que responda 401 antes do handler. Guards de layout **redirecionam**, não respondem 401 (`app/(app)/layout.tsx:12-17`, `app/(auth)/layout.tsx:11-14`).

### O que o 401 comprova

| Camada | Conclusão |
|---|---|
| Código | O único 401 do login é `service.ts:176`, após conexão e consulta. |
| Evidência do proprietário | 401 observado, sem URL/corpo registrados. |
| Remoto | Não verificado: banco, database, existência do usuário, senha e estado de verificação. |

**Se o 401 veio de `POST /api/auth/login`:** comprova que `connectDatabase()` resolveu e `findOne` concluiu. Não prova qual banco, qual credencial, que o usuário existe ou que a senha está correta.

**Ponto decisivo:** como o login exige `emailVerifiedAt` (`service.ts:175`), **um usuário recém-cadastrado e não verificado sempre recebe 401, mesmo com a senha correta**. Portanto o par 201 (cadastro) + 401 (login) é exatamente o comportamento esperado quando o e-mail de confirmação não é entregue.

---

## C. Evidências do cadastro

Fluxo atual:

```text
app/api/auth/register/route.ts:14-26
  16 checkRateLimit                         → 429
  17 parseBody(registerSchema)              → 400
  18 registerUserForPublicSignup(body)      → connect + create user + create token
  19 scheduleVerificationEmail(job)         → agenda envio pós-resposta
  22 created({ message })                   → 201 genérico
```

`server/auth/service.ts:48-77` (`registerUserForPublicSignup`):

1. `await connectDatabase()` — l.53;
2. normaliza e-mail — l.54;
3. `bcrypt.hash` — l.57;
4. `User.findOne({ email })` — l.58; se existir, **retorna `null`** — l.59;
5. `User.create({... emailVerifiedAt: null})` **aguardado** — l.63-68;
6. erro de e-mail duplicado (código 11000 no índice `email`) → `null` — l.69-74;
7. `createVerificationEmailJob(user)` — l.76.

`createVerificationEmailJob` (`service.ts:120-129`):

- gera 32 bytes aleatórios (hex) — l.123;
- **persiste** `EmailVerificationToken` com `tokenHash` SHA-256, `userId` e `expiresAt` (+24 h) — l.124-127;
- devolve `{ to, rawToken }` — l.128.

### Respostas objetivas

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | Usuário é gravado antes do 201? | **Sim**, para e-mail novo | `service.ts:63-68`; `route.ts:18` |
| 2 | A gravação é aguardada? | **Sim** (`await User.create`) | `service.ts:63` |
| 3 | Usa transações? | **Não** no cadastro | ausência de `withAuthTransaction` em `registerUserForPublicSignup` |
| 4 | Cria token de verificação? | **Sim**, para e-mail novo | `service.ts:120-127` |
| 5 | O token é persistido? | **Sim**, só o hash | `service.ts:124-127`; `db/models/email-verification-token.ts:5-9` |
| 6 | Envio é obrigatório para sucesso? | **Não** | `verification-email.ts:20-36,43-51` |
| 7 | Falha de envio impede 201? | **Não** | idem |
| 8 | Falha pode ser ignorada/registrada? | **Sim**, é capturada e logada de forma sanitizada | `verification-email.ts:27-35` |
| 9 | Existe modo mock/desenvolvimento? | **Sim**: `NODE_ENV=test` faz `send` ser no-op e agenda de forma síncrona | `email.ts:9`; `verification-email.ts:46-49` |
| 10 | 201 pode ocorrer sem envio? | **Sim**, por desenho | `route.ts:19-25`; `verification-email.ts:24` |
| 11 | Conta sem confirmação pode logar? | **Não** | `service.ts:175` |
| 12 | Existe reenvio seguro? | **Sim**: `POST /api/auth/resend-verification` | `resend-verification/route.ts:1-8`; `service.ts:156-163` |

### Nuances importantes

- **201 não prova criação de documento novo.** Para e-mail já existente (pendente ou verificado), `registerUserForPublicSignup` retorna `null` (l.58-59) e a rota ainda responde 201. Teste: `register-login.test.ts:206-242` confirma resposta idêntica e que senha, `sessionVersion` e tokens **não** são alterados.
- **Re-cadastro de conta pendente não reenvia e-mail**, porque o retorno `null` também impede a criação de novo token (`service.ts:59`). O caminho correto é o endpoint de reenvio.
- **Falha ao criar o token** após o usuário criado não é transacional: `createVerificationEmailJob` lança → 500, mas o usuário permanece gravado sem token.
- **201 genérico** é anti-enumeração e não confirma entrega (`route.ts:20-25`).

### Ordem real das operações

```text
connectDatabase
  → bcrypt.hash
  → findOne (existência)
  → User.create (grava, aguardado)
  → EmailVerificationToken.create (grava hash, aguardado)
  → [resposta 201]
  → after(): emailService.send (fora da resposta)
```

O envio ocorre **depois** que a resposta 201 já foi produzida (`verification-email.ts:43-51`).

---

## D. Seleção real das variáveis MongoDB

| Variável | Presente no `.env` carregado? | Usada pelo runtime? | Evidência |
|---|---|---|---|
| `MONGODB_URI` | **Sim** | **Sim** | `db/connection.ts:42,67`; `lib/env.ts:5` |
| `MONGODB_DB_NAME` | **Sim** | **Sim** | `db/connection.ts:43`; `db/mongo-config.ts:14-43` |
| `MONGODB_DEV_URI` | **Não** (removida) | **Não** | nenhuma referência em código |
| `MONGODB_DEV_NAME` | **Sim** | **Não** | declarativa |
| `MONGODB_DEV_PASSWORD` | **Sim** | **Não** | declarativa |
| `MONGODB_USER_NAME` | **Sim** | **Não** | declarativa |
| `MONGODB_USER_PASSWORD` | **Sim** | **Não** | declarativa |
| `MONGODB_URI_DEFAULT` | **Sim** | **Não** | declarativa |
| `ENVIRONMENT` | **Não** | **Não** | nenhuma referência |

- `MONGODB_DEV_URI` só aparece em documentos históricos; nenhum arquivo em `db/`, `lib/`, `server/`, `app/`, `scripts/`, `tests/` ou `schemas/` a referencia.
- `MONGODB_DB_NAME` atual é **`save-state-dev`** (validação booleana) e passa no formato exigido (`db/mongo-config.ts:32-42`).
- **Fato atual:** a credencial de `MONGODB_URI` corresponde à identidade de desenvolvimento — o username é igual a `MONGODB_DEV_NAME` e a senha é igual a `MONGODB_DEV_PASSWORD` (comparações booleanas). `MONGODB_URI_DEFAULT` usa outra identidade, distinta das variáveis modulares.
- **Configuração disponível ≠ configuração efetiva.** `loadServerEnv` usa `process.env` e **cacheia** o resultado (`lib/env.ts:45,55,76`); `@next/env` não sobrescreve variáveis já definidas no processo. Além disso, `connectDatabase` mantém cache global de conexão/projeto (`db/connection.ts:21-24,39-62`). Alterar `.env` com o servidor em execução pode não mudar nada até reiniciar — e, mesmo reiniciando, variáveis exportadas no shell têm precedência.

**Consequência:** as duas linhas da tabela do proprietário não podem ser atribuídas a duas URIs distintas sem logs do processo. No estado atual só existe uma URI efetiva.

---

## E. Fluxo de envio de e-mail

```text
scheduleVerificationEmail(job)            server/auth/verification-email.ts:43-51
  NODE_ENV === "test" → deliver agora (await)   l.46-49
  caso contrário       → after(() => deliver)   l.50
        ↓
deliverVerificationEmail(job)             l.20-36
  job nulo → return                       l.24
  try { emailService.send(toEmailOptions(job)) }
  catch → logger.error("Verification email delivery failed", { name })  l.27-35
        ↓
ResendEmailService.send                   server/auth/email.ts:8-24
  NODE_ENV === "test" → return            l.9
  sem RESEND_API_KEY ou EMAIL_FROM → throw "Transactional email is not configured"  l.11-13
  POST https://api.resend.com/emails, timeout 10 s  l.14-23
  resposta não-2xx → throw com status     l.22
```

`toEmailOptions` monta o link com `APP_URL` (`verification-email.ts:8-18`). O `APP_URL` atual é **localhost** (booleano), então o link aponta para a máquina local — não impede o envio, mas afeta a usabilidade fora dela.

### Configuração Resend

| Item | Estado observado |
|---|---|
| `RESEND_API_KEY` | **ausente** no ambiente carregado |
| `EMAIL_FROM` | **ausente** no ambiente carregado |
| Schema | ambos **opcionais** (`lib/env.ts:27-28`) |
| Exigência | o envio exige ambos (`email.ts:11-13`) |
| `.env.example` | declara as duas chaves (`.env.example:6-7`) |
| Teste | ausência de config é exercitada em `register-login.test.ts:132-163` |

**Fato:** sem as duas variáveis, `send` lança **antes** de qualquer chamada de rede. O cadastro continua 201; o erro é engolido e logado apenas como `{ name: "Error" }`.

---

## F. Comportamento diante de falhas

| Cenário | Cadastro público | Login | Forgot password | Reset password |
|---|---|---|---|---|
| Banco indisponível | 500 | 500 | 500 | 500 |
| E-mail não configurado | **201** (falha silenciosa) | — | **500** (envio aguardado) | 200 (reset commitado; notificação engolida) |
| Provedor rejeita | **201** | — | **500** | 200 (notificação engolida) |
| Token não criado | 500 (usuário permanece) | — | — | — |
| E-mail não verificado | 201 + token | **401** | — | — |

- `forgotPassword` **aguarda** `emailService.send` (`service.ts:267-272`); sem config, o `POST /api/auth/forgot-password` falha com 500 — diferente do cadastro, que adia o envio.
- `resetPassword` envia notificação em `try/catch` após o commit (`service.ts:330-346`) e responde 200 mesmo se a notificação falhar.
- `registerUser` (entrada interna usada por seed) **aguarda** o envio (`service.ts:91-100`); sem config, o seed falha depois de criar o usuário.
- O logger registra apenas `name`, nunca a mensagem do erro de e-mail (`verification-email.ts:29-31`), o que **impede distinguir** “config ausente” de “provedor rejeitou” pelos logs.

---

## G. Testes existentes

| Área | Teste | Cobertura | Limitação |
|---|---|---|---|
| Cadastro 201 + persistência | `register-login.test.ts:32-52` | usuário gravado com `emailVerifiedAt: null`; sem cookie | MongoMemoryReplSet |
| Falha de envio mantém 201 | `:54-99` | 3 cenários; token persistido; login 401 | `emailService.send` mockado |
| Falha de banco não vira sucesso | `:101-112` | 500 | mock |
| Índice único inesperado | `:114-130` | 500, não “e-mail existente” | mock |
| Config Resend ausente | `:132-163` | log sanitizado, sem destinatário/token | não verifica HTTP real |
| Reenvio após falha | `:165-204` | novo token, 200 genérico | mock |
| Resposta uniforme | `:206-242` | novo/pendente/verificado idênticos; sem alteração de dados | — |
| Login | `:256-343` | 200, 401 (senha/inexistente/não verificado), 400 | — |
| Infra de login | `login-failures.test.ts:65-133` | 500 em queda; nunca 401 | `mongoose.connect` mockado |
| Tokens transacionais | `token-transactions.test.ts:76-193` | rollback, concorrência, expiração, reenvio | replica set em memória |
| Recuperação de senha | `password.test.ts:103-200` | token, reset, invalidação de sessão | envio mockado |
| UI | `auth-recovery-ui.test.tsx` | mensagens genéricas, reenvio, destino seguro | jsdom |

**Lacunas:**
- nenhum teste com Atlas real;
- nenhum teste do `forgot-password` com `RESEND_API_KEY`/`EMAIL_FROM` ausentes (o caminho 500 não é coberto);
- nenhum teste de entrega/aceitação real do Resend;
- nenhum teste de reinício/cache de ambiente;
- `MONGODB_URI_DEFAULT` e variáveis modulares não têm teste porque não são usadas.

Dependência: todos os testes de auth usam `mongodb-memory-server` (`tests/auth/helpers.ts:8,18-26`) com replica set, não banco externo.

---

## H. Interpretação dos resultados do proprietário

### Conclusão 1 — Conectividade MongoDB

- **401 do login** (se veio do handler): conexão estabelecida e `User.findOne` concluído.
- **201 do cadastro**: `connectDatabase` + `User.findOne` concluídos; para e-mail novo, `User.create` e `EmailVerificationToken.create` concluídos.
- **Classificação:** conectividade e escrita **confirmadas** para a execução observada (forte evidência), condicionadas a as respostas terem vindo desses endpoints. Não provam qual cluster/database.

### Conclusão 2 — Duas credenciais

- O runtime lê apenas `MONGODB_URI`.
- `MONGODB_DEV_URI` não existe mais no ambiente carregado e nunca foi lida pelo código.
- A `MONGODB_URI` atual **é** a credencial de desenvolvimento (username e senha batem com as variáveis modulares dev).
- Sem logs do processo e sem reinício comprovado entre os testes, **não é possível afirmar que duas credenciais distintas foram usadas**. É possível que ambos os cenários tenham usado a mesma URI/DB — inclusive com a conexão cacheada.

**Classificação:** “ambas as credenciais funcionam independentemente” — **não demonstrado**.

### Conclusão 3 — E-mail

| Causa | Classificação |
|---|---|
| `RESEND_API_KEY` e `EMAIL_FROM` ausentes no ambiente carregado | **Confirmada** (config atual) |
| Envio pós-resposta com erro engolido → 201 sem e-mail | **Confirmada** (código) |
| Re-cadastro de conta pendente não gera novo token/e-mail | **Confirmada** (código) |
| Ausência de e-mail na execução do proprietário | **Provável** — depende do env do processo naquele momento |
| Provedor/DNS/spam/domínio não validado | **Não comprovada** — não verificável localmente |
| 201 sem e-mail | **Confirmada** como comportamento possível |

**Não tratar** autorização de IP e rotação de senha como causa comprovada da mudança de 500 para 201/401: não há logs que isolem a variável alterada, e o estado do `.env` mudou entre auditorias.

---

## I. Riscos

1. **Contas órfãs não ativáveis** em `save-state-dev`: cadastros 201 reais podem existir, sem e-mail entregue e sem confirmação. Não foram inventariados nem removidos.
2. **Bloqueio total de ativação e recuperação** enquanto o Resend não estiver configurado.
3. **`forgot-password` responde 500** sem config de e-mail (comportamento diferente do cadastro).
4. **Re-cadastro não reenvia** link para conta pendente; o usuário pode acreditar que reenviou.
5. **201 mascara falha de entrega**; logs registram apenas `name`, sem causa.
6. **Configuração divergente**: variáveis modulares e `MONGODB_URI_DEFAULT` existem, mas não são usadas; risco de o proprietário acreditar que trocou de credencial sem trocar.
7. **Cache de env/conexão** pode fazer dois “cenários” usarem o mesmo alvo.
8. **Sem transação no cadastro**: falha ao criar token deixa usuário sem token.
9. **`APP_URL` localhost**: links de confirmação/recuperação apontam para a máquina local.
10. **Database compartilhado**: `save-state-dev` recebe tudo que usar a `MONGODB_URI` atual.

---

## J. Plano de homologação (não executado)

Cada etapa abaixo exige autorização separada; nenhuma foi executada.

1. **Comprovar a URI efetiva do runtime** sem conectar: ler `/proc/<pid>/environ` do processo Next e comparar, por hash/identidade, `MONGODB_URI` e `MONGODB_DB_NAME`; registrar apenas booleanos. Alternativa: log de startup sanitizado (requer mudança de código, não autorizada).
2. **Homologar a credencial de desenvolvimento isoladamente** (AUTH-R4, não autorizado): uma conexão + um `ping`, sem escrita, sem retry, com `authSource` inalterado.
3. **Confirmar o database alvo** `save-state-dev` por leitura de `connection.name`/`db.getName()` — requer autorização.
4. **Validar persistência sem criar dados novos**: inventariar (read-only) as contas já criadas pelos 201, conferindo `emailVerifiedAt` e tokens; não apagar.
5. **Configurar e-mail**: definir `RESEND_API_KEY` e `EMAIL_FROM` de domínio validado, reiniciar o servidor, confirmar presença por booleano.
6. **Homologar confirmação e reenvio**: um único envio controlado para inbox do proprietário; consumir o link; conferir `emailVerifiedAt`.
7. **Homologar login verificado**: login com a conta confirmada → 200 + cookie.
8. **Homologar recuperação/reset**: `forgot-password` deve deixar de retornar 500; validar token, reset e invalidação de sessão.
9. **Revisar índices e permissões**: `verify-indexes` read-only; roles mínimas (insert em `users` e `emailverificationtokens`, update em `users`).
10. **Retomar preparação de produção** somente após 1–9 com evidência.

---

## K. Gates

- **GATE 3B.2-AUTH:** não aprovado.
- **AUTH-R4:** não autorizado.
- **GATE 3B.2-B:** não autorizado.
- Nenhuma alteração de conexão principal, envio real, criação de conta, limpeza ou deploy foi autorizada.

---

## Integridade

- Nenhuma conexão MongoDB (local ou Atlas), nenhum `ping`, nenhuma leitura/escrita.
- Nenhum `connectDatabase()`, nenhum modelo inicializado, nenhum Next.js iniciado.
- Nenhuma requisição HTTP, nenhum teste executado, nenhum e-mail enviado.
- Nenhum arquivo `.env` alterado; conteúdo inspecionado apenas por código com saída booleana.
- Nenhum processo iniciado/encerrado; nenhum commit/push/deploy.
- **Única escrita:** este documento.

**STATUS FINAL: CONCLUÍDO — análise de login, cadastro e e-mail documentada; nenhuma conexão ou escrita remota executada pelo agente.**
