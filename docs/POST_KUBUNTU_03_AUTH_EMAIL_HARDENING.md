# POST-KUBUNTU-03 — Hardening do cadastro, verificação de e-mail e recuperação de senha

Data: 2026-11-14
Branch: `main`
HEAD de referência: `9aaa952bae0bbe0bfca5674d301b0284c44bc824`

> Este documento registra apenas alterações locais. Nenhuma conexão com Atlas, chamada real ao Resend, criação de usuário real, seed, migração, criação de índice, commit, push ou deploy foi executada.

---

## 1. Estado anterior

O fluxo de autenticação era funcional, mas apresentava fragilidades já apontadas na auditoria POST-KUBUNTU-02:

- `POST /api/auth/register` persistia o usuário e só depois criava o token de verificação.
- O envio do e-mail de verificação era agendado com `after()` após a resposta HTTP.
- Com `RESEND_API_KEY`/`EMAIL_FROM` ausentes, o cadastro ainda retornava `201`, embora a conta não pudesse ser ativada.
- `forgotPassword` aguardava o envio do e-mail. Uma falha do provedor podia produzir `500` somente para contas existentes.
- Falhas de e-mail eram registradas com informação genérica, sem distinguir configuração ausente, rejeição, timeout, rede ou erro desconhecido.
- O reenvio de verificação existia, mas não tratava explicitamente a indisponibilidade do provedor.

Restrições preservadas durante toda a intervenção:

- respostas públicas uniformes contra enumeração;
- tokens armazenados por hash SHA-256;
- expiração de tokens;
- consumo atômico;
- invalidação de sessão após redefinição de senha;
- rate limiting existente;
- contrato de erro `{ error: { code, message } }`;
- nenhuma alteração em `.env`, credenciais, dependências ou lockfile.

---

## 2. Problemas reproduzidos por testes

Os testes locais isolaram os seguintes comportamentos:

1. **Usuário órfão.** Ao forçar falha na criação de `EmailVerificationToken`, o usuário permanecia persistido.
2. **Token órfão.** Ao forçar falha na gravação do usuário, a execução não deveria criar token algum.
3. **Cadastro sem provedor.** Com `RESEND_API_KEY`/`EMAIL_FROM` ausentes, o cadastro seguia para persistência e respondia `201`.
4. **Recuperação de senha inconsistente.** Com o provedor rejeitando o envio, `forgotPassword` respondia `500`, o que diferia de endereços inexistentes.
5. **Observabilidade insuficiente.** Logs não distinguiam as categorias de falha.
6. **Reenvio sem guarda de configuração.** O endpoint criava token mesmo quando a entrega era impossível.

Dois testes falharam na primeira execução e exigiram correção:

- o agendamento chamava `after()` mesmo quando não havia job (endereço inexistente ou e-mail indisponível);
- um teste antigo ainda esperava `500` para falha de provedor em `forgotPassword`, comportamento deliberadamente alterado nesta tarefa.

Ambos foram corrigidos e a suíte foi reexecutada com sucesso.

---

## 3. Causas identificadas

| ID | Causa técnica |
| --- | --- |
| AUTH-E01 | Não havia verificação central de configuração do serviço transacional antes da persistência. |
| AUTH-E02 | `User.create` e `EmailVerificationToken.create` eram operações independentes, sem sessão compartilhada. |
| AUTH-E03 | `forgotPassword` aguardava `emailService.send` sem capturar a falha; a exceção chegava ao handler HTTP. |
| AUTH-E04 | O erro de e-mail não possuía categoria tipada; os logs usavam apenas `name`. |
| AUTH-E05 | `resendVerification` criava token sem checar se o serviço de e-mail estava configurado. |

---

## 4. Decisões arquiteturais

### 4.1 AUTH-E01 — Opção A

Foi escolhida a **Opção A**: impedir o cadastro público antes da persistência quando o serviço transacional não estiver configurado.

Justificativa:

- evita criar contas que jamais poderão ser ativadas;
- não exige nova coluna, estado de entrega ou mecanismo de reenvio automático;
- mantém a resposta uniforme para qualquer endereço, pois a checagem ocorre antes de qualquer consulta por e-mail;
- o erro `503 EMAIL_UNAVAILABLE` informa indisponibilidade do serviço, não existência de conta;
- `NODE_ENV=test` é tratado como configurado para preservar a suíte local sem credenciais.

A Opção B (aceitar o cadastro com entrega pendente) foi descartada por exigir comunicação adicional ao usuário e uma estratégia de recuperação mais ampla, aumentando o escopo.

### 4.2 AUTH-E02 — Transação MongoDB

Usuário e token de verificação são criados dentro de `withAuthTransaction`, reutilizando o padrão já existente no projeto. O envio de e-mail permanece fora da transação e após o commit.

### 4.3 AUTH-E03 — Política uniforme

`forgotPassword` mantém resposta genérica `200` em todos os casos:

- conta inexistente;
- conta existente com envio bem-sucedido;
- conta existente com falha do provedor;
- serviço de e-mail não configurado.

Falhas internas são registradas de forma sanitizada e não alteram a resposta HTTP.

### 4.4 AUTH-E05 — Reenvio

O reenvio mantém resposta genérica `200`. Quando o e-mail não está configurado, nenhum token é criado e a falha é registrada internamente. O endpoint específico continua sendo o caminho de recuperação; não foi adicionado envio automático no re-cadastro.

### 4.5 AUTH-E04 — Categorias tipadas

Foram introduzidas categorias sanitizadas:

- `EMAIL_NOT_CONFIGURED`
- `EMAIL_PROVIDER_REJECTED`
- `EMAIL_PROVIDER_TIMEOUT`
- `EMAIL_NETWORK_ERROR`
- `EMAIL_UNKNOWN_ERROR`

---

## 5. Arquivos alterados

| Arquivo | Natureza |
| --- | --- |
| `server/auth/email.ts` | Detecção central de configuração, erro tipado, classificação sanitizada e timeout explícito. |
| `server/auth/service.ts` | Guarda pré-persistência, transação usuário/token, política de recuperação e reenvio. |
| `server/auth/verification-email.ts` | Retorno antecipado sem job e log por categoria. |
| `lib/api-error.ts` | Novo código `EMAIL_UNAVAILABLE` mapeado para `503`. |
| `tests/auth/email-hardening.test.ts` | Nova cobertura de configuração, atomicidade, recuperação, reenvio e classificação. |
| `tests/auth/register-login.test.ts` | Ajuste para erro tipado e `User.prototype.save`. |
| `tests/auth/token-transactions.test.ts` | Expectativa de `500` corrigida para `200` na falha de provedor em recuperação. |
| `docs/POST_KUBUNTU_03_AUTH_EMAIL_HARDENING.md` | Este relatório. |

Nenhum modelo, rota, schema, configuração de banco, dependência ou arquivo de ambiente foi alterado.

---

## 6. Contratos HTTP

### `POST /api/auth/register`

| Situação | Status | Corpo |
| --- | --- | --- |
| Cadastro novo ou endereço já existente | `201` | mensagem genérica inalterada |
| E-mail não configurado | `503` | `{ "error": { "code": "EMAIL_UNAVAILABLE", "message": "Registration is temporarily unavailable" } }` |
| Payload inválido | `400` | contrato de validação existente |
| Rate limit | `429` | contrato existente |
| Falha interna | `500` | `INTERNAL_ERROR` sanitizado |

O `201` continua idêntico para endereços novos, pendentes e verificados. O `503` depende apenas do estado do serviço, não do endereço.

### `POST /api/auth/forgot-password`

| Situação | Status |
| --- | --- |
| Payload válido, qualquer endereço | `200` genérico |
| Provedor indisponível ou não configurado | `200` genérico |
| Payload inválido | `400` |
| Rate limit | `429` |

### `POST /api/auth/resend-verification`

| Situação | Status |
| --- | --- |
| Payload válido, qualquer endereço | `200` genérico |
| E-mail não configurado | `200` genérico, sem criação de token |
| Payload inválido | `400` |
| Rate limit | `429` |

---

## 7. Comportamento quando o Resend está ausente

- `isTransactionalEmailConfigured()` exige simultaneamente `RESEND_API_KEY` e `EMAIL_FROM` não vazios, exceto em `NODE_ENV=test`.
- Nenhuma chamada externa é feita para validar credenciais.
- Nenhum valor de variável é impresso.
- Cadastro: falha antes de `connectDatabase`, `findOne`, hash de senha e persistência, retornando `503`.
- Recuperação de senha: retorna `200` genérico, não cria token e registra `EMAIL_NOT_CONFIGURED`.
- Reenvio: retorna `200` genérico, não cria token e registra `EMAIL_NOT_CONFIGURED`.
- O caminho de verificação de e-mail permanece inalterado.

---

## 8. Comportamento quando o provedor rejeita o envio

- O serviço lança `EmailDeliveryError` com categoria `EMAIL_PROVIDER_REJECTED`.
- O cadastro já persistiu usuário e token de forma atômica; a resposta pública continua `201`.
- A recuperação de senha já criou o token antes do envio; a resposta pública continua `200`.
- O reenvio já criou o token; a resposta pública continua `200`.
- O log contém apenas `{ category, name }`.
- Nenhum corpo bruto do provedor, destinatário, token ou link é registrado.

Timeouts usam `AbortController` com limite de 10 segundos e categoria `EMAIL_PROVIDER_TIMEOUT`. Falhas de `fetch` são classificadas como `EMAIL_NETWORK_ERROR`. Qualquer outro erro cai em `EMAIL_UNKNOWN_ERROR`.

---

## 9. Garantias transacionais

`registerUserForPublicSignup` executa:

```text
withAuthTransaction
  ├── user.save({ session })
  └── EmailVerificationToken.create([token], { session })
```

- Falha na criação do token provoca rollback do usuário.
- Falha na criação do usuário impede a criação do token.
- Nenhum envio ocorre antes do commit; a entrega é agendada após a resposta.
- Conflito de e-mail duplicado retorna `null`, preservando o `201` genérico.
- Erros de índice único que não sejam de e-mail continuam propagando como `500`.

Limitação conhecida: transações exigem replica set. O ambiente de produção (Atlas) e os testes (`MongoMemoryReplSet`) atendem; um MongoDB standalone local não atenderia.

---

## 10. Reenvio e idempotência

- O endpoint permanece genérico e limitado por `FORGOT_PASSWORD_RATE_LIMIT` (5 requisições por 15 minutos por cliente/rota).
- Tokens consumidos não são reutilizados: a verificação usa `findOneAndDelete` e remove todos os tokens pendentes do usuário no mesmo commit.
- Reenvios concorrentes podem gerar mais de um token válido. Esse comportamento já era deliberado e testado; a supressão de envios duplicados exigiria persistir o token bruto ou introduzir um coordenador de entrega, o que está fora do escopo e alteraria o contrato atual.
- Cada link permanece válido até o primeiro consumo bem-sucedido, que invalida os demais.
- Não foi adicionado envio automático no re-cadastro.

---

## 11. Classificação de erros

Implementação em `server/auth/email.ts`:

- `classifyEmailFailure(error)`: retorna a categoria sem ler payloads.
- `emailFailureLogFields(error)`: retorna somente `{ category, name }`.
- `EmailDeliveryError`: carrega a categoria tipada.

Logs usados:

- `Verification email delivery failed`
- `Password reset email delivery failed`
- `Password reset email unavailable`
- `Verification resend unavailable`
- `Password reset committed but notification failed`

Nenhum log inclui e-mail de destinatário, token, URL de confirmação, header de autorização, payload ou resposta bruta.

---

## 12. Testes executados

### 12.1 Isolamento

- `tests/auth/helpers.ts` inicia `MongoMemoryReplSet` e injeta a URI em memória antes de `connectDatabase()`.
- Nenhum teste lê `MONGODB_URI` do ambiente de desenvolvimento.
- `connectDatabase()` é chamado somente após a URI de teste estar definida.
- `emailService.send` é mockado nos testes de falha; em `NODE_ENV=test` o envio real é no-op.
- Nenhuma chamada ao Resend, Atlas ou MongoDB compartilhado foi realizada.

### 12.2 Comandos

```bash
pnpm typecheck
pnpm exec eslint server/auth/email.ts server/auth/service.ts \
  server/auth/verification-email.ts lib/api-error.ts \
  tests/auth/email-hardening.test.ts tests/auth/register-login.test.ts \
  tests/auth/token-transactions.test.ts
pnpm exec vitest run tests/auth/email-hardening.test.ts \
  tests/auth/register-login.test.ts tests/auth/token-transactions.test.ts \
  tests/auth/login-failures.test.ts tests/auth/password.test.ts \
  tests/auth/session-me.test.ts
pnpm exec vitest run tests/auth
```

### 12.3 Resultados

| Verificação | Resultado |
| --- | --- |
| `pnpm typecheck` | aprovado, sem erros |
| ESLint nos arquivos tocados | aprovado, sem saída |
| Testes direcionados (6 arquivos) | 69/69 aprovados |
| Suíte completa `tests/auth` (12 arquivos) | 132/132 aprovados |

Cobertura relevante adicionada:

- configuração ausente vs. presente;
- `503` antes de qualquer escrita;
- rollback de usuário quando o token falha;
- ausência de token quando o usuário falha;
- duplicidade concorrente com um único usuário;
- `200` uniforme na recuperação sem e-mail;
- `200` uniforme com rejeição do provedor;
- reenvio sem token quando o e-mail não está configurado;
- classificação de rejeição, timeout, rede e erro desconhecido;
- logs sem endereço, token, senha ou URL.

### 12.4 `git diff --check`

O comando reporta “trailing whitespace” em massa porque arquivos pré-existentes no working tree usam CRLF enquanto o índice usa LF. A verificação das linhas efetivamente adicionadas, ignorando o `\r`, não encontrou espaço ou tab final. Nenhum arquivo teve line endings normalizados, para evitar diff massivo fora do escopo.

---

## 13. Regressões verificadas

Testado:

- cadastro, login, logout, sessão e `/me`;
- verificação de e-mail e consumo de token;
- redefinição de senha e invalidação de sessão;
- concorrência de cadastro e de tokens;
- falhas de banco em login;
- contratos de erro;
- classificação e sanitização de logs.

Não testado nesta etapa:

- entrega real pelo Resend;
- comportamento em Atlas;
- Vercel/serverless com `after()`;
- múltiplas instâncias com rate limiting em memória;
- navegador, Playwright ou Lighthouse.

---

## 14. Limitações

1. A validação de configuração não verifica se a credencial é válida; isso só ocorre em uma chamada real, deliberadamente não executada.
2. `NODE_ENV=test` ignora a ausência de credenciais; é uma exceção restrita ao ambiente de testes.
3. Transações exigem replica set.
4. Reenvios concorrentes podem criar múltiplos tokens válidos, limitados pelo rate limit.
5. O rate limiting continua em memória e não é distribuído.
6. Nenhuma homologação real de entrega foi realizada.

---

## 15. Pendências para homologação real

- Configurar `RESEND_API_KEY` e `EMAIL_FROM` em ambiente controlado.
- Validar entrega real de verificação e recuperação com domínio de teste.
- Confirmar comportamento de `after()` em execução Next.js/Vercel.
- Avaliar rate limiting distribuído antes de produção.
- Verificar transações em Atlas com a configuração real.
- Executar teste de fumaça end-to-end sem dados reais.
- Definir política de suporte para contas criadas antes desta correção que estejam sem token.

---

## 16. Gates ainda bloqueados

- **GATE 3B.2-AUTH:** não homologado isoladamente.
- **AUTH-R4:** não autorizado.
- **GATE 3B.2-B:** não autorizado.
- **POST-KUBUNTU-04:** homologação real do Resend não autorizada.

---

## 17. Veredito

Hardening implementado e validado localmente, com testes de autenticação aprovados e nenhuma operação remota executada. A homologação real de entrega de e-mail permanece pendente e explicitamente fora desta autorização.
