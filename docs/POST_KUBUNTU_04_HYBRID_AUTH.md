# POST-KUBUNTU-04 — Autenticação híbrida

Cadastro e login in-app, alteração de senha autenticada, recuperação de senha dependente de Resend e verificação de e-mail opcional.

- Data: 14/11/2026
- Branch: `main`
- HEAD de referência: `9aaa952bae0bbe0bfca5674d301b0284c44bc824`
- Escopo: autenticação e telas correlatas
- Nenhuma operação remota executada (Atlas, Resend real, deploy, push)
- Nenhuma alteração em `.env`, dependências ou lockfile

---

## 1. Objetivo

Adaptar a autenticação para o modelo híbrido:

1. **Cadastro** integralmente in-app, sem e-mail obrigatório.
2. **Login** imediato após o cadastro, mesmo com `emailVerifiedAt === null`.
3. **Logout** com comportamento preservado.
4. **Alteração de senha autenticada** sem Resend, exigindo senha atual.
5. **Esqueci minha senha** com Resend e link de recuperação.
6. **Redefinição** por token temporário, de uso único.
7. **Confirmação de e-mail** não obrigatória para login, mas infraestrutura preservada.

Não foi feito rollback completo. As melhorias do POST-KUBUNTU-03 foram preservadas onde continuam aplicáveis.

---

## 2. Arquitetura anterior

Antes desta fase:

- `POST /api/auth/register` exigia `RESEND_API_KEY`/`EMAIL_FROM`; sem configuração retornava `503 EMAIL_UNAVAILABLE` antes de qualquer escrita.
- O cadastro gravava `User` + `EmailVerificationToken` em uma transação MongoDB e disparava e-mail em background.
- `loginUser()` rejeitava credenciais válidas quando `emailVerifiedAt` era `null`.
- `getSessionUserFromToken()` incluía `emailVerifiedAt` no `select` e invalidava a sessão quando o valor era falsy.
- Portanto, uma conta recém-criada não conseguia autenticar até confirmar o e-mail.

---

## 3. Arquitetura nova

```text
Cadastro ──> valida ──> rate limit ──> normaliza ──> hash ──> cria User (1 doc)
                                                              emailVerifiedAt = null
                                                              sem token, sem e-mail

Login ────> valida ──> rate limit ──> findOne(email) ──> bcrypt.compare
                                                              │
                                                              └──> JWT { userId, sessionVersion }
                                                                   cookie httpOnly `token`

Sessão ───> JWT verify ──> findById(userId) ──> compara sessionVersion
                                                 (não checa emailVerifiedAt)
```

Decisões centrais:

- A verificação de e-mail deixou de ser pré-condição de cadastro, login e sessão.
- `emailVerifiedAt` permanece no schema e continua `null` até confirmação real.
- Cadastro passou de transação multi-documento para **uma única escrita** (`User.save()`), pois não há mais token a criar junto.
- Verificação de e-mail e reenvio permanecem disponíveis como recurso opcional.
- Recuperação de senha continua sendo o único fluxo que **exige** Resend.

---

## 4. Fluxos de cadastro e login

### 4.1 Cadastro

Arquivo: `server/auth/service.ts` (`registerUserForPublicSignup`, linhas 60–92) e `app/api/auth/register/route.ts` (linhas 9–25).

Sequência:

1. `checkRateLimit(request, "POST /api/auth/register", AUTH_RATE_LIMIT)`.
2. `parseBody(registerSchema, ...)` (nome 1–100, e-mail público, senha 8–128).
3. `connectDatabase()`.
4. Normalização `trim().toLowerCase()`.
5. `bcrypt.hash(password, 10)` calculado antes da checagem de existência, mantendo o mesmo custo de CPU para endereços novos e existentes (mitiga enumeração por tempo).
6. `User.findOne({ email })`; se existir, retorna `null`.
7. Cria `User` com `emailVerifiedAt: null` e `await user.save()`.
8. Duplicidade concorrente (`E11000` em `email`) é classificada por `isDuplicateEmailError()` e tratada como "já existe" → `null`.

Resposta pública (`201`), idêntica para novo cadastro e e-mail já existente:

```json
{
  "data": {
    "message": "Cadastro processado. Se os dados estiverem corretos, você já pode entrar com seu e-mail e senha."
  }
}
```

Não há token de confirmação nem chamada ao provedor no cadastro padrão.

### 4.2 Login

Arquivo: `server/auth/service.ts` (`loginUser`, linhas 182–200); rota `app/api/auth/login/route.ts`.

- `findOne({ email: email.toLowerCase() })`.
- `bcrypt.compare(password, passwordHash)` sempre avaliado quando o usuário existe.
- `if (!user || !passwordMatches)` → `401 UNAUTHENTICATED` / `"Invalid credentials"`.
- **Não há checagem de `emailVerifiedAt`.**
- Em sucesso: `signToken({ userId, sessionVersion })`, cookie `token` httpOnly via `setAuthCookie`, retorno de `toSafeUser(user)` (sem hash de senha).

Códigos:

| Cenário | HTTP |
| --- | --- |
| Credenciais corretas (verificado ou não) | `200` |
| Senha incorreta | `401` |
| Usuário inexistente | `401` |
| Corpo inválido | `400` (via `parseBody`) |
| Rate limit excedido | `429` |
| Falha de banco / configuração | `500` sanitizado |

---

## 5. Fluxo de recuperação

`POST /api/auth/forgot-password` → `forgotPassword()` (`server/auth/service.ts`, linhas 269–316).

- Resposta pública sempre genérica (`200`), exista ou não a conta.
- **Sem Resend configurado** (`isTransactionalEmailConfigured() === false`):
  - nenhum token é criado;
  - nenhum provedor é chamado;
  - log interno sanitizado `EMAIL_NOT_CONFIGURED`;
  - retorno uniforme. A aplicação não promete entrega.
- **Com Resend configurado**:
  - `crypto.randomBytes(32)` → token bruto;
  - persistência apenas do `sha256` em `PasswordResetToken`;
  - expiração (`RESET_TOKEN_EXPIRY_MS`, 1 hora);
  - envio via `emailService.send` com timeout/classificação de falhas do módulo de e-mail;
  - falhas de provedor são registradas por `emailFailureLogFields(error)` e **não** alteram o HTTP.

O endereço não é exigido como verificado: a recuperação prova controle da caixa postal no momento do uso, não a propriedade histórica do cadastro. Ver seção 10.

---

## 6. Alteração de senha autenticada

Endpoint já existente e reutilizado: `POST /api/auth/change-password` (`app/api/auth/change-password/route.ts`).

- `getSessionUser()` exige sessão válida.
- `checkRateLimit(..., CHANGE_PASSWORD_RATE_LIMIT)`.
- `parseBody(changePasswordSchema)`.
- `changePassword(session.id, currentPassword, newPassword)` (`server/auth/service.ts`, linhas 225–253):
  - busca o usuário;
  - `bcrypt.compare(currentPassword, passwordHash)`; divergência → `400 INVALID_PASSWORD` / `"Current password is incorrect"`;
  - novo hash `bcrypt.hash(newPassword, 10)`;
  - `$inc: { sessionVersion: 1 }`;
  - nenhuma chamada ao Resend.
- Em sucesso, `clearAuthCookie(response)` encerra a sessão corrente; o cliente redireciona para `/login?passwordChanged=1`.

Interface: `features/settings/password-form.tsx`.

- Campos: senha atual, nova senha, **confirmar nova senha**.
- `confirmPassword` adicionado; divergência bloqueia o envio com `"As senhas não coincidem."` antes de qualquer `fetch`.
- Limites `minLength=8`, `maxLength=128` alinhados ao schema.
- Nenhuma senha é registrada em log.

---

## 7. Sessões e JWT

Arquivo: `server/auth/session.ts`.

- Cookie `token`: httpOnly, SameSite=Lax, path `/`, `secure` apenas em produção.
- Claims: `{ userId, sessionVersion }`.
- `getSessionUserFromToken()` valida assinatura, expiração, formato e inteireza de `sessionVersion`.
- Consulta `User.findById(claims.userId).select("sessionVersion")` — **`emailVerifiedAt` foi removido do `select`**.
- Rejeita: usuário inexistente, `sessionVersion` divergente, token inválido/expirado — sempre `401 UNAUTHENTICATED` / `"Invalid authentication token"`, sem distinguir causas.

Consequências:

- JWT emitido antes da confirmação de e-mail continua válido.
- Revogação por `sessionVersion` permanece: logout (`revokeUserSessions`), alteração de senha e redefinição incrementam o contador.

---

## 8. Regras de verificação de e-mail

- `emailVerifiedAt` **permanece no schema** (`db/models/user.ts`).
- `null` = propriedade do endereço não confirmada.
- Cadastro e login com sucesso **não** preenchem o campo.
- `verifyEmail` continua aceitando token válido e gravando `emailVerifiedAt: new Date()` (linhas 148–149 de `service.ts`).
- `resendVerification()` (linhas 161–180):
  - sem Resend configurado: retorna `null` sem criar token e sem revelar nada;
  - com Resend: cria token apenas para `{ email, emailVerifiedAt: null }`;
  - resposta da rota continua genérica: `"If the account is pending, a verification email will be sent"`.
- `scheduleVerificationEmail()` é chamado **somente** pela rota de reenvio, nunca pelo cadastro.

---

## 9. Contratos HTTP

| Rota | Sucesso | Observações |
| --- | --- | --- |
| `POST /api/auth/register` | `201 { data: { message } }` | idêntico para novo/existente; sem e-mail |
| `POST /api/auth/login` | `200 { data: user }` + cookie | não exige verificação |
| `POST /api/auth/change-password` | `200 { data: { message } }` | limpa cookie; `400 INVALID_PASSWORD` |
| `POST /api/auth/forgot-password` | `200` genérico | Resend-dependente |
| `POST /api/auth/reset-password` | `200` | token único, atômico |
| `POST /api/auth/resend-verification` | `200` genérico | opcional |
| `POST /api/auth/verify-email` | `200` | opcional |
| `GET /api/auth/me` | `200 { data: user }` | JWT + `sessionVersion` |
| `POST /api/logout` | `200` | revoga `sessionVersion` |

Erros preservam o contrato:

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }
```

`EMAIL_UNAVAILABLE` continua registrado em `lib/api-error.ts`, mas **não é mais emitido pelo cadastro**.

---

## 10. Segurança e riscos

- **Anti-enumeração no cadastro:** mesma resposta `201`, mesmo custo de bcrypt para novo/existente, duplicidade concorrente normalizada.
- **Anti-enumeração na recuperação:** `200` uniforme, token só quando há conta e provedor, falhas de envio engolidas.
- **Tokens:** apenas hash SHA-256 persistido; token bruto nunca retornado na resposta HTTP; expiração e uso único.
- **Rate limiting:** mantido em cadastro, login, alteração de senha, recuperação e reenvio.
- **Erros sanitizados:** categoria de falha de e-mail logada sem endereço, token ou senha.
- **Senhas:** bcrypt com custo 10; comparação segura; nunca logadas.
- **Risco do e-mail não verificado (identificador):**
  1. alguém cadastra um endereço que não controla;
  2. o endereço fica reservado;
  3. o verdadeiro proprietário pode não conseguir criar a própria conta;
  4. quem controla a caixa postal pode pedir recuperação e assumir a conta.
  
  O modelo híbrido **não resolve** esse risco sem confirmação de e-mail. Não foi introduzido takeover, reassociação nem exclusão automática. A limitação fica registrada como pendência para a 1.0 (seção 15).

---

## 11. Arquivos modificados

### Backend / rotas

- `server/auth/service.ts`
- `server/auth/session.ts`
- `app/api/auth/register/route.ts`

### Interface

- `features/auth/register-form.tsx`
- `features/auth/login-form.tsx`
- `features/auth/check-email.tsx`
- `features/auth/verify-email.tsx`
- `app/(auth)/check-email/page.tsx`
- `features/settings/password-form.tsx`

### Testes

- `tests/auth/register-login.test.ts`
- `tests/auth/email-hardening.test.ts`
- `tests/auth/token-transactions.test.ts`
- `tests/auth/session-me.test.ts`
- `tests/auth/password.test.ts`
- `tests/auth/login-failures.test.ts`
- `tests/auth/normalization.test.ts`
- `tests/auth/logout.test.ts`
- `tests/auth/auth-recovery-ui.test.tsx`
- `tests/mutations/concurrency.test.ts`
- `tests/e2e-perf/e2e-auth.spec.ts` (atualizado, **não executado**)

### Documentação

- `docs/POST_KUBUNTU_04_HYBRID_AUTH.md` (este arquivo)

---

## 12. Testes executados

Ambiente isolado:

- `tests/auth/helpers.ts` usa `MongoMemoryReplSet` e injeta `process.env.MONGODB_URI` com a URI em memória.
- Nenhum uso de Atlas, `save-state-dev` ou MongoDB compartilhado.
- Resend mockado/desativado; nenhum envio real.

Comandos:

```bash
pnpm typecheck
pnpm exec eslint <arquivos alterados>
pnpm exec vitest run tests/auth
pnpm exec vitest run            # suíte completa
git diff --check                # ruído CRLF pré-existente
```

Não executados (por restrição): `next dev`, Playwright, Lighthouse, seeds, migrações, criação de índices, envio Resend real.

---

## 13. Resultados

| Verificação | Resultado |
| --- | --- |
| `pnpm typecheck` | aprovado |
| ESLint nos arquivos alterados | aprovado (sem saída) |
| `vitest run tests/auth` | **134/134** em 12 arquivos |
| `vitest run` (completa) | **1395/1395** em 115 arquivos |
| Espaços reais em linhas adicionadas | 0 |
| `git diff --check` | apenas CRLF herdado (sem espaço real) |

Falhas observadas durante o trabalho:

- `tests/mutations/concurrency.test.ts` esperava 1 `EmailVerificationToken` no cadastro. Comportamento obsoleto após a mudança; teste atualizado para verificar 1 usuário, `emailVerifiedAt: null` e login imediato. Suíte voltou a passar.

---

## 14. Limitações

- E-mail não verificado não é prova de propriedade; existe risco de reserva indevida e de recuperação por terceiro.
- A recuperação por Resend depende de configuração e entrega do provedor; sem configuração ela falha silenciosamente do ponto de vista público.
- O teste E2E foi atualizado para o novo fluxo, mas não foi executado nesta fase.
- O working tree contém muitas modificações e line endings CRLF pré-existentes, não normalizados.

---

## 15. Pendências para produção

1. Definir política de verificação de e-mail na 1.0 (ex.: exigir confirmação para e-mails sensíveis ou para recuperação de senha).
2. Avaliar verificação de domínio/entrega e limites de taxa do Resend em produção.
3. Executar homologação E2E real em ambiente isolado (GATE 3B.2-AUTH) — não autorizado nesta tarefa.
4. Considerar notificação de "novo login"/auditoria sem introduzir features fora de escopo.
5. Revisar telas de confirmação/reenvio para manter a comunicação opcional consistente após testes em ambiente real.

---

## 16. Plano de homologação posterior

1. Subir ambiente isolado com MongoDB de teste e Resend mockado.
2. Executar `pnpm exec vitest run` e `pnpm typecheck` como baseline.
3. Executar a suíte Playwright de autenticação atualizada (`tests/e2e-perf/e2e-auth.spec.ts`).
4. Validar manualmente: cadastro → login imediato → logout → login → alteração de senha → sessão revogada → recuperação (com mock) → redefinição.
5. Verificar logs sem segredos/endereços.
6. Somente após aprovação, avaliar GATE 3B.2-B e qualquer operação remota.

Nada deste plano foi executado automaticamente.

---

**STATUS FINAL: CONCLUÍDO — autenticação híbrida implementada e validada localmente; nenhuma operação remota executada.**
