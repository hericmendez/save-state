# Save State — Prontidão de Produção (Vercel)

**Data da auditoria:** 09/11/2026  
**Repositório:** `C:\Users\Heric\Desktop\save-state`  
**Referência publicada:** `9aaa952` — `feat(reviews): complete markdown editor integration and UI refinement`  
**Branch de produção:** `main`  
**Escopo:** auditoria e planejamento. Nenhum deploy, commit, push ou alteração remota foi executado.

---

## Resumo executivo

**Veredito: NO-GO.**

O aplicativo está funcionalmente consistente — TypeScript, ESLint, 1.246 testes Vitest e build de produção passaram, o Review Editor foi validado 8/8 em servidor isolado e todos os assets de plataforma existem. Porém, o provisionamento de índices para um banco **novo** está quebrado no commit publicado. Em produção, `connectDatabase()` recusa o uso do banco quando um índice obrigatório está ausente; como o script de provisionamento não consegue criar os índices corretos em um banco vazio, a primeira publicação em um Atlas limpo falharia antes de servir qualquer rota.

O bloqueador é estreito e corrigível com uma alteração focada em `scripts/verify-indexes.ts`, seguida de validação em um banco vazio. Depois dessa correção e das condições listadas na seção 17, o veredito pode evoluir para **GO WITH CONDITIONS**.

### Contagem de achados

| Classificação | Quantidade |
|---|---:|
| BLOCKER | 1 |
| WARNING | 15 |
| INFO | 10 |

### O que foi executado

- Auditoria Git completa (raiz, branch, HEAD, `origin/main`, tracking, working tree, segredos).
- `tsc --noEmit`: 0 erros.
- ESLint: 0 erros, 7 warnings preexistentes em arquivos fora do escopo.
- Vitest completo: 102 arquivos, 1.246 testes aprovados.
- Build de produção do commit `9aaa952` em checkout isolado, sem tocar no `.next` do servidor em uso.
- E2E do Review Editor: 8/8 aprovados em servidor isolado de produção.
- Suíte E2E funcional completa: 63 aprovados, 1 ignorado, 16 reprovados (falhas ambientais, detalhadas na seção 2).
- Auditoria de 127 referências de assets e do `public/`.
- Verificação de índices e reprodução do erro de banco vazio (`listIndexes`, código 26).
- Auditoria estática de rotas, autenticação, rate limiting, IGDB/Twitch, Review Editor, SEO e configuração Next/Vercel.

### O que não foi executado

- Deploy na Vercel, criação de projeto, alteração de DNS ou de allowlist do Atlas.
- Criação, troca ou leitura de segredos remotos.
- `dropDatabase`, `deleteMany`, migração, seed ou limpeza de dados.
- Commit, push, reset, clean, rebase, amend ou force push.
- Testes Lighthouse/performance completos e matriz mobile dedicada.
- Testes E2E contra IGDB real (as credenciais usadas eram dummy).
- Homologação online (depende de deploy).

---

## 1. Estado Git

| Item | Resultado |
|---|---|
| Raiz do repositório | `C:/Users/Heric/Desktop/save-state` |
| Branch atual | `main` |
| HEAD local | `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |
| `origin/main` | `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |
| Tracking branch | `main` → `origin/main` |
| Remote | `git@github.com:hericmendez/save-state.git` |
| Working tree | Apenas as 4 modificações preexistentes |
| `git diff --check` | Limpo (sem erros de whitespace) |
| Arquivos rastreados no commit | 611 |

### Modificações locais preservadas (fora do deploy)

| Arquivo | Alterações |
|---|---:|
| `app/(app)/catalog/platforms/page.tsx` | 9 linhas |
| `features/catalog/editorial-platforms.ts` | 33 linhas |
| `features/navigation/nav-item.tsx` | 2 linhas |
| `tests/catalog/editorial-platforms.test.ts` | 168 linhas |

O código de referência para o deploy é exclusivamente o commit `9aaa952`. As quatro modificações locais não foram incluídas em nenhum artefato de build publicado e não devem ser commitadas como parte desta fase.

### Segredos no histórico recente

- Nenhum arquivo `.env`, `.env.local`, `.env.production`, `.pem` ou `.key` está rastreado.
- Nenhuma credencial real foi encontrada no commit de referência.
- A única ocorrência de string com formato de URI MongoDB é uma fixture de teste (`cluster0.example.mongodb.net`), sem credencial real.
- `.gitignore` cobre `.env`, `.env*.local`, artefatos E2E, `test-results/`, `lighthouse-report/` e arquivos de staging locais.

### Divergência inesperada

Não houve divergência entre o estado relatado e o estado publicado. HEAD local e `origin/main` apontam para o mesmo commit.

---

## 2. Resultado dos testes

### 2.1 Validações estáticas e unitárias

| Verificação | Comando | Resultado | Observação |
|---|---|---|---|
| TypeScript | `pnpm tsc --noEmit` | **Aprovado** (exit 0) | Sem erros |
| ESLint | `pnpm eslint .` | **Aprovado com ressalva** | 0 erros, 7 warnings preexistentes |
| Vitest | `pnpm vitest run` | **Aprovado** | 102 arquivos, 1.246/1.246 testes |
| Build de produção | `node next build` no checkout de `9aaa952` | **Aprovado** | 53 páginas geradas |

Os 7 warnings de ESLint estão em arquivos fora do escopo desta fase e não bloqueiam o build.

### 2.2 Build de produção

O build foi executado em um checkout isolado via `git archive 9aaa952`, com `node_modules` por junction, em uma porta e diretório `.next` próprios. O servidor do usuário na porta 3000 não foi tocado.

| Métrica | Resultado |
|---|---|
| Compilação | `✓ Compiled successfully in 29.4s` |
| Páginas geradas | 53 |
| Rota `/reviews/editor` | 6,89 kB / 142 kB first load |
| JS compartilhado | 103 kB |
| Necessidade de banco no build | Nenhuma (build passou com URI inalcançável) |
| Erros de compilação | 0 |

O build não exige conexão com MongoDB. A validação de ambiente ocorre em tempo de execução, no primeiro uso de `loadServerEnv()`/`connectDatabase()`.

### 2.3 E2E

| Execução | Resultado | Interpretação |
|---|---|---|
| Review Editor isolado | **8/8 aprovados** (15,6 s) | Fluxo do editor validado em servidor de produção isolado |
| Suíte funcional completa | **63 aprovados, 1 ignorado, 16 reprovados** | Falhas ambientais, não regressões de domínio |

As 16 falhas da suíte completa têm duas causas ambientais:

1. **Saturação do rate limit em memória.** A suíte cria e autentica muitos usuários a partir do mesmo IP (`127.0.0.1`); após cerca de 57 testes, os buckets de registro/login atingiram o limite e passaram a retornar HTTP 429. O log registra `RATE_LIMIT_EXCEEDED` em 15 ocorrências.
2. **Busca externa sem credenciais reais.** Os cenários que dependem de IGDB usaram `E2E_TWITCH_CLIENT_ID`/`E2E_TWITCH_CLIENT_SECRET` dummy, portanto não conseguiram concluir a busca real.

Nenhuma falha foi observada em criação de jogo, transações de review, biblioteca, coleções, Top 10, formulários ou matriz de viewport antes da saturação. O editor de review, que também aparece na suíte completa, foi reexecutado isoladamente e passou 8/8.

### 2.4 Testes não executados

| Teste | Motivo |
|---|---|
| Lighthouse / performance completa | Evitar carga desnecessária e múltiplos servidores |
| Matriz mobile dedicada (`mobile-matrix`) | Não necessária para responder ao bloqueador atual |
| E2E com IGDB real | Sem credenciais reais autorizadas |
| E2E de importação externa | Depende de provedor real (`E2E_TWITCH_*`) |
| Homologação online | Depende de deploy |

### 2.5 Flakiness conhecida

Existe um flake conhecido em `tests/search/edit-and-add-import.test.ts` (corrida de importação concorrente). Ele não se reproduziu nesta execução completa (1.246/1.246), mas permanece como risco de instabilidade de CI. Não foi enfraquecido nem mascarado.

---

## 3. Configuração correta da Vercel

### 3.1 Parâmetros do projeto

| Campo | Valor recomendado | Fundamento |
|---|---|---|
| Framework Preset | **Next.js** | App Router em Next.js 15.5.x |
| Git Repository | `hericmendez/save-state` | Remote confirmado |
| Production Branch | `main` | Branch publicada |
| Root Directory | `./` (raiz do repositório) | `package.json`, `app/`, `next.config.ts` e `pnpm-lock.yaml` estão na raiz |
| Package Manager | **pnpm** | `pnpm-lock.yaml` presente; `packageManager: pnpm@11.3.0` |
| Install Command | Padrão detectado (`pnpm install`) | Não sobrescrever sem necessidade |
| Build Command | `next build` (ou `pnpm build`, que executa o mesmo script) | `scripts.build = "next build"` |
| Output Directory | Padrão do Next.js (`.next`) | Não definir manualmente |
| Node.js Version | **24.x** | `.nvmrc` = `24`; ambiente local = v24.22.1 |
| Região das Functions | A mais próxima do cluster Atlas | Reduz latência de banco |
| `vercel.json` | Não é necessário | Nenhuma configuração adicional obrigatória |

### 3.2 Node.js: atenção ao `engines`

`package.json` declara `"engines": { "node": ">=22" }`. A Vercel interpreta esse intervalo como **Node 26.x** (última versão que satisfaz `>=22`), mesmo que o projeto esteja configurado para 24.x nas Project Settings — o `engines` tem precedência. O `.nvmrc` com `24` não é o mecanismo documentado de seleção de Node na Vercel.

**Risco:** o build e os testes locais foram validados em Node 24.22.1, não em Node 26. Ainda que Next.js 15.5 provavelmente funcione em Node 26, isso não foi validado nesta auditoria.

**Condição:** antes do deploy, escolher uma das opções:

1. Alterar `engines.node` para `"24.x"` em um commit revisado (recomendado); ou
2. Manter `>=22` e validar explicitamente o build e os E2E em Node 26 em um Preview Deployment.

### 3.3 pnpm e Corepack

A Vercel suporta pnpm 6–12. Para `lockfileVersion: 9.0`, a seleção automática padrão é pnpm 9 ou 10. O campo `packageManager: pnpm@11.3.0` só é honrado com Corepack habilitado (`ENABLE_EXPERIMENTAL_COREPACK=1`).

O `pnpm-workspace.yaml` é obrigatório para o projeto standalone:

```yaml
packages:
  - "."

allowBuilds:
  esbuild: true
  mongodb-memory-server: true
  unrs-resolver: true
```

O campo `allowBuilds` é específico de pnpm recente. Se a Vercel usar pnpm 9, ele pode ser ignorado; se usar pnpm 10/11, permite os scripts de build necessários. Para eliminar a variável, habilitar Corepack e fixar pnpm 11.3.0.

**Condição:** habilitar `ENABLE_EXPERIMENTAL_COREPACK=1` no projeto e confirmar no log de build a versão efetiva do pnpm. Sem isso, o build pode funcionar, mas não com a versão validada localmente.

### 3.4 Dependências nativas e portabilidade

| Item | Situação |
|---|---|
| `bcryptjs` | JavaScript puro; compatível com serverless |
| `jsonwebtoken` | JavaScript puro |
| `sharp` | Dependência oficial do Next para otimização de imagens; suportada pela Vercel |
| `mongodb-memory-server` | `devDependency`; instalada no build, mas não usada em produção |
| Caminhos absolutos Windows | Nenhum caminho `C:\` ou `C:/Users` em arquivos rastreados |
| Dependência do monorepo AGORA_VAI | Nenhuma dependência de código; apenas um comentário em `pnpm-workspace.yaml` |
| Arquivos fora da raiz Git | Nenhuma dependência identificada |

O projeto é autônomo na raiz publicada. O comentário `AGORA_VAI` em `pnpm-workspace.yaml` é histórico e não cria dependência de caminho.

### 3.5 Configuração de imagens

`next.config.ts` permite apenas:

- `https://images.igdb.com`
- `https://upload.wikimedia.org`

Não há host remoto curinga. Imagens fora da allowlist continuam como `<img>` simples. O `favicon.ico` está presente em `public/`.

---

## 4. Matriz de variáveis de ambiente

Todas as variáveis são server-side. **Não existe nenhuma variável `NEXT_PUBLIC_*`** no código.

| Variável | Obrigatória | Ambiente | Finalidade | Observações |
|---|---|---|---|---|
| `MONGODB_URI` | **Sim** | Production, Preview (runtime) | Conexão com MongoDB Atlas | Validada apenas como string não vazia; falha real ocorre no `connect` |
| `MONGODB_DB_NAME` | Não (default `save-state`) | Production, Preview (runtime) | Seleção explícita do banco MongoDB | Definir nomes diferentes se os ambientes compartilharem cluster |
| `JWT_SECRET` | **Sim** | Production, Preview (runtime) | Assinatura/verificação dos JWT | Mínimo 32 caracteres; sem verificação de entropia |
| `JWT_EXPIRES_IN` | Não (default `7d`) | Production, Preview | Expiração do JWT e `Max-Age` do cookie | Aceita formatos como `7d`, `12h`, `30m` |
| `APP_URL` | **Sim** | Production, Preview | Montar o link de reset de senha | Deve ser a URL pública final, sem barra final |
| `SEARCH_METHOD` | Não (default `IGDB`) | Production, Preview | Seleciona o provedor de busca | Valores: `IGDB` ou `ATP` |
| `ATP_BASE_URL` | Não | Production, Preview | Base URL do provedor ATP | Só é necessária se `SEARCH_METHOD=ATP` |
| `TWITCH_CLIENT_ID` | Não no boot / **Sim para IGDB** | Production, Preview | Client ID do Twitch/IGDB | Ausente → busca/importação IGDB falham com 500 |
| `TWITCH_CLIENT_SECRET` | Não no boot / **Sim para IGDB** | Production, Preview | Client Secret do Twitch/IGDB | Nunca deve ser exposta ao cliente ou logada |

### 4.1 `APP_URL`

Usos confirmados:

- `server/auth/service.ts`: `${APP_URL}/reset-password?token=...`.
- `playwright.config.ts` (somente testes).

Não é usada para cookies, redirects de autenticação, canonical ou metadata. Ainda assim, deve corresponder ao domínio definitivo para que links de reset (quando houver envio de e-mail) não apontem para localhost ou para um domínio errado. O schema atual valida apenas `min(1)`; uma URL com barra final geraria `//reset-password`. Recomenda-se validar como URL absoluta e normalizar.

### 4.2 `JWT_SECRET`

- Mínimo de 32 caracteres, validado por Zod em `lib/env.ts`.
- Ausente ou curto → `loadServerEnv()` lança erro; a aplicação falha fechada.
- Uso exclusivamente server-side (`server-only`).
- Cookie `token`: `httpOnly`, `SameSite=Lax`, `path=/`, `secure` quando `NODE_ENV=production`.
- Expiração padrão de 7 dias; `sessionVersion` é revalidado no banco a cada requisição autenticada.
- Trocar o segredo invalida todas as sessões existentes (assinaturas deixam de conferir).
- Não gerar nem substituir segredos automaticamente nesta fase.

### 4.3 Separação Production/Preview

Production e Preview devem ter valores **distintos** para `JWT_SECRET`, `MONGODB_URI` e credenciais Twitch. O nome do banco agora aceita `MONGODB_DB_NAME` tanto em `db/connection.ts` quanto em `scripts/verify-indexes.ts`; o default permanece `save-state`. Se os ambientes compartilharem cluster, configurar nomes diferentes explicitamente. O path da URI não substitui o `dbName` explícito passado ao Mongoose.

**Não criar `.env.production` com segredos no repositório.** Configurar tudo no painel da Vercel (Production e Preview separadamente).

---

## 5. Análise do MongoDB Atlas

### 5.1 Conexão e cache no ambiente serverless

`db/connection.ts` implementa:

- Cache global (`globalThis.__saveStateMongooseCache`) que sobrevive a hot reload em desenvolvimento.
- Reutilização da conexão estabelecida entre invocações.
- Single-flight: chamadas concorrentes compartilham a mesma promise de conexão.
- Limpeza do cache em caso de rejeição, permitindo retry em vez de envenenar a instância.
- Nunca abre uma conexão por requisição.

Esse padrão é adequado para funções serverless da Vercel. Cada instância de função mantém sua própria conexão; não há compartilhamento entre instâncias.

### 5.2 Pool e timeouts

`mongoose.connect(MONGODB_URI, { dbName: "save-state" })` não define:

- `maxPoolSize` (default do driver: 100 por instância);
- `minPoolSize`;
- `serverSelectionTimeoutMS`;
- `socketTimeoutMS`;
- `maxIdleTimeMS`.

Com muitas instâncias de função concorrentes, 100 conexões por instância podem esgotar o limite do cluster Atlas (especialmente em tiers compartilhados). Recomenda-se, no futuro, um pool pequeno (por exemplo, 5–10), `minPoolSize: 0` e timeouts explícitos. Não foi alterado nesta auditoria.

### 5.3 Runtime Node.js

As rotas que acessam MongoDB declaram `export const runtime = "nodejs"`. Não foi encontrada dependência de Edge Runtime incompatível com Mongoose ou transações. O health check também declara `nodejs`.

### 5.4 Transações

O Review Editor e as mutações de review usam `withReviewTransaction`, que exige replica set. O Atlas fornece replica set (inclusive no tier M0), portanto o requisito é atendido em produção. O MongoDB local standalone na porta 27017 **não** suporta transações; os testes usam o replica set `saveStateRs0` na porta 27027.

### 5.5 Acesso de rede Vercel → Atlas

Por padrão, as funções da Vercel saem por IPs dinâmicos; **não presuma IP de saída estático**. O Atlas exige liberar a origem na Network Access.

Opções, em ordem de preferência:

1. **IP estático / Secure Compute** (quando disponível no plano) e liberar apenas esses IPs.
2. **`0.0.0.0/0`** com mitigação compensatória: usuário de banco dedicado e restrito ao banco `save-state`, senha forte, rotação, alertas e monitoramento no Atlas. Registrar explicitamente o risco.
3. VPC peering / PrivateLink, se o plano e a topologia permitirem.

Não alterar a allowlist nesta fase. A escolha acima deve ser feita e registrada antes do deploy.

### 5.6 Banco de produção e dados mockados

- Os dados atuais são mockados e serão descartados, mas **não devem ser apagados agora**.
- Recomenda-se um cluster/projeto Atlas de produção separado, sem seeds de demonstração.
- Não executar `dropDatabase`, `deleteMany`, migração, seed ou reset de usuários sem autorização posterior.
- O nome do banco usa `MONGODB_DB_NAME`, com default compatível `save-state`; configure um nome por ambiente se compartilhar cluster.

### 5.7 Índices — bloqueador identificado

#### Como o gate funciona

Em `NODE_ENV=production`, `connectDatabase()` chama `verifyIndexes()` em modo somente leitura. Para cada modelo carregado na instância, ele lê `schema.indexes()`, filtra índices com semântica de integridade (`unique`, `sparse`, `partialFilterExpression`, `expireAfterSeconds`) e exige que existam no banco com as mesmas opções. Se faltar ou divergir, a conexão é recusada e a rota retorna erro.

Isso é uma decisão correta de fail-closed, mas torna o provisionamento prévio obrigatório.

#### Evidência do problema

Executado contra o replica set local, em coleção inexistente:

```text
listIndexes on missing collection:
ERROR code=26 name=MongoServerError
message=ns does not exist: save-state-e2e.definitely_not_created_audit
```

O script `scripts/verify-indexes.ts`:

- chama `coll.listIndexes()` sem tratar `NamespaceNotFound` (código 26);
- em um banco novo, falha na primeira coleção e não consegue criar nada;
- declara o índice legado `{ token: 1 }` unique para `PasswordResetToken`, mas o modelo declara `tokenHash` unique e `expiresAt` TTL;
- com `--create-missing --yes`, criaria o índice errado e omitiria `tokenHash` e o TTL;
- verifica apenas índices únicos, ignorando índices de performance declarados nos schemas;
- antes da correção, fixava `dbName: "save-state"`; agora usa `MONGODB_DB_NAME`/`--db-name`, preservando o default.

#### Impacto

- Em um Atlas novo e vazio, a primeira invocação de qualquer rota que carregue um modelo falha no gate (inclusive `listIndexes` em coleção ausente).
- As rotas de recuperação de senha falham mesmo que as demais coleções existam, porque `PasswordResetToken` exige `tokenHash` unique e `expiresAt` TTL.
- A aplicação não fica operacional apenas com o build verde; ela precisa de bootstrap de banco.

#### Lista correta de índices

Índices de integridade que o gate de produção exige (mínimo para o boot):

| Coleção | Chave | Opções | Motivo |
|---|---|---|---|
| `users` | `{ email: 1 }` | `unique` | Unicidade de e-mail |
| `globalgames` | `{ slug: 1 }` | `unique` | Identidade canônica |
| `globalgames` | `{ atpDomainId: 1 }` | `unique`, `sparse` | Identidade ATP |
| `globalgames` | `{ igdbId: 1 }` | `unique`, `sparse` | Identidade IGDB |
| `globalgames` | `{ name: 1 }` | `unique`, `partialFilterExpression: { source: "manual" }` | Dedup de jogos manuais |
| `usergames` | `{ userId: 1, gameId: 1 }` | `unique` | Uma entrada por usuário+jogo |
| `gamereviews` | `{ userGameId: 1 }` | `unique` | Review 1:1 opcional |
| `gamecollections` | `{ userId: 1, name: 1 }` | `unique` | Nome único por usuário |
| `passwordresettokens` | `{ tokenHash: 1 }` | `unique` | Token de reset único |
| `passwordresettokens` | `{ expiresAt: 1 }` | `expireAfterSeconds: 0` | Expiração automática (TTL) |

Índices de performance declarados nos schemas (não bloqueiam o boot, mas devem ser provisionados para evitar *collection scans*):

| Coleção | Chaves |
|---|---|
| `users` | `{ email: 1 }` |
| `globalgames` | `{ slug: 1 }`, `{ atpDomainId: 1 }`, `{ igdbId: 1 }`, `{ name: 1 }` (partial) |
| `usergames` | `{ userId: 1 }`, `{ gameId: 1 }`, `{ favorite: 1 }`, `{ finished: 1 }`, `{ fullyCompleted: 1 }`, `{ userId: 1, gameId: 1 }` unique, `{ userId: 1, lastFinishedAt: -1 }` |
| `gamereviews` | `{ userGameId: 1 }` unique, `{ userId: 1 }`, `{ userId: 1, updatedAt: -1 }` |
| `gamecollections` | `{ userId: 1 }`, `{ name: 1 }`, `{ userId: 1, name: 1 }` unique |
| `passwordresettokens` | `{ tokenHash: 1 }` unique, `{ userId: 1 }`, `{ expiresAt: 1 }` TTL |
| `activities` | `{ userId: 1 }`, `{ userId: 1, createdAt: -1 }`, `{ userId: 1, createdAt: -1, _id: -1 }`, `{ userId: 1, type: 1, createdAt: -1 }`, `{ userId: 1, userGameId: 1, createdAt: -1 }` |
| `usergamenotes` | `{ userId: 1 }`, `{ userGameId: 1 }`, `{ userGameId: 1, createdAt: -1 }`, `{ userId: 1, createdAt: -1 }` |

#### Procedimento seguro e idempotente proposto (não executado)

1. **Corrigir o script** para derivar os índices esperados diretamente de `model.schema.indexes()` (evita nova divergência) e filtrar os enforced para o gate.
2. Tratar `MongoServerError` com `code === 26` como “coleção ausente”: reportar todos os índices declarados como faltantes, sem abortar.
3. No modo `--create-missing --yes`, usar `Model.createIndexes()` (create-only, idempotente) por modelo. **Nunca** usar `syncIndexes()`/`dropIndex()`, que são destrutivos.
4. Permitir o nome do banco via URI ou variável de ambiente, em vez de fixar `save-state`.
5. Executar o provisionamento a partir de uma máquina de confiança ou job de CI, com usuário que tenha privilégio de `createIndex`, **antes** de apontar o tráfego para o banco.
6. Executar novamente em modo somente leitura (`pnpm db:indexes`) e exigir `OK`.
7. Só então fazer o deploy.

Esboço da correção (apenas referência, não aplicada):

```ts
// scripts/verify-indexes.ts — trecho conceitual
const MODELS = { User, GlobalGame, UserGame, GameReview, GameCollection, PasswordResetToken };

for (const [name, model] of Object.entries(MODELS)) {
  let existing: Array<Record<string, unknown>>;
  try {
    existing = await model.collection.listIndexes().toArray();
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 26) existing = [];
    else throw error;
  }

  const declared = model.schema.indexes() as Array<[Record<string, number>, Record<string, unknown>?]>;
  // ... comparar apenas opções enforced; no modo create, model.createIndexes()
}
```

### 5.8 Erros e observabilidade

- `connectDatabase()` loga a falha do gate sem expor a URI.
- `handleRoute` converte erros desconhecidos em `INTERNAL_ERROR` sanitizado e não inclui stack em produção.
- O logger redige chaves sensíveis e credenciais embutidas em URIs.
- O health check (`/api/health`) retorna apenas `{"status":"ok"}`; não verifica MongoDB. Um deploy pode parecer saudável enquanto o banco está inacessível. Recomenda-se um readiness check separado, autenticado ou restrito, que valide a conexão.

---

## 6. Segurança da autenticação

### 6.1 Cadastro, login e logout

| Fluxo | Comportamento |
|---|---|
| Cadastro | `POST /api/auth/register`; rate limit; não cria sessão (comportamento legado) |
| Login | `POST /api/auth/login`; valida credenciais; assina JWT; grava cookie `token` |
| Logout | `POST /api/logout`; limpa o cookie; **não** incrementa `sessionVersion` |
| Sessão | `getSessionUser` / `getCurrentSession`; valida assinatura, expiração e `sessionVersion` no banco |
| Troca de senha | `POST /api/auth/change-password`; exige sessão; incrementa `sessionVersion` |
| Reset de senha | `POST /api/auth/reset-password`; incrementa `sessionVersion` |

### 6.2 Cookies e JWT

- Nome: `token`.
- `httpOnly: true`.
- `sameSite: "lax"`.
- `path: "/"`.
- `secure: process.env.NODE_ENV === "production"` (HTTPS na Vercel).
- `maxAge` derivado de `JWT_EXPIRES_IN` (default 7 dias).
- JWT contém `{ userId, sessionVersion }`; nunca contém senha ou e-mail.
- Toda requisição autenticada revalida o usuário e o `sessionVersion` no banco.
- Logout não invalida o token no servidor; um cookie roubado continua válido até expirar. É uma decisão intencional (ADR-019), mas deve ser aceita explicitamente para produção.

### 6.3 Rotas protegidas

Todas as rotas de API exigem sessão, exceto:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/health`
- `POST /api/logout`

As páginas do grupo `app/(app)` são protegidas por `app/(app)/layout.tsx`, que resolve a sessão no servidor e redireciona para `/login` quando ausente. As páginas de `app/(auth)` redirecionam usuários autenticados para `/home`.

Não há `middleware.ts`; a proteção é feita nos layouts/server components e nas rotas. Isso é consistente, mas significa que qualquer nova página fora de `(app)` precisa ser protegida explicitamente.

### 6.4 Propriedade de dados

- `UserGame`, `GameReview`, `GameCollection`, `UserGameNote` e `Top10` são sempre consultados com `userId` da sessão.
- Reviews resolvem propriedade pelo `UserGame` pai, nunca apenas pelo `GameReview`.
- Não foi encontrada rota que aceite `userId` do cliente para leitura/escrita de dados de outro usuário.

### 6.5 Rate limiting

Detalhado na seção 7. Resumo: proteção local em memória, não distribuída.

### 6.6 Headers de segurança

Não há configuração de headers no `next.config.ts` nem em `vercel.json`:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Frame-Options` / `frame-ancestors`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`

A Vercel adiciona alguns headers de plataforma, mas não substitui uma política de CSP/HSTS. Classificado como WARNING para o primeiro deploy público.

### 6.7 Erros e vazamento de informação

- Erros de API seguem `{ error: { code, message } }`.
- Erros desconhecidos são sanitizados como `INTERNAL_ERROR`.
- Stack traces só são logadas fora de produção.
- O logger redige tokens, cookies, autorização, senhas e credenciais de URI.
- `forgot-password` responde de forma genérica, sem revelar existência de conta.
- O token de reset nunca é retornado na resposta HTTP nem logado.

### 6.8 Exportação CSV

`GET /api/auth/export/csv` exige sessão e exporta apenas os dados do usuário. O escape cobre vírgula, aspas e quebras de linha, mas **não neutraliza fórmulas** iniciadas por `=`, `+`, `-` ou `@`. Um review ou nome de jogo pode, ao abrir o CSV no Excel, ser interpretado como fórmula. Classificado como WARNING; a correção é prefixar esses valores com `'` ou tabulação.

### 6.9 CSRF

As mutações usam JSON e o cookie é `SameSite=Lax`. Formulários cross-site não enviam o cookie em POST, o que mitiga CSRF clássico. Não há token CSRF explícito. Para o desenho atual (SPA same-origin), o risco é baixo; registrar como INFO/WARNING conforme o nível de rigor desejado.

---

## 7. Riscos do rate limiting

### 7.1 Implementação atual

`server/auth/rate-limit.ts`:

- Armazena buckets em um `Map` no processo.
- Janela fixa (`windowMs`) por chave `{clientIp}:{routeKey}`.
- Chave de IP obtida do primeiro valor de `x-forwarded-for`.
- Em `NODE_ENV=test`, é no-op.
- Limites:

| Rota | Janela | Máximo |
|---|---:|---:|
| `POST /api/auth/register` | 15 min | 20 |
| `POST /api/auth/login` | 15 min | 20 |
| `POST /api/auth/forgot-password` | 15 min | 5 |
| `POST /api/auth/reset-password` | 15 min | 10 |
| `POST /api/auth/change-password` | 15 min | 5 |

### 7.2 Comportamento em serverless

- Cada instância de função tem seu próprio `Map`. Com N instâncias, o limite efetivo é aproximadamente N × max.
- Cold starts zeram os buckets.
- Não há coordenação entre regiões.
- Usuários atrás do mesmo NAT/proxy compartilham o bucket e podem bloquear uns aos outros.
- O primeiro valor de `x-forwarded-for` é usado; a Vercel define esse header, mas a confiança cega nele é um risco residual.

### 7.3 Evidência prática

A própria suíte E2E saturou os buckets após ~57 testes, retornando 429 em registros/logins subsequentes. Isso demonstra que o mecanismo funciona localmente, mas também que ele é sensível ao volume e ao compartilhamento de IP.

### 7.4 Classificação e recomendação

**WARNING**, não BLOCKER, para o primeiro deploy controlado:

- As rotas mais sensíveis (login, registro, reset) têm alguma proteção.
- O risco é de bypass distribuído e de bloqueio legítimo por NAT, não de execução remota.
- Para produção pública, recomenda-se rate limiting distribuído (ex.: Vercel WAF, Upstash Redis ou equivalente) ou, no mínimo, limites por conta/e-mail além de IP.
- Não implementar Redis/serviço externo nesta fase sem autorização.

---

## 8. Situação do fluxo de recuperação de senha

### AUTH-01 (implementação em andamento)

O código agora exige `User.emailVerifiedAt`, usa `EmailVerificationToken` (SHA-256, TTL schema, token de 32 bytes, consumo atômico por POST) e adiciona as telas de confirmação, recuperação e redefinição. O envio usa Resend via `RESEND_API_KEY` e `EMAIL_FROM`; o sucesso da API significa aceitação pelo provedor, não entrega na caixa postal. Nenhum envio real foi homologado.

`APP_URL` deve ser a URL canônica de cada ambiente Vercel (Production e Preview), validada como URL absoluta e HTTPS em produção. Configure remetente em domínio controlado e verificado pelo Resend, incluindo SPF/DKIM (e DMARC recomendado). Não use domínio ou credencial fictícios.

Bancos com usuários existentes sem `emailVerifiedAt` passam a tratá-los como pendentes; planejar ativação por confirmação/reconvite para dados que devam ser preservados. Não executar backfill automático. Índices de `EmailVerificationToken` devem ser provisionados pelo verificador schema-driven (`pnpm db:indexes -- --create-missing`), nunca manualmente.

**W-06 permanece pendente:** o rate limit em memória é por instância e não oferece proteção distribuída em Vercel. Antes de uso público, configurar WAF/limites distribuídos ou equivalente, sem que esta fase contrate infraestrutura. W-07 é resolvido no código, condicionado a configurar e homologar o provedor; W-13 está parcialmente resolvido pela validação/normalização de `APP_URL`, mas requer valores corretos em Production e Preview.

### 8.1 O que está implementado

- `POST /api/auth/forgot-password`: valida e-mail, aplica rate limit, gera token aleatório de 32 bytes, armazena apenas o SHA-256 (`tokenHash`), define `expiresAt` de 1 hora e invalida tokens anteriores do usuário.
- `POST /api/auth/reset-password`: valida token, `used: false` e `expiresAt > agora`; marca como usado; atualiza o hash da senha e incrementa `sessionVersion`.
- Resposta genérica anti-enumeração no forgot.
- Token nunca aparece em resposta HTTP ou log.

### 8.2 O que falta

- **Não há envio real de e-mail.** `server/auth/email.ts` é um serviço de console: registra destinatário e assunto, mas não envia nada. O corpo com o link nem é logado.
- **Não existe página `/reset-password`.** O link gerado (`${APP_URL}/reset-password?token=...`) aponta para uma rota que não existe no App Router.
- **Não há link “Esqueci minha senha”** na tela de login.
- Portanto, a recuperação de senha **não é uma funcionalidade utilizável pelo usuário final**, apesar das APIs e dos testes passarem.

### 8.3 Classificação e opções

**WARNING** para lançamento controlado, desde que não seja anunciada como funcional. Opções:

1. **Ocultar/desabilitar temporariamente** as rotas e não mencionar recuperação de senha no lançamento; ou
2. **Completar o fluxo** antes de anunciar: provedor de e-mail (Resend/SES/Postmark), página `/reset-password`, link no login e testes E2E.

Não implementar nenhuma das opções nesta fase. Não anunciar recuperação de senha funcional enquanto não houver envio real.

### 8.4 `APP_URL` e o link

O link é montado com `APP_URL`. Se `APP_URL` estiver ausente, `loadServerEnv()` falha. Se estiver errado (localhost, domínio antigo, barra final), o link fica inutilizável. Como não há envio, o impacto atual é latente.

---

## 9. Integração IGDB/Twitch

### 9.1 Obtenção e renovação de token

`server/search/twitch-token.ts`:

- Client credentials flow em `https://id.twitch.tv/oauth2/token`.
- Token em cache em memória com margem de 60 s antes da expiração.
- Single-flight: chamadas concorrentes compartilham a mesma promise de refresh.
- Timeout de 10 s.
- `invalidateTwitchToken()` permite recuperação em 401.
- Nenhum token ou segredo é logado.
- Cache é por instância de função; em serverless, cada instância pode buscar seu próprio token. Isso aumenta levemente o volume de chamadas ao Twitch, mas é aceitável.

### 9.2 Cliente IGDB

`server/search/igdb-client.ts`:

- `POST https://api.igdb.com/v4/<endpoint>` com Apicalypse.
- Headers `Client-ID` e `Authorization: Bearer`.
- 401 → invalida token e tenta novamente **uma vez**.
- 429 → `RATE_LIMIT_EXCEEDED` (429).
- 5xx, timeout e falha de conexão → `IGDB_UNAVAILABLE` (503).
- 4xx de query → `INTERNAL_ERROR` com log server-side.
- Throttle serializado: mínimo de 250 ms entre inícios (4 req/s) por instância.
- Timeouts: busca/detalhe 10 s; capa 15 s.
- Escape de aspas para Apicalypse.

### 9.3 Comportamento sem credenciais

`TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET` são opcionais no boot. Quando a busca IGDB é acionada sem elas:

- `requireTwitchConfig()` lança `INTERNAL_ERROR` com mensagem “IGDB integration is not configured”.
- A UI deve exibir erro recuperável; a busca não funciona.
- `SEARCH_METHOD` default é `IGDB`, então esse é o caminho padrão.

**Condição:** configurar as credenciais em Production e Preview e validar uma busca real + importação antes de divulgar o app.

### 9.4 Riscos serverless

| Risco | Avaliação |
|---|---|
| Throttle por instância | Com múltiplas instâncias, o limite global de 4 req/s não é garantido |
| Cache de token por instância | Mais chamadas ao Twitch; sem impacto funcional relevante |
| Timeouts | Adequados para o primeiro deploy |
| Falha externa | Mapeada para 429/503; UI precisa tratar |
| Segredos | Server-only, sem exposição ao cliente ou logs |

### 9.5 Testes

Os testes unitários de IGDB/Twitch passam na suíte Vitest. Os E2E que dependem de IGDB real não foram executados por falta de credenciais autorizadas. A importação externa permanece como validação obrigatória na homologação online.

---

## 10. Review Editor

### 10.1 Arquitetura

- `GameReview` é a fonte canônica do Markdown completo.
- `UserGame.reviewExcerpt` é derivado (≈250 caracteres, texto plano).
- Criação/edição/exclusão usam transação Mongoose (`withReviewTransaction`), exigindo replica set — atendido pelo Atlas.
- A propriedade é resolvida via `UserGame` pai, nunca apenas pelo `GameReview`.
- `GET /api/games/:gameId/review` entrega o conteúdo completo sob demanda; listas continuam usando o excerpt.
- O endpoint de review exige sessão e valida o `gameId`.

### 10.2 Cliente e rascunhos

- `/reviews/editor` é uma página independente, protegida por `app/(app)/layout.tsx`.
- Rascunhos vivem em **IndexedDB**, escopados por `userId` obtido de `GET /api/auth/me`.
- Autosave com debounce de 500 ms e controle de concorrência otimista (OCC).
- `BroadcastChannel` sincroniza abas sem trafegar o Markdown; o IndexedDB é a fonte de verdade.
- Recuperação de rascunhos, conflitos e falha de armazenamento têm estados explícitos.
- Limite de 20.000 caracteres (`REVIEW_CONTENT_MAX_LENGTH`).
- Tiptap é carregado com `next/dynamic` e `ssr: false`; páginas comuns não pagam o bundle.
- Prévia é somente leitura; imagens externas passam por allowlist `http(s)`/`mailto` e `stripUnsafePreviewImages`.
- Não há escrita em disco no servidor.
- Não há injeção de HTML bruto no preview.

### 10.3 Produção

- IndexedDB e BroadcastChannel dependem do navegador, não da Vercel; não há estado de review em disco de função.
- A persistência definitiva é MongoDB Atlas, com transação.
- O build de `/reviews/editor` é 6,89 kB / 142 kB first load; o editor Tiptap é lazy.
- E2E dedicado: 8/8 aprovados em servidor de produção isolado.

**Classificação: INFO.** Nenhum bloqueador específico do Review Editor foi encontrado. O único ponto de dependência é o provisionamento de índices (`GameReview.userGameId` unique) e o replica set do Atlas, ambos cobertos pelas seções 5 e 13.

---

## 11. Assets e performance

### 11.1 Assets locais

| Métrica | Resultado |
|---|---|
| Referências de plataforma verificadas | 127 |
| Referências ausentes | 0 |
| `public/platforms/manifest.json` | Presente |
| Arquivos em `public/` | 135 |
| Tamanho total de `public/` | 4,4 MB |
| `favicon.ico` | Presente |
| Maior arquivo | `public/platforms/3do/logo.png` (247 KB) |

Todos os caminhos locais (`/platforms/...`, `/wallpaper.jpg`, `/toriel.png`) resolvem após a separação do monorepo. Não há referência quebrada.

### 11.2 Imagens remotas

- `images.igdb.com` e `upload.wikimedia.org` estão na allowlist.
- `sharp` está instalado; a Vercel oferece o runtime de otimização.
- A otimização de imagens na Vercel consome cota do plano (Image Optimization). Para um lançamento pequeno, o volume tende a ser baixo; monitorar.

### 11.3 Bundles e rotas

| Métrica | Resultado |
|---|---|
| Páginas geradas | 53 |
| JS compartilhado | 103 kB |
| `/reviews/editor` first load | 142 kB |
| Editor Tiptap | Lazy, `ssr: false` |
| Rotas dinâmicas | Sim (`ƒ`) para páginas autenticadas |

Não foram identificados trabalhos de servidor caros no build nem no carregamento inicial. O maior custo potencial é a busca IGDB (throttle e timeouts já definidos) e a revalidação de sessão no banco a cada requisição.

### 11.4 Observações

- `public/vendor/rpgui/rpgui.js` permanece no disco como referência, mas não é carregado.
- O CSS do RPGUI é importado globalmente; é um custo aceitável e já validado.
- Não foram executadas otimizações nesta fase.

---

## 12. SEO e comportamento público

### 12.1 Metadata

- `app/layout.tsx` define `title: "Save State"` e uma descrição curta.
- `/reviews/editor` define título e descrição próprios.
- As demais páginas não têm metadata específica.
- `lang="en"` no `<html>`, embora a interface esteja em português. É uma inconsistência de acessibilidade/SEO.
- Não há `metadataBase`, Open Graph, Twitter Card ou URL canônica.

### 12.2 Robots, sitemap e indexação

- Não existe `public/robots.txt` nem `app/robots.ts`.
- Não existe `sitemap.xml` nem `app/sitemap.ts`.
- Não há header `X-Robots-Tag: noindex` nem metadata `robots: { index: false }`.
- As páginas privadas são protegidas por sessão, mas URLs podem ser descobertas e indexadas se houver links externos. Como o app é quase todo autenticado, o risco é baixo, mas a ausência de `noindex` é uma lacuna de privacidade/SEO.

### 12.3 Páginas de erro e 404

- `app/not-found.tsx` existe e é amigável.
- `app/(app)/error.tsx` cobre erros do grupo autenticado.
- Não há `app/global-error.tsx` nem tratamento de erro nas páginas de `(auth)`. Em caso de falha no login/registro, o usuário pode ver a tela padrão do Next.
- Não há página 500 customizada.

### 12.4 Redirecionamentos e links

- Usuários não autenticados em `(app)` → `/login`.
- Usuários autenticados em `(auth)` → `/home`.
- Redirects de compatibilidade PT → EN estão no `next.config.ts`.
- Não há links absolutos hardcoded (exceto o link de reset, dependente de `APP_URL`).
- Não há URLs canônicas.

### 12.5 Classificação

**WARNING** para SEO/indexação: adicionar `robots.txt` com `Disallow: /` (ou pelo menos `noindex` nas páginas privadas), corrigir `lang` para `pt-BR` e definir metadata básica antes de um lançamento público amplo. Para um lançamento controlado por convite, o risco é aceitável.

---

## 13. Bloqueadores e achados consolidados

### 13.1 BLOCKER

#### B-01 — Provisionamento de índices quebrado para banco novo

**Descrição:** `scripts/verify-indexes.ts` não trata coleções ausentes (`listIndexes` → código 26), declara o índice legado `{ token: 1 }` em vez de `tokenHash`/TTL e não provisiona todos os índices declarados. Com um Atlas novo, o gate de produção do `connectDatabase()` falha e a aplicação não serve nenhuma rota que carregue modelos.

**Evidências:**

- `listIndexes` em coleção inexistente: `MongoServerError code=26`, `ns does not exist`.
- `db/models/password-reset-token.ts`: `tokenHash` unique + `expiresAt` TTL.
- `scripts/verify-indexes.ts` linha 53: `{ token: 1 }` unique.
- `db/connection.ts`: em `NODE_ENV=production`, `verifyIndexes()` exige os índices enforced e recusa a conexão se faltarem.
- A verificação somente leitura passa apenas porque o banco usado já tinha índices criados por desenvolvimento/testes; ela não prova bootstrap.

**Impacto:** primeira publicação em banco limpo falha; recuperação de senha falha mesmo com as demais coleções presentes.

**Correção mínima:**

1. Derivar os índices esperados de `schema.indexes()` ou corrigir a lista `EXPECTED`.
2. Tratar `code === 26` como coleção vazia.
3. No modo de criação, usar `Model.createIndexes()` (create-only/idempotente).
4. Incluir `tokenHash` unique e `expiresAt` TTL.
5. Validar em um banco **vazio**: provisionar, rodar a verificação read-only e só então conectar com `NODE_ENV=production`.
6. Executar os E2E de review/reset contra esse banco.

**Critério de saída:** script corrigido, banco vazio provisionado, verificação read-only `OK`, rotas de login/registro/home/review/reset operando com `NODE_ENV=production`.

### 13.2 WARNINGs

| ID | Achado | Impacto | Mitigação/condição |
|---|---|---|---|
| W-01 | `engines.node: ">=22"` → Node 26.x na Vercel | Build/testes validados em Node 24 | Alterar para `24.x` ou validar em Node 26 |
| W-02 | pnpm 11 só com Corepack; lockfile 9.0 seleciona pnpm 9/10 | Build pode usar versão não validada | `ENABLE_EXPERIMENTAL_COREPACK=1` e conferir log |
| W-03 | Egress da Vercel é dinâmico; Atlas exige allowlist | Necessidade de `0.0.0.0/0` ou IP estático | Usuário restrito, senha forte, monitoramento; registrar risco |
| W-04 | Production e Preview podem compartilhar banco se `MONGODB_DB_NAME` não for separado | Dados de Preview podem afetar Production | Configurar nomes distintos ou clusters separados |
| W-05 | Pool/timeouts do Mongoose não configurados (default 100/conexão) | Risco de esgotar conexões do Atlas | `maxPoolSize` 5–10, `serverSelectionTimeoutMS`, timeouts |
| W-06 | Rate limiting em memória, por instância | Bypass distribuído, bloqueio por NAT, reset em cold start | WAF/Redis ou limites por conta; não implementar agora |
| W-07 | Recuperação de senha sem envio de e-mail e sem página `/reset-password` | Funcionalidade não utilizável | Ocultar/desabilitar ou completar antes de anunciar |
| W-08 | Sem CSP/HSTS/X-Frame-Options/Referrer-Policy | Superfície de segurança menor | Adicionar headers no `next.config.ts` ou Vercel |
| W-09 | Logout não incrementa `sessionVersion` | Token roubado válido até expirar (7d) | Aceitar explicitamente ou revisar ADR-019 |
| W-10 | CSV sem neutralização de fórmulas (`=`, `+`, `-`, `@`) | Fórmula maliciosa ao abrir no Excel | Prefixar células suspeitas |
| W-11 | Sem `robots.txt`, `sitemap`, `noindex`; `lang="en"` | Indexação de páginas privadas, SEO fraco | `robots.txt`/`noindex`, `lang="pt-BR"`, metadata |
| W-12 | `/api/health` não verifica MongoDB | Deploy “saudável” com banco fora | Readiness check separado |
| W-13 | `APP_URL` validada apenas como string | Link de reset com barra dupla/URL inválida | Validar URL absoluta e normalizar |
| W-14 | Twitch opcional no boot | Busca/importação falham com 500 se não configurado | Configurar e validar busca real |
| W-15 | Suíte E2E completa não fica verde sem credenciais reais e isolamento de rate limit | Cobertura de homologação incompleta | Executar com credenciais e banco/servidor limpos |

### 13.3 INFOs

| ID | Observação |
|---|---|
| I-01 | Não há `app/global-error.tsx`; apenas `app/(app)/error.tsx` |
| I-02 | `/activity-preview` é uma rota pública de preview com dados mockados, não linkada |
| I-03 | `lang="en"` no layout raiz, interface em PT-BR |
| I-04 | Comentário `AGORA_VAI` em `pnpm-workspace.yaml` é apenas histórico |
| I-05 | Não existe `.env.example` versionado |
| I-06 | Flake conhecido em `tests/search/edit-and-add-import.test.ts` |
| I-07 | Otimização de imagens da Vercel consome cota do plano |
| I-08 | Cache de token Twitch e throttle IGDB são por instância |
| I-09 | Ausência de `middleware.ts` é intencional; proteção via layouts/rotas |
| I-10 | Não há `vercel.json`; configuração padrão é suficiente |

---

## 14. Procedimento de deploy (A–D)

> **Pré-requisito absoluto:** B-01 corrigido e validado em banco vazio. Sem isso, o deploy falhará em produção.

### Etapa A — Configuração

1. **Importar o repositório**
   - Vercel → **Add New** → **Project** → **Import Git Repository**.
   - Selecionar `hericmendez/save-state`.
   - Autorizar o acesso ao repositório, se necessário.

2. **Configurar o projeto**
   - **Framework Preset:** Next.js.
   - **Root Directory:** `./` (raiz do repositório).
   - **Build Command:** padrão (`next build` ou `pnpm build`).
   - **Install Command:** padrão (`pnpm install`).
   - **Output Directory:** padrão (`.next`).
   - **Node.js Version:** 24.x.
   - **Região:** a mais próxima do cluster Atlas.

3. **Habilitar Corepack (recomendado)**
   - Criar a variável `ENABLE_EXPERIMENTAL_COREPACK=1` no projeto.
   - Confirmar no log de build que o pnpm usado é 11.3.0.
   - Alternativa: remover a dependência de pnpm 11 e validar com pnpm 9/10.

4. **Configurar variáveis de ambiente**
   - Em **Settings → Environment Variables**, criar separadamente para **Production** e **Preview**:
     - `MONGODB_URI`
     - `JWT_SECRET` (≥ 32 caracteres, distinto por ambiente)
     - `APP_URL`
     - `SEARCH_METHOD=IGDB`
     - `TWITCH_CLIENT_ID`
     - `TWITCH_CLIENT_SECRET`
   - Opcionais: `JWT_EXPIRES_IN=7d`, `ATP_BASE_URL` (somente se ATP).
   - Não colar segredos em arquivos versionados.

5. **Configurar `APP_URL`**
   - Production: URL pública definitiva (ex.: o domínio customizado, sem barra final).
   - Preview: URL de preview estável ou o domínio de produção, conforme a política de links de reset.
   - Lembrar: Preview deployments têm URLs dinâmicas; um único `APP_URL` não cobre todas.

6. **Preparar o banco de produção**
   - Criar um projeto/cluster Atlas separado para produção.
   - Criar um usuário de banco dedicado, com acesso restrito ao banco `save-state`.
   - Configurar a Network Access conforme a seção 5.5.
   - Não executar seeds de demonstração.
   - Não apagar os dados mockados atuais.

7. **Provisionar índices**
   - Corrigir `scripts/verify-indexes.ts` conforme B-01.
   - Executar o provisionamento contra o banco de produção com um usuário que possa criar índices:

     ```bash
     MONGODB_URI="<uri-de-producao>" pnpm db:indexes -- --create-missing --yes
     ```

   - Executar a verificação somente leitura:

     ```bash
     MONGODB_URI="<uri-de-producao>" pnpm db:indexes
     ```

   - Exigir `OK: all declared unique indexes present and compatible`.
   - Conferir que `passwordresettokens` tem `tokenHash` unique e `expiresAt` TTL.

8. **Conferir a integração IGDB**
   - Validar as credenciais Twitch em um ambiente controlado.
   - Fazer uma busca e uma importação de teste.
   - Confirmar que nenhum token aparece nos logs.

### Etapa B — Primeiro deploy

1. **Iniciar o deploy**
   - Com o commit `9aaa952` em `main`, a Vercel cria o deployment de produção automaticamente.
   - Alternativa: **Deployments → Redeploy** do commit, ou **Deploy** a partir do dashboard.
   - Não fazer deploy das quatro alterações locais.

2. **Acompanhar os logs**
   - Build: instalação, compilação, geração estática.
   - Functions: primeiras invocações, erros de conexão, gate de índices.
   - Procurar por `Refusing database use` e `missing enforced index`.

3. **Identificar falhas de build**
   - Node/pnpm incompatível → conferir versão no log e ajustar Project Settings/Corepack.
   - Falta de dependência → conferir `pnpm-lock.yaml` e `pnpm-workspace.yaml`.
   - Erro de TypeScript/ESLint → corrigir no código, não desabilitar o build.
   - Build não deve exigir MongoDB; se exigir, há regressão.

4. **Verificar o domínio atribuído**
   - Abrir o domínio `*.vercel.app` gerado.
   - Testar `/api/health` e `/login`.
   - Confirmar HTTPS e cookie `Secure`.

5. **Corrigir variáveis sem expor valores**
   - Editar em **Settings → Environment Variables**.
   - Nunca colar valores em issues, logs ou commits.
   - Variáveis novas/alteradas exigem novo deployment.

6. **Executar novo deploy**
   - **Deployments → Redeploy** ou push de um commit corrigido.
   - Preferir um novo commit a “Redeploy” quando a correção for de código.

### Etapa C — Homologação online

Executar com uma **conta de homologação** e dados descartáveis. Não usar dados reais de usuários.

| # | Cenário | Resultado esperado |
|---:|---|---|
| 1 | Abrir `/` sem sessão | Redireciona para `/login` (ou página pública, se houver) |
| 2 | Cadastro | Cria conta; não autentica automaticamente |
| 3 | Login | Redireciona para `/home`; cookie `token` HttpOnly/Secure/SameSite=Lax |
| 4 | Logout | Cookie limpo; rotas privadas voltam a redirecionar |
| 5 | Persistência de sessão | Recarregar a página mantém a sessão |
| 6 | Busca de jogos | Resultados IGDB renderizam; estados de erro são recuperáveis |
| 7 | Importação IGDB | Jogo importado aparece com metadados e capa |
| 8 | Adicionar ao backlog | Jogo aparece na biblioteca |
| 9 | Editar jogo | Status, nota, horas e flags persistem |
| 10 | Coleções | Criar, renomear, adicionar/remover jogos |
| 11 | Plataformas | Listagem e detalhe carregam logos/fotos locais |
| 12 | Dashboard | Estatísticas refletem os dados criados |
| 13 | Review Editor | Criar rascunho, autosave, recarregar e recuperar |
| 14 | Review Editor — preview | Markdown renderiza; links/imagens inseguros são bloqueados |
| 15 | Review Editor — servidor | Salvar review; recarregar; conteúdo e excerpt corretos |
| 16 | Exportação CSV | Download do arquivo com os dados da conta |
| 17 | Responsividade | Login, home e editor utilizáveis em viewport mobile |
| 18 | API sem cookie | `GET /api/games` retorna 401 no contrato `{ error: { code, message } }` |
| 19 | Health | `/api/health` retorna 200 |
| 20 | Índices | Nenhum log de `missing enforced index` |

Cuidados:

- O rate limit é por IP e por instância; não repetir cadastros/logins em excesso durante a homologação.
- Não usar a conta de homologação para dados permanentes.
- Não executar testes destrutivos no banco de produção.
- Se possível, usar um projeto Vercel de Preview com banco separado para a homologação.

### Etapa D — Rollback

1. **Rollback de código (Vercel)**
   - **Deployments** → selecionar o deployment anterior saudável → **Promote to Production**.
   - Isso promove o build anterior sem rebuild e sem alterar o código-fonte.
   - Alternativa: **Redeploy** de um commit anterior.
   - Alternativa Git: `git revert <commit>` + push (gera novo deployment; exige revisão).

2. **Rollback de variáveis**
   - Reverter valores em **Settings → Environment Variables**.
   - Redeploy obrigatório após a alteração.

3. **Rollback de banco**
   - Índices são aditivos; criar índices novos não exige rollback de código.
   - **Rollback de código não desfaz** alterações de schema, índices, dados ou configurações externas.
   - Se um deploy gravou dados incompatíveis, restaurar snapshot/backup do Atlas somente com autorização explícita.
   - Não executar `dropDatabase`, `deleteMany` ou migração reversa sem plano aprovado.

4. **Rollback de integração externa**
   - Credenciais Twitch podem ser revogadas/rotacionadas no console da Twitch.
   - A allowlist do Atlas deve ser revista manualmente.

5. **Comunicação**
   - Registrar horário, commit revertido, impacto e próximo passo.
   - Não executar rollback nesta fase; o procedimento é apenas preparatório.

---

## 15. Checklist de homologação online

- [ ] B-01 corrigido e verificado em banco vazio.
- [ ] Banco de produção separado, sem seeds de demonstração.
- [ ] Índices provisionados e verificação read-only `OK`.
- [ ] `passwordresettokens` com `tokenHash` unique e `expiresAt` TTL.
- [ ] Node 24.x confirmado no log de build (ou Node 26 validado).
- [ ] pnpm 11.3.0 confirmado via Corepack (ou versão alternativa validada).
- [ ] `MONGODB_URI` de produção configurada apenas em Production.
- [ ] `JWT_SECRET` distinto entre Production e Preview.
- [ ] `APP_URL` igual ao domínio público final.
- [ ] `TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET` válidos.
- [ ] `SEARCH_METHOD=IGDB`.
- [ ] Allowlist do Atlas revisada e risco registrado.
- [ ] Headers de segurança definidos (ou risco aceito formalmente).
- [ ] `robots.txt`/`noindex` definido para páginas privadas.
- [ ] Recuperação de senha ocultada ou completa.
- [ ] Rate limiting distribuído avaliado (ou risco aceito).
- [ ] CSV com neutralização de fórmulas (ou risco aceito).
- [ ] Health check de banco/readiness definido.
- [ ] Todos os cenários da Etapa C aprovados.
- [ ] Rollback ensaiado em Preview (sem tocar em produção).

---

## 16. Estratégia de rollback

| Camada | Ação | Reversível? | Observações |
|---|---|---|---|
| Deployment Vercel | Promote do deployment anterior | Sim, imediata | Não rebuilda; mantém o artefato |
| Código | `git revert` + push | Sim | Gera novo deployment; revisar |
| Variáveis de ambiente | Reverter no painel + redeploy | Sim | Segredos não devem ser expostos |
| Índices | Nenhuma ação destrutiva | Aditivo | Índices novos podem permanecer |
| Dados | Restaurar backup/snapshot Atlas | Parcial | Exige autorização; pode perder escritas recentes |
| Credenciais Twitch | Rotacionar/revogar | Sim | Afeta busca/importação |
| DNS | Reverter registro | Depende do TTL | Não executar nesta fase |

**Regra:** rollback de código não é rollback de banco. Toda alteração de schema, índice ou dado deve ter plano próprio e autorização explícita.

---

## 17. Veredito final

### NO-GO

O Save State não está operacionalmente pronto para o primeiro deploy público na Vercel porque o provisionamento de índices para um banco novo está quebrado. O build local verde não é suficiente: em produção, o gate de índices do `connectDatabase()` recusa o banco quando os índices obrigatórios não existem, e o script publicado não consegue criá-los corretamente em um Atlas limpo.

### O que já está pronto

- Código publicado íntegro em `9aaa952`, com `origin/main` sincronizado.
- TypeScript, ESLint e 1.246 testes Vitest aprovados.
- Build de produção aprovado, sem dependência de banco no build.
- Review Editor validado 8/8 em servidor isolado.
- Assets locais completos (127 referências, 0 ausentes).
- Autenticação com cookie HttpOnly/Secure/SameSite, JWT e `sessionVersion`.
- IGDB/Twitch com cache, single-flight, retry e timeouts.
- Transações compatíveis com Atlas.
- Erros sanitizados e logs com redação de segredos.

### Condições para evoluir para GO WITH CONDITIONS

1. **Corrigir B-01** e validar o bootstrap em banco vazio.
2. Fixar Node 24.x (ou validar Node 26).
3. Fixar pnpm 11.3.0 via Corepack (ou validar a versão escolhida).
4. Configurar Production e Preview com segredos e bancos separados.
5. Configurar e validar credenciais IGDB reais.
6. Decidir formalmente sobre recuperação de senha (ocultar ou completar).
7. Aceitar ou mitigar os riscos de rate limiting, allowlist do Atlas, headers e CSV.
8. Executar a homologação online da Etapa C.

Após 1–8, recomenda-se uma nova auditoria curta de confirmação. Se o bootstrap e a homologação passarem, o veredito pode ser **GO WITH CONDITIONS**; **GO** pleno exige também rate limiting distribuído, recuperação de senha completa, headers de segurança e observabilidade de banco.

**Nenhum deploy, commit ou push foi realizado. Aguardando autorização para publicação.**

---

## Adendo — Rate limiting para Vercel Serverless (Fase W-06, 11/11/2026)

### A. Diagnóstico e matriz de endpoints

`server/auth/rate-limit.ts` mantém um `Map` no processo, com janela fixa iniciada na primeira requisição, chave `{primeiro x-forwarded-for}:{routeKey}` e bypass apenas quando `NODE_ENV === "test"`. O bucket é por instância: cold start, escalabilidade horizontal e execução em regiões diferentes não compartilham estado. Não é rate limiting distribuído. A janela local também não equivale ao fixed window alinhado a relógio do WAF/Upstash.

O código seleciona o primeiro elemento de `x-forwarded-for`. Isso é compatível apenas se a plataforma de borda controlar/normalizar esse header. Em execução direta, self-hosted ou proxy não confiável, o cliente pode falsificá-lo. Não há contrato local validado para uma cadeia arbitrária de proxies; por isso não foi adicionada uma interpretação alternativa de IP nem uma confiança implícita em `x-real-ip`/`Forwarded`. Em produção Vercel, preferir a identidade de origem calculada pelo WAF para suas regras. Validar IPs IPv4/IPv6 e cadeia de proxy em qualquer ambiente diferente.

| Operação | Endpoint e método | Limite local atual | Proteção/risco relevante |
|---|---|---:|---|
| Cadastro | `POST /api/auth/register` | 20 / 15 min | Público; abuso de contas e envio de confirmação. |
| Login | `POST /api/auth/login` | 20 / 15 min | Público; força bruta/credential stuffing. Não é limite por conta. |
| Recuperação de senha | `POST /api/auth/forgot-password` | 5 / 15 min | Público; pode disparar e-mail. Resposta anti-enumeração. |
| Redefinição | `POST /api/auth/reset-password` | 10 / 15 min | Público com token; abuso de tentativa/recursos. |
| Confirmação de e-mail | `POST /api/auth/verify-email` | 10 / 15 min | Público com token; protegida pelo mesmo limite de reset. |
| Reenvio de confirmação | `POST /api/auth/resend-verification` | 5 / 15 min | Público; pode disparar e-mail. Usa limite de forgot-password. |
| Alteração de senha | `POST /api/auth/change-password` | 5 / 15 min | Autenticado; chave ainda é IP+rota, não usuário. |
| Exportação JSON/CSV | `GET /api/auth/export`, `GET /api/auth/export/csv` | Sem limite específico | Autenticado; pode consumir CPU/DB e gerar payload grande. Não foi classificado como endpoint de autenticação nem alterado nesta fase. |
| Sessão atual | `GET /api/auth/me` | Sem limite específico | Autenticado, operação de leitura. |

As seis rotas públicas sensíveis e a alteração de senha chamam `checkRateLimit` antes da operação protegida; excesso gera `429 RATE_LIMIT_EXCEEDED`. Login/cadastro compartilham os mesmos valores, mas têm route keys separadas. Verificação/reenvio foram confirmadas no código. Os limites locais têm efeito somente dentro da instância e sofrem colisão de NAT por IP. Os limites de e-mail são proteção de abuso/custo por IP, não quota por destinatário; não foi encontrado limite distribuído por conta/e-mail.

### B. Comparação e decisão

| Critério | Vercel WAF Rate Limiting | Redis distribuído (Upstash Ratelimit) |
|---|---|---|
| Segurança/coordenação | Bloqueia na borda antes da Function e reduz custo de execução. Contadores são **por região**, portanto tráfego em regiões diferentes pode exceder o limite configurado. | Estado compartilhado entre instâncias; uma base regional centraliza o contador, com latência maior para regiões distantes. Multi-region reduz latência, mas sincroniza assincronamente e admite pequena ultrapassagem. |
| Chaves | Hobby/Pro: IP e JA4; Enterprise também User-Agent e headers arbitrários. Não há chave de conta baseada em identidade autenticada. | Identificador fornecido pelo app: IP, user ID ou chave composta; exige política de privacidade/normalização própria. |
| Algoritmos/janelas | Fixed window em todos os planos; token bucket somente Enterprise. Janela 10 s–10 min em Hobby/Pro e até 1 h Enterprise. Janela não reproduz exatamente o limiter local. | Fixed window, sliding window e token bucket. Fixed/sliding alinham a fronteiras de tempo; fixed é barato e permite burst na fronteira. |
| Planos/custo | Disponível em todos os planos. Hobby: 1 regra de rate limit por projeto (dentro do total de regras customizadas); Pro: 40, Enterprise: 250. Custo de rate limiting é regional/usage-based; tráfego mitigado não conta como CDN request/FDT. Confirmar preço aplicável ao plano/regiões antes de ativar. | Serviço externo pago conforme plano/uso Redis; cada `limit()` fixo custa normalmente 2 comandos em estado intermediário, 3 na primeira gravação, e cacheia bloqueios em memória. Sliding window custa mais. Sem valores monetários assumidos: franquia/tarifa atual e projeção dependem do plano e volume e devem ser confirmadas antes do provisionamento. |
| Complexidade/operação | Baixa após configurar; alteração tem efeito imediato sem redeploy. Logs permitem observar primeiro; métricas no Firewall. Dependente da plataforma e indisponível em desenvolvimento local. | Nova conta/DB, pacote(s), variáveis secretas, configuração de região, observabilidade, orçamento, rotação de credenciais e testes de indisponibilidade. HTTP connectionless é compatível com Vercel Functions/Next.js. |
| Testabilidade | Regras reais só são comprovadas em deployment Vercel; localmente só se testa a política da aplicação. Documentação recomenda começar em `Log`, observar live traffic por 10 minutos, depois trocar para mitigação. | Integração pode ter testes unitários com mock, mas a distribuição, latência, TTL e falhas exigem teste com Redis provisionado. SDK implementa TTL e cache de bloqueios. |
| Falhas/usuário legítimo | Sem dependência Redis na Function. Contadores por IP podem penalizar NAT; JA4 pode reduzir colisão, mas não individualiza contas. | SDK documenta timeout padrão de 5 s e permite configurar timeout; ao timeout, permite a requisição por padrão. Fail-open é inaceitável como autorização silenciosa para os endpoints sensíveis sem aceitação explícita. Fail-closed pode indisponibilizar login/recuperação em falha Redis. |
| Dependência externa | Dependência da Vercel e limites do plano; sem serviço novo. | Dependência e credenciais do provedor Redis; necessidade e custo operacional adicionais. |
| Adequação ao primeiro lançamento | Melhor camada inicial de mitigação de floods, se configurar regra compatível com o plano e validar tráfego. Não garante limite global nem por conta. | Melhor opção se a exigência for contador coordenado por rota/usuário entre instâncias e regiões. Mais exata, mas não necessária para a camada ampla de borda se risco residual for aceito no lançamento. |

**Recomendação W-06:** adotar Vercel WAF como mitigação distribuída de borda de baixo esforço e manter o limiter local atual apenas como defesa complementar, explicitamente não distribuída. A combinação é uma redução prática de risco, não garantia global: o WAF contabiliza regionalmente e por IP/JA4, enquanto o `Map` é por instância. Para primeira publicação com baixo custo operacional, não há evidência que torne Redis indispensável antes de medir tráfego; não provisionar Redis nesta fase. Se for requisito impedir brute force global por conta ou limitar e-mails por destinatário de forma consistente, WAF+Map não basta: reabrir a decisão para Redis (ou mecanismo equivalente) antes de anunciar essa garantia.

Não foram feitas alterações de código: não há contrato de IP confiável fora da borda Vercel comprovado neste checkout, e um “ajuste” local não faria os contadores distribuídos. Nenhuma regra WAF foi aplicada. W-06 fica **PARCIAL** até configurar e homologar a regra remota.

### C. Política de regras WAF proposta (não configurada)

Limitações documentadas consultadas em 11/11/2026: regras podem combinar condições sobre path/método; rate limit oferece ação subsequente `429`, `Log`, `Deny (403)` ou `Challenge`. Chaves disponíveis por plano e janelas constam na tabela acima. Não há equivalência exata ao limite local de 15 minutos. A regra tem uma janela fixa e um contador comum para todos os caminhos que casarem; não assumir bucket independente por path. Em Hobby existe somente uma regra rate-limit, logo não é possível modelar separadamente cada valor abaixo.

| Regra | Caminho/método e correspondência | Chave/janela/limite proposto | Ação e impacto | Teste/rollback |
|---|---|---|---|---|
| `auth-post-abuse` (Hobby, regra única) | `POST` e paths exatos `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/verify-email`, `/api/auth/resend-verification`; usar condições OR de caminho junto de condição AND de método, validando preview do editor. | IP (opcionalmente JA4 se a interface permitir compor a chave sem degradar compatibilidade); **100 req/10 min por chave**, contador compartilhado entre os endpoints. Valor é um teto amplo inicial a calibrar com logs, não uma tradução de cada limite local. | Primeiro `Log`; após validação, `429`. A ação compartilhada pode afetar usuário legítimo que use várias operações de auth dentro da janela; não usar Challenge em endpoints POST sem validar o fluxo/API client. | Fazer tráfego normal e controlado nos deployments de teste, observar 10 min, confirmar paths/métodos/contadores e resposta. Reverter mudando a ação para Log ou desabilitando a regra no Firewall. |
| `auth-{operation}` (Pro/Enterprise, regras separadas) | Uma regra por endpoint/método, mesmos paths exatos acima; cadastro, login, forgot, reset, verify, resend. | Chave IP (IP+JA4 apenas se suportado e testado). Começar conservadoramente com **fixed window 10 min**. Limites de partida: register 20, login 20, forgot 5, reset 10, verify 10, resend 5. Em Pro são até 40 regras; Hobby não comporta este conjunto. | Log inicialmente, depois `429`. Contadores WAF regionais e por IP; possibilidade de dividir usuários atrás de NAT. | Log por 10 min/volume representativo; revisar false positives; ativar uma regra por vez. Para reverter, voltar a Log/desabilitar. |
| `auth-change-password` (Pro/Enterprise, regra adicional) | `POST /api/auth/change-password` | IP, 5/10 min; reconhecer que a sessão autenticada não vira chave WAF. | Log e depois `429`; pode limitar NAT compartilhado. | Mesmo ciclo; desabilitar ou Log em rollback. |

Os limites por endpoint no plano superior são uma proposta operacional, não reproduzem a janela deslizante (o código usa janela fixa por primeira chamada) nem garantem mesma experiência. A regra Hobby ampla deixa rotas mais frágeis protegidas principalmente pelos limites locais por instância; tal lacuna deve ser aceita conscientemente, ou deve-se escolher plano/serviço que permita políticas distintas. Não usar header de identidade fornecido pelo cliente como chave. A documentação consultada não estabelece nesta auditoria se regras se aplicam a Preview; confirmar essa semântica no projeto e testar Preview separadamente antes de depender dela. A documentação indica publicação imediata na implantação Production, sem redeploy.

### D. Falhas, observabilidade e privacidade

- WAF: avaliar Firewall overview/traffic grouping, regra em `Log` e eventos observados antes de bloquear. Resposta de bloqueio de rate limit deve ser `429`. O contador regional pode ultrapassar o limite total esperado; tratamento real multi-região precisa ser medido.
- Código local atual: lança erro 429 sem log de IP/email/token. Não acrescentar logs com senha, JWT ou token de recuperação. IP é dado pessoal; manter a retenção/uso conforme configuração e política de privacidade do provedor.
- Redis, se aprovado em fase futura: não confiar no comportamento padrão do SDK. Timeout, indisponibilidade e configuração ausente devem ser explicitamente convertidos em decisão observável. Recomendação para login, cadastro, forgot/resend e reset: não liberar silenciosamente por timeout; preferir `503` temporário (fail-closed para a operação protegida) com log sanitizado/alerta, preservando o estado de autenticação. Definir limite de timeout curto e política de contingência antes de implementar. Para leituras autenticadas menos críticas, eventual fail-open exige avaliação específica. Não colocar identificador claro de e-mail em chaves: usar ID estável/derivado com HMAC e segredo próprio, definir TTL e não registrar a chave. Isso não está implementado.
- Limites por IP podem atingir usuários atrás de NAT; limite por conta combate melhor abuso individual, mas permite abuso distribuído e enumeração se não houver resposta genérica. E-mail externo é custo: validar quota/limites no provedor de e-mail separadamente.

### E. Implementação, testes e pendências

**Implementado no código:** sem mudanças nesta fase. A camada local existente continua ativa nas sete rotas listadas. Nenhuma autenticação, validação JWT, `sessionVersion` ou autorização foi alterada.

**Testado localmente:** a suíte `tests/auth/rate-limit.test.ts` cobre bypass em ambiente de teste, limite/429 e isolamento por rota/IP; ela usa headers sintéticos e não demonstra confiança real no proxy da Vercel. Ainda executar novamente testes focados e regressão global após a documentação.

**Documentado, mas não configurado remotamente:** alternativas, regra Hobby ampla e alternativa de regras separadas nos planos com cota suficiente, limites/ações iniciais, ciclo de log → inspeção → 429 e rollback.

**Ainda não homologado na Vercel:** plano efetivo e tarifa regional; contagem/chave apresentada pelo editor; matching OR/AND dos paths; ação/response; escopo Production/Preview; tráfego real e falsos positivos; comportamento em múltiplas regiões; métricas/alertas e procedimento de rollback.

Antes do primeiro tráfego público: no Dashboard → projeto → Firewall, confirmar plano/cotas/preço e suporte de regras; criar em `Log`, observar ao menos 10 minutos e volume representativo, conferir contadores por região e caminhos/métodos, então publicar `429` se aceitável. Confirmar separadamente Preview. Se só Hobby, registrar aceite do contador agregado da regra e do risco de rate local por instância. Não assumir que o endpoint está distribuído até evidência de tráfego multi-instância/multi-região.

Rollback: no Firewall, mudar a regra para `Log` ou desabilitá-la (efeito imediato conforme documentação); não remover o limiter local. Se uma integração Redis for futuramente aprovada, rollback exige flag/configuração explícita e testes de comportamento sem credenciais; não existe fallback distribuído implementado hoje.

Fontes oficiais consultadas em 11/11/2026:

- [Vercel WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) — disponibilidade, limites por plano, janelas, chaves, ações, contagem regional e preço regional.
- [Vercel WAF Custom Rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules) — condições, publicação, observação em Log e reversão.
- [Vercel WAF Usage & Pricing](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing) — custos; tarifa depende da região/plano e deve ser confirmada no projeto.
- [Upstash Ratelimit Overview](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview), [Algorithms](https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms), [Features/Timeout](https://upstash.com/docs/redis/sdks/ratelimit-ts/features), [Costs](https://upstash.com/docs/redis/sdks/ratelimit-ts/costs) — compatibilidade serverless, algoritmos, timeout fail-open padrão e comandos por decisão.

**Veredito W-06: PARCIAL.** Recomendação documentada e risco residual explicitado; proteção remota não configurada nem homologada. Nenhum serviço, custo ou dependência foi criado.

---

## Adendo — HTTP Security Headers e CSV Formula Injection (W-08 + W-10, 11/11/2026)

### Resumo atualizado de prontidão

- **Achados históricos:** o inventário original e seus vereditos permanecem preservados acima; não representam sozinhos o estado local mais recente.
- **Correções locais não commitadas:** B-01, W-01/W-02, W-04/W-05, fixtures R-02/R-03, política HTTP W-08 e neutralização CSV W-10 foram alterados localmente em adendos/fases correspondentes. Alterações anteriores no working tree foram preservadas.
- **Infraestrutura pendente:** W-06 ainda depende de regra WAF configurada/homologada; W-02/W-04 e outras pendências remotas mantêm seus estados registrados nos adendos próprios.
- **Homologação:** os headers estão cobertos por teste de configuração, mas CSP ainda é Report-Only e não foi validada em navegador/deployment Vercel. CSV foi validado por serializador, parser de teste independente e rota HTTP autenticada.

### W-08 — Diagnóstico e política implementada

Antes desta fase, `next.config.ts` não declarava headers HTTP de segurança. O root layout usa um script inline síncrono (`LAYOUT_INIT_SCRIPT`) para evitar flash no tema/layout; Next.js App Router também pode emitir scripts inline para bootstrap/RSC. `next/font` hospeda fontes no próprio deployment. O RPGUI runtime não é carregado (só o CSS local). A aplicação faz chamadas de navegador para APIs same-origin. IGDB/Twitch e Resend são integrações server-side e não foram adicionadas a `connect-src`. O Review Editor aceita imagens `http(s)` de URLs remotas arbitrárias, sem upload; restringir a uma allowlist quebraria conteúdo já suportado, então CSP permite `https:` para imagens, conscientemente amplo. `images.remotePatterns` apenas permite otimização pelo Next e não define por si só CSP; imagens processadas pelo otimizador são same-origin.

`next.config.ts` agora aplica uma configuração centralizada em `/:path*`, cobrindo documentos e respostas API:

| Header | Política local | Ambiente |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Todos |
| `Referrer-Policy` | `no-referrer` | Todos; evita enviar token da query de verificação para outros destinos |
| `Permissions-Policy` | câmera, microfone, geolocalização e payment desabilitados | Todos |
| `X-Frame-Options` | `DENY` | Todos; não há fluxo legítimo de embedding identificado |
| `Strict-Transport-Security` | `max-age=15552000` (180 dias), sem `includeSubDomains`/`preload` | Só `VERCEL_ENV=production`; não é aplicado em local/Preview |
| CSP | Ver abaixo | `Content-Security-Policy-Report-Only` quando `NODE_ENV=production` (inclui Preview build) |

Diretivas report-only: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; font-src 'self'; connect-src 'self'; worker-src 'self'; frame-src 'none'`. Não se adicionou `unsafe-inline`, `unsafe-eval`, curingas gerais, `data:` nem domínios de APIs server-side. `frame-ancestors 'none'` é primário; X-Frame-Options complementa navegadores compatíveis. `upgrade-insecure-requests` foi omitido para não introduzir upgrade implícito sem homologação.

**Limitação essencial:** a CSP é somente `Report-Only`, não bloqueia XSS. É deliberadamente conservadora nesta fase: a política sem inline allowances deverá apontar violações conhecidas do script inline do layout e possivelmente scripts inline de hidratação/estilos gerados pelo Next. Nenhum endpoint de coleta `report-to`/`report-uri` foi configurado; as violações ficam disponíveis no console do navegador e precisam ser inspecionadas manualmente. Para enforcement futuro, avaliar nonce por request (com impacto na renderização dinâmica/cache e configuração de request headers no Next.js 15) ou hashes revisados para conteúdo realmente estático; não trocar para política bloqueante antes de validar login, navegação, editor, imagens e hidratação em navegador. WebSocket de HMR é razão adicional para não aplicar CSP em desenvolvimento. Não se afirma proteção CSP efetiva enquanto Report-Only.

### W-10 — Neutralização do CSV

`server/export/service.ts` agora neutraliza no momento da serialização (sem alterar MongoDB nem payload JSON) strings cujo primeiro caractere significativo, após whitespace Unicode, controles C0/C1 ou BOM, seja `=`, `+`, `-` ou `@`: prefixa apóstrofo ASCII à célula inteira. Valores numéricos primitivos, incluindo números negativos legítimos, continuam numéricos. Depois da neutralização, a função de escape existente ainda duplica aspas e envolve em aspas CSV campos com vírgula, aspas ou CR/LF; ordem e quantidade de colunas não mudam. Campos nulos/opcionais continuam vazios. Unicode e demais conteúdo permanecem preservados.

Vetores cobertos incluem `=1+1`, `+SUM`, `-1+2`, `@SUM`, espaço/tab/CR/LF, whitespace Unicode e controle C1 antes de operador, campos com vírgulas/aspas/quebras multilinha, vazios, Unicode e texto iniciado por apóstrofo. A implementação também cobre BOM e whitespace Unicode adicional. Um parser de teste independente lê as células resultantes e confirma número/colunas, sem depender apenas da presença textual do apóstrofo. Teste HTTP autenticado confirma fórmula neutralizada no CSV, attachment/content type e payload JSON com o valor original; o escopo continua sendo o usuário autenticado via `getSessionUser` e consultas com user ID.

**Limitação de interoperabilidade:** prefixar `'` é uma mitigação comum para planilhas, não uma garantia universal contra todos os leitores, importadores e ciclos de abrir/salvar/reexportar. A interpretação do apóstrofo pode diferir entre Excel, LibreOffice e importação de texto; por isso não se afirma garantia universal. O apóstrofo é parte do CSV serializado e pode ser percebido como dado literal por ferramentas que não o tratem como marcador de texto. O arquivo mantém conteúdo original após esse prefixo, não remove texto do usuário.

### Arquivos e validação

- `lib/security-headers.ts`, `next.config.ts`: headers e CSP Report-Only por ambiente.
- `tests/security-headers.test.ts`: baseline, HSTS local/Preview/Production, restrições CSP e ligação do matcher Next.js.
- `server/export/service.ts`, `tests/auth/export.test.ts`: neutralização e cobertura de parser/integração HTTP/JSON.
- Sem dependências, serviços, mudanças de lockfile ou alteração de autenticação.

Comandos/resultados desta fase:

- `pnpm exec vitest run tests/security-headers.test.ts tests/auth/export.test.ts --maxWorkers=1`: **2 arquivos, 10 testes aprovados**, exit code 0.
- `pnpm exec tsc --noEmit`: passou.
- `pnpm exec eslint .`: 0 erros, 7 warnings preexistentes fora desta fase; ESLint focado nos arquivos alterados passou sem warnings.
- `git diff --check`: passou (avisos de conversão LF/CRLF preexistentes do working tree, sem erro de whitespace).
- Regressão global `pnpm exec vitest run --maxWorkers=1`: **106 arquivos / 1.275 testes aprovados**, exit code 0, duração 257,99 s. O total aumentou em 1 arquivo e 4 testes em relação ao baseline 105/1.271.
- Sem servidor Next isolado ou Playwright nesta fase; a CSP não tem validação em navegador nem HTTP real. `next.config` foi verificado por teste de configuração, que não prova os headers em resposta do servidor. Nenhum build foi executado para evitar interferência com `.next` compartilhado.

Pendências de homologação: revisar console CSP em Production e Preview com fluxo de login, cadastro, dashboard, catálogo, imagens locais/remotas, editor Tiptap, formulários e RPGUI; medir falsos positivos; desenhar coleta de reports se necessária; só então decidir nonce/hash e enforcement. Confirmar HSTS no domínio HTTPS real e ausência de impacto em subdomínios antes de ampliar sua duração ou abrangência.

Referência oficial Next.js consultada em 11/11/2026: [Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy). A documentação recomenda nonce único por request via Proxy para CSP estrita e confirma que isso exige renderização dinâmica, desabilita otimização estática/ISR e afeta cache/CDN. Também descreve CSP estática sem nonce e SRI como experimental no App Router. Nenhuma migração para Proxy, renderização dinâmica ou SRI foi introduzida nesta fase.

**Vereditos:** W-08 **PARCIAL** (headers implementados; CSP em Report-Only e sem homologação navegador/Vercel). W-10 **RESOLVIDO localmente** (neutralização/escape e integração autenticada cobertos; a interpretação do apóstrofo ainda pode variar entre planilhas, conforme limitação documentada).

---

## Adendo — Correção B-01 (11/11/2026)

O bloqueador foi corrigido em alterações locais ainda não commitadas:

- `scripts/verify-indexes.ts` deriva os índices de oito schemas Mongoose, inclui `Activity` e `UserGameNote`, trata apenas código 26 como coleção sem índices e provisiona exclusivamente índices ausentes.
- `db/index-management.ts` centraliza leitura, comparação de chaves/opções, provisionamento create-only e verificação fail-closed compartilhada.
- `MONGODB_DB_NAME` é opcional e mantém `save-state` como default; CLI também aceita `--db-name`. Isso permite escolher explicitamente bancos de teste sem alterar o destino de produção implicitamente.
- `db/connection.ts` continua somente leitura em produção e não cria índices durante requests.
- Testes novos cobrem banco vazio, repetição idempotente, TTL/unique do reset, ausência do índice legado, fail-closed, opções incompatíveis, provisionamento parcial e propagação de erros diferentes do código 26.

Validação end-to-end executada em uma instância MongoDB 8.2.6 isolada (porta 27028), com banco `save-state-index-b01-validation-20261111`; a URI continha outro database path para confirmar que o `dbName` explícito prevalece:

1. `pnpm db:indexes` no banco vazio reportou 30 índices ausentes e saiu com código 1, sem escrita.
2. `pnpm db:indexes -- --create-missing --yes` criou os 30 índices declarados e saiu com código 0.
3. `pnpm db:indexes` subsequente reportou `OK: all 30 schema indexes present and compatible` e saiu com código 0.
4. Segunda execução de provisionamento concluiu com código 0 e nenhum índice adicional.
5. `connectDatabase()` com `NODE_ENV=production` e todos os modelos registrados passou pelo gate (`production index readiness gate: PASS`).

Regressão da correção: `pnpm exec tsc --noEmit` passou; ESLint nos arquivos de implementação/teste passou sem erros ou warnings; `pnpm exec vitest run` passou com **103 arquivos e 1.255 testes**; build Next.js em checkout isolado passou (`Compiled successfully`, 53 páginas). O estado histórico do parecer original (NO-GO antes da correção) foi mantido; este adendo registra a resolução técnica posterior. Nenhum banco real foi usado e nenhum commit, push ou deploy foi feito.

---

## Adendo — Padronização Node.js/pnpm (Fase W-01 + W-02, 11/11/2026)

### A. Diagnóstico inicial

| Item | Estado encontrado |
|---|---|
| Node local | `v24.22.1` |
| pnpm local (`pnpm --version`) | `11.3.0` (executável WinGet preexistente) |
| Corepack | `0.36.0`; `corepack pnpm --version` resolve `11.3.0` pelo `packageManager` |
| `packageManager` | `pnpm@11.3.0` (já correto; mantido) |
| `engines.node` antes da alteração | `>=22` |
| `.nvmrc` | `24` |
| `.node-version`, `.npmrc`, `vercel.json` | Ausentes |
| `pnpm-lock.yaml` | `lockfileVersion: '9.0'` |
| Next.js | `15.5.29` (inalterado) |
| CI version pin | Nenhum workflow/config CI rastreado encontrado |
| Branch/HEAD | `main`, `9aaa952`; `origin/main` também em `9aaa952` |

As alterações locais do B-01 estavam presentes antes desta fase e foram preservadas: `db/connection.ts`, `db/index-management.ts`, `lib/env.ts`, `scripts/verify-indexes.ts`, testes relacionados e este relatório. Também permaneceram intactas as quatro modificações locais anteriores do catálogo.

### B. Correção realizada

Única alteração funcional desta fase: `package.json` agora declara:

```json
"engines": {
  "node": "24.x"
}
```

`.nvmrc` já apontava para `24`; `packageManager: "pnpm@11.3.0"`, lockfile, `pnpm-workspace.yaml`, Next.js e dependências não foram alterados. Nenhum `.npmrc`, `vercel.json`, workflow ou instalador global foi introduzido.

### C. Evidências locais

| Comando | Resultado |
|---|---|
| `node --version` | `v24.22.1` |
| `pnpm --version` | `11.3.0` |
| `corepack --version` | `0.36.0` |
| `corepack pnpm --version` | `11.3.0` |
| `pnpm install --frozen-lockfile` | Exit 0; `Already up to date`; sem mudança no lockfile |
| `corepack pnpm install --frozen-lockfile` | Exit 0; `Already up to date` com pnpm 11.3.0 |
| `pnpm exec tsc --noEmit` | Exit 0 |
| `pnpm exec eslint .` | Exit 0; 0 errors, 7 warnings preexistentes em arquivos fora deste escopo |
| `pnpm exec vitest run --maxWorkers=1` | Exit 0; **103 arquivos / 1.255 testes aprovados** |
| Build Next.js isolado | Exit 0 em Node 24.22.1; compilado, 53 páginas geradas |

A primeira tentativa de Vitest em paralelismo padrão falhou ambientalmente: muitos MongoMemoryServer simultâneos consumiram o espaço disponível, abaixo do mínimo de 512 MB exigido pelo MongoDB. Foram removidos somente diretórios temporários `mongo-mem-*` criados naquela própria tentativa, depois de confirmar que nenhum processo MongoDB de teste estava ativo. A suíte serializada passou integralmente. O MongoDB persistente na porta 27017 não foi tocado.

O build ocorreu em checkout temporário isolado, copiando as alterações pertinentes e usando uma junction de `node_modules`; o `.next` principal do repositório não foi sobrescrito. B-01 permaneceu intacto.

### D. Documentação Vercel consultada

Consulta em 11/11/2026 às páginas oficiais:

- [Package Managers](https://vercel.com/docs/package-managers), atualizado em 11/08/2026.
  - pnpm 11 está na lista de versões suportadas (6–12).
  - Lockfile v9.0, sem Corepack, seleciona automaticamente pnpm 9 ou 10; a versão real deve ser confirmada nos logs.
  - Com Corepack, a Vercel usa o campo `packageManager`.
- [Configuring a Build](https://vercel.com/docs/builds/configure-a-build), atualizado em 28/08/2026.
  - Corepack é descrito como experimental.
  - A página documenta `ENABLE_EXPERIMENTAL_COREPACK=1` como variável do projeto e usa `packageManager` para fixar a versão.
  - Next.js usa o script `build` do `package.json`; instalação padrão é detectada pelo lockfile.
- [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), atualizado em 27/02/2026.
  - Node 24.x está disponível; 26.x é default da plataforma.
  - A tabela da Vercel mapeia `engines.node: ">=22"` para o último 26.x.
  - A versão `engines.node` no `package.json` sobrepõe a seleção Node.js nas Project Settings.

Isso confirma que a afirmação específica da auditoria anterior sobre `>=22` resolver para Node 26 estava correta segundo a documentação consultada. A nova declaração `24.x` remove essa faixa ambígua no repositório. A documentação também confirma suporte a pnpm 11 e o uso de Corepack para honrar `packageManager`; contudo, Corepack permanece experimental na plataforma.

### E. Configuração e validação remota pendente

**Definido no repositório:** Node `24.x`, `.nvmrc` `24`, pnpm `11.3.0` em `packageManager`, lockfile v9.0.

**Ainda não configurado nem verificado remotamente:**

1. Vercel → projeto → **Settings → Build and Deployment → Node.js Version**: selecionar **24.x** também. `engines.node: 24.x` deve prevalecer para deployment novo, mas manter o painel alinhado evita ambiguidade operacional.
2. Vercel → **Settings → Environment Variables**: adicionar `ENABLE_EXPERIMENTAL_COREPACK=1` para os ambientes de deployment usados (Production e Preview; Development se aplicável). Não foi alterado painel remoto nesta fase.
3. No próximo build, confirmar nos logs de instalação a linha/versão `pnpm v11.3.0` e a versão de Node `24.x`. Para uma comprovação explícita de Node no build, a documentação permite emitir `node -v` no Build Command; não alteramos Build Command remoto.
4. Se os logs mostrarem pnpm 9/10 ou Node diferente, interromper a promoção e revisar o escopo da variável Corepack e a configuração Node do projeto.

Indicadores típicos de falha: aviso `Unsupported engine`/versão Node incompatível; resolução de pnpm diferente de 11.3.0; instalação que ignora/reescreve lockfile ou erro de parsing do workspace. Não se deve contornar com upgrade geral nem regeneração especulativa do lockfile.

### F. Riscos residuais e estado do parecer

- A instalação local por Corepack funcionou com Node 24.22.1 e `pnpm@11.3.0`; o lockfile permaneceu inalterado.
- O `pnpm-workspace.yaml` existente (incluindo `allowBuilds`) foi aceito pela instalação congelada com pnpm 11.3.0.
- A Vercel não foi acessada; nenhuma configuração remota ou valor de ambiente foi conferido. Compatibilidade real do builder será confirmada somente em um deployment futuro autorizado.
- Corepack é experimental na Vercel segundo a documentação consultada. Se a plataforma modificar/remover esse suporte, a versão automática indicada pelo lockfile v9 pode ser pnpm 9/10; nesse caso, revisar alternativa oficial antes de alterar lockfile ou instalação.
- A versão patch do runtime Vercel será administrada pela plataforma dentro da série 24.x; o local validado foi 24.22.1.
- O parecer de prontidão geral e os demais warnings permanecem fora do escopo e não são alterados por este adendo.

### G. Veredito dos warnings

- **W-01 — RESOLVIDO no repositório:** `engines.node` agora é `24.x`, `.nvmrc` continua `24`, TypeScript, ESLint, Vitest serializado e build passaram em Node 24.22.1. A validação de um builder Vercel real permanece pendente.
- **W-02 — PARCIAL:** `packageManager` já estava correto e foi preservado; pnpm 11.3.0 e Corepack 0.36.0 funcionaram localmente, e ambos os installs congelados passaram sem alterar o lockfile. Para fechar W-02 integralmente, ainda falta configurar `ENABLE_EXPERIMENTAL_COREPACK=1` no projeto Vercel e verificar os logs de um build remoto autorizado.

Nenhum deploy, commit, push, alteração remota, mudança de credenciais ou upgrade de dependências foi realizado nesta fase.

---

## Adendo — Isolamento MongoDB e conexões serverless (W-04 + W-05, 11/11/2026)

### Diagnóstico

- Runtime (`db/connection.ts`) e CLI (`scripts/verify-indexes.ts`) já passavam `dbName` explicitamente para `mongoose.connect()`. A opção explícita prevalece sobre o database path da URI conforme a documentação Mongoose. Runtime e CLI, porém, recorriam silenciosamente a `save-state` em qualquer contexto se `MONGODB_DB_NAME` estivesse ausente.
- CLI já aceitava `--db-name`, com precedência sobre `MONGODB_DB_NAME`; runtime não tinha proteção contra nome ausente em Vercel.
- Cache global preservava conexão e promise single-flight, mas não associava a conexão ao URI/database selecionado. Uma chamada subsequente com nome diferente poderia retornar a conexão antiga.
- Falha da promise limpava o cache; o gate B-01 continuava verificando índices críticos em `NODE_ENV=production` sem criar índices. Em desenvolvimento/testes permanecia o comportamento existente de `ensureIndexes()`.
- Versões instaladas: Mongoose **8.24.4**, driver MongoDB **6.20.0** (dependências não alteradas). Defaults documentados: `maxPoolSize=100`, `minPoolSize=0`, `serverSelectionTimeoutMS=30000`, `socketTimeoutMS=0` (sem timeout) e `maxIdleTimeMS=0` (sem limite).

Referências oficiais consultadas: [Mongoose Connections](https://mongoosejs.com/docs/connections.html) (opções `dbName`, timeouts, erros/reconexão e pools) e [MongoDB Node.js Driver 6.x — Connection Pools](https://www.mongodb.com/docs/drivers/node/v6.x/connect/connection-options/connection-pools/) (defaults de pool, sockets de monitoramento e idle pool). Os defaults foram conferidos também no código da dependência instalada `mongodb@6.20.0` (`connection_string.js`, `connection_pool.js`, `connection.js`), evitando depender apenas da página da versão mais nova do Mongoose.

### Política W-04 implementada

`db/mongo-config.ts` centraliza resolução e validação para runtime e CLI:

1. `--db-name` explícito tem precedência sobre `MONGODB_DB_NAME`.
2. Sem ambos, aceita `save-state` somente fora de Vercel.
3. Em contexto Vercel (`VERCEL=1` ou `VERCEL_ENV=preview|production`), exige `MONGODB_DB_NAME`; não usa `NODE_ENV` como sinal de deployment.
4. Valor explicitamente vazio é erro, não fallback. Nomes são limitados a 1–63 caracteres ASCII (`A-Z`, `a-z`, dígitos, `_`, `-`); nomes inválidos falham antes da conexão.
5. Runtime e CLI continuam passando `dbName` explícito, portanto o path da URI não escolhe outro banco.

Exemplos de configuração (nomes ilustrativos; não indicam bancos criados):

```env
# Production
MONGODB_DB_NAME=save-state-production

# Preview
MONGODB_DB_NAME=save-state-preview
```

O cache guarda um hash da URI + database, nunca a URI completa. A seleção incompatível no mesmo processo falha explicitamente; cache conectado só é reutilizado quando Mongoose informa estado conectado. Estado desconectado permite nova tentativa; estados de conexão/transição não são reutilizados. Não se desconecta automaticamente conexão ativa.

### W-05: parâmetros escolhidos

| Opção | Valor | Base/efeito |
|---|---:|---|
| `maxPoolSize` | 5 | Reduz o pool por instância serverless frente ao default 100. Não é limite total de sockets: o driver ainda abre sockets de monitoramento por servidor/topologia e cada instância Vercel tem seu próprio client/pool. |
| `minPoolSize` | 0 | Não mantém sockets mínimos durante períodos ociosos; apropriado para workloads serverless intermitentes. |
| `serverSelectionTimeoutMS` | 10.000 | Limita conexão/seleção de servidor, reduzindo o default 30s sem usar o valor muito agressivo de 5s; pode encerrar tentativas durante falhas/eleições que excedam 10s. |
| `socketTimeoutMS` | 45.000 | Limita socket sem atividade após conectar. Operações legítimas com duração maior podem ser interrompidas; monitorar antes de ajustar. |
| `maxIdleTimeMS` | 30.000 | Retira conexões de pool ociosas em instâncias com pausas, permitindo recriação sob demanda; não é timeout de request. |

Não foram adicionados retries em loop nem novas variáveis para cada opção. Erros iniciais de conexão são substituídos por mensagem genérica sem URI/credenciais; falhas do gate são registradas sem mensagem originária. Falhas rejeitadas limpam a tentativa para permitir retry. Cache e single-flight permanecem por instância.

### Validações e segurança

- Testes unitários verificam defaults de desenvolvimento, precedência do nome, contextos Vercel, nomes vazios/malformados, incompatibilidade com o cache, opções passadas a Mongoose, concorrência, retry e gate B-01.
- Teste de integração usa somente `MongoMemoryServer` efêmero; verifica que `MONGODB_DB_NAME` explícito vence um path de URI conflitante e que conexão sequencial reutiliza a mesma instância. Não usa Atlas/local persistente.
- `pnpm exec vitest run tests/db-connection.test.ts tests/db tests/env.test.ts --maxWorkers=1`: passou **6 arquivos / 38 testes** em uma execução. Em uma repetição posterior, 4 testes de provisionamento real em `MongoMemoryServer` falharam ambientalmente quando o espaço livre caiu abaixo do mínimo de 500 MB do MongoDB; 34 testes passaram nessa repetição. `pnpm exec tsc --noEmit`: exit 0. `pnpm exec eslint .`: exit 0, 0 erros e 7 warnings existentes fora desta fase. `git diff --check`: exit 0. Build isolado em cópia sem `.env`/`.next`/`.git`: compilou e gerou **59 páginas** (exit 0).
- A regressão integral `pnpm exec vitest run --maxWorkers=1` executou 105 arquivos/1.267 testes: **944 passaram e 323 falharam em 43 arquivos**, concentrados em respostas 401/token ausente de rotas autenticadas. O working tree já continha mudanças locais em autenticação antes desta fase; não é possível atribuir essas falhas a esta fase, e autenticação permaneceu fora do escopo. A repetição posterior dos testes `tests/db` foi feita após recuperar espaço do build isolado e passou integralmente (37/37).
- O CLI continua verify-only por padrão; nenhuma execução do provisionador foi feita nesta fase. Os testes B-01 usam exclusivamente MongoDB temporário; o erro de espaço ocorreu durante criação de índices no servidor temporário, sem tocar em MongoDB persistente.
- Separar database names no mesmo cluster é isolamento lógico, não físico; recursos do cluster são compartilhados. Recomenda-se credencial/usuário MongoDB distinto e permissões mínimas para cada ambiente. Preview não deve compartilhar credenciais de Production. É uma decisão operacional se diferentes Preview Deployments compartilham um banco Preview.

### Ações remotas pendentes e riscos

- Configurar manualmente `MONGODB_DB_NAME` na Vercel para **Production** e **Preview**, com escopos/valores adequados. A aplicação agora falha fechada nesses contextos se o nome faltar.
- Configurar URI/credenciais de cada ambiente somente após autorização; esta fase não acessou nem alterou painel Vercel, Atlas, credenciais ou Network Access.
- A política por nome não impede que alguém configure o mesmo nome, URI ou usuário em Production e Preview; revisar os valores e permissões remotamente antes de deployment.
- Os limites são por instância e por pool/topologia; a escala total pode multiplicar conexões por número de instâncias serverless. Confirmar limites do tier Atlas e observar conexões/latência em Preview autorizado.
- `socketTimeoutMS=45s` é um teto de inatividade do socket, não duração total universal de consulta; operações demoradas devem ser avaliadas se houver timeout.
- A validação local não comprova as configurações remotas nem que Atlas aceita as credenciais/rede futuras.

Nenhum dado persistente foi apagado ou migrado; nenhum seed, bootstrap de índices, operação administrativa, alteração remota, commit, push ou deploy foi executado. Lockfile, dependências e B-01/W-01/W-02 foram preservados.

### Veredito

- **W-04 — PARCIAL:** runtime/CLI compartilham resolução explícita, nomes são validados, Vercel falha sem nome e o cache rejeita seleção incompatível. A separação real Production vs Preview depende de configurar/revisar valores e credenciais distintas no painel, ainda pendente de autorização.
- **W-05 — RESOLVIDO localmente:** opções documentadas configuradas; cache, single-flight, retry e gate preservados e cobertos por testes. Limites reais de carga/Atlas e telemetria de deployment ainda não foram validados.

Este adendo não declara o aplicativo pronto para produção e não altera o escopo de outros warnings.

---

## Adendo — Revogação de sessões e readiness MongoDB (W-09 + W-12, 11/11/2026)

### W-09 — Diagnóstico e decisão

Não há arquivo ADR-019 versionado em `docs/` ou outro caminho rastreado. A intenção disponível no checkout é registrada pelo comentário antigo em `app/api/logout/route.ts`, teste antigo de `tests/auth/logout.test.ts` e resumo histórico deste relatório: logout limpava apenas o cookie, sem incrementar `sessionVersion`. A motivação detalhada/original da ADR não está disponível; portanto não se atribui uma justificativa mais específica que o contrato documentado. O efeito implícito era evitar terminar outras sessões, ao custo de manter JWT copiado válido até a expiração (padrão de 7 dias).

O sistema já inclui `sessionVersion` no JWT e compara esse valor com `User` em toda leitura autenticada. `changePassword` e `resetPassword` já incrementam a versão via `$inc` atômico. Login exige usuário verificado; a sessão consulta `emailVerifiedAt` e não foi alterada. Não existem sessões persistidas por dispositivo.

| Estratégia | Avaliação para Save State 1.0 |
|---|---|
| Só remover cookie | Mais simples, mas não revoga cópia/roubo do bearer JWT; não atende expectativa explícita de encerrar sessão no servidor. |
| Incrementar versão global | Usa mecanismo já presente; invalida todos os JWTs anteriores do usuário com uma escrita atômica; custo/manutenção baixos. Efeito UX explícito: logout em um dispositivo encerra todas as sessões/dispositivos. |
| Sessões persistidas por dispositivo | Revogação individual, mas requer novo modelo/índice/limpeza/token claim e migração de comportamento; necessidade não demonstrada para v1. Não implementada. |

**Decisão W-09 (substitui o comportamento atribuído a ADR-019 para este contrato):** logout autenticado incrementa `sessionVersion` globalmente, depois retorna o contrato HTTP existente e remove o cookie daquele navegador. É a menor mudança coerente com o mecanismo de revogação já usado para troca/reset de senha. Não se altera ou apaga o histórico anterior; o texto original da ADR não está no checkout e esta decisão fica registrada neste adendo.

Sem cookie, token malformado ou sessão já revogada, logout permanece idempotente: HTTP 200 e cookie expirado, sem tentar revogar uma identidade fornecida pelo cliente. Para sessão válida, o ID vem exclusivamente do JWT validado e revalidado no banco. Falha de leitura/escrita MongoDB não vira sucesso: resposta sanitizada 500, com cookie local ainda removido. Nesse caso uma cópia do JWT continua válida enquanto a versão no banco não avançou; cliente deve tratar como falha de revogação, embora a UI existente redirecione ao login no `finally`.

`$inc` em `User.updateOne({_id: session.id}, ...)` é atômico. Dois logouts concorrentes incrementam serialmente e invalidam todos os tokens anteriores; concorrência com alteração/reset de senha também só incrementa a mesma versão, sem lost update. Requests cuja validação já ocorreu antes da revogação podem terminar; logout não cancela operações em voo. Tokens emitidos depois que a nova versão é observada podem iniciar sessão normalmente.

### W-12 — Endpoints e operação

- `GET /api/health` permanece inalterado, público, Node.js runtime, body `{ "status": "ok" }`; não chama `connectDatabase()` nem depende do MongoDB. É liveness, não prova prontidão.
- `GET /api/ready` é Node.js runtime, protegido por `Authorization: Bearer <READINESS_PROBE_TOKEN>`. O segredo deve existir somente no ambiente server-side e ter pelo menos 32 caracteres. Se ausente/inválido, retorna 404 sanitizado e **não acessa MongoDB**. Não usa `JWT_SECRET` nem autenticação de usuário.
- Token válido: chama `connectDatabase({ readOnlyIndexes: true })`, confirma Mongoose conectado e executa `ping` real no banco com `timeoutMS=2s`; depois verifica os índices de integridade obrigatórios com `verifyEnforcedModelIndexes`, reutilizando a mesma definição B-01 e sem `createIndexes`/`syncIndexes`.
- Sucesso: HTTP 200 `{ "status": "ready" }`; qualquer erro, timeout ou índice obrigatório ausente/incompatível: HTTP 503 `{ "status": "unavailable" }`. Ambos usam `Cache-Control: no-store`; resposta não contém URI, cluster, banco, índices, driver message ou stack.
- A inspeção de índices é cacheada por processo por 30 s e keyed por hash de URI+database (não guarda URI). Ping ocorre a cada probe e é requisito independente do cache; falha de conexão/ping/índice apaga o resultado em cache. Verificações concorrentes de índices no mesmo processo compartilham a promise. Connect tem timeout externo de 11 s (selection do Mongoose configurado em 10 s); inspeção de índices tem 4 s. A resposta pode levar até a soma dessas fases; chamadas não autenticadas não consomem esse trabalho.
- Import explícito dos nove schemas, inclusive `EmailVerificationToken` (AUTH-01), garante que a lista passada ao verificador corresponda aos modelos atuais. A readiness valida os índices classificados como enforced pelo B-01 (unique, sparse, partial e TTL), não substitui monitoramento de índices auxiliares apenas de performance.

O endpoint está protegido por segredo, não por JWT de usuário. Não há segredo real configurado nesta fase. Para ativar, criar `READINESS_PROBE_TOKEN` independente para Production e Preview no ambiente server-side e configurar o monitor HTTP externo para enviar o header Authorization. Confirmar que o produto de monitoramento aceita header secreto; sem isso, manter a rota desativada (404) ou escolher controle de acesso operacional antes do deploy. Não colocar o token em URL, frontend, logs ou documentação de configuração.

### Implementação e cobertura

- `app/api/logout/route.ts`, `server/auth/service.ts`: valida sessão existente, revoga globalmente por `$inc` e limpa cookie inclusive em resposta de erro.
- `tests/auth/logout.test.ts`: sessão invalidada, todos os dispositivos, logout sem sessão, falha de escrita com cookie removido e concorrência.
- `db/connection.ts`: opção explícita `readOnlyIndexes` para uma conexão fria de readiness nunca executar `ensureIndexes` em desenvolvimento.
- `db/readiness.ts`, `app/api/ready/route.ts`: ping, verificação B-01 read-only, cache/single-flight/timeout por conexão e endpoint bearer sanitizado.
- `tests/db/readiness-check.test.ts`, `tests/ready.test.ts`: cache, single-flight, expiração, identidade de database, falha, timeout, auth antes de DB, healthy, índice ausente e ausência de provisionamento.
- `tests/health.test.ts` permanece verde e mantém liveness sem Mongo.

Validações locais:

- `pnpm exec vitest run tests/auth/logout.test.ts tests/auth/session-me.test.ts --maxWorkers=1`: **17 testes aprovados**.
- `pnpm exec vitest run tests/ready.test.ts tests/db/readiness-check.test.ts tests/db/index-management.test.ts tests/db/mongo-connection.integration.test.ts --maxWorkers=1`: **19 testes aprovados**.
- `pnpm exec vitest run tests/auth tests/ready.test.ts tests/db/readiness-check.test.ts tests/db/index-management.test.ts tests/db/mongo-connection.integration.test.ts tests/health.test.ts --maxWorkers=1`: **13 arquivos / 79 testes aprovados**.
- TypeScript (`pnpm exec tsc --noEmit`) passou após ajuste de compatibilidade das opções MongoDB; ESLint focado passou. Regressão global ainda deve ser executada nesta fase.

Todos os testes MongoDB usam somente `MongoMemoryReplSet`/`MongoMemoryServer` temporário. A verificação de índice ausente remove e restaura índice somente nesse banco efêmero. Nenhum Atlas ou banco persistente foi acessado. Nenhum índice é criado pela rota readiness.

### Pendências e vereditos

- Configurar segredo de monitoramento no painel Vercel, distinto entre Production/Preview, e confirmar headers secretos aceitos pelo monitor. Sem segredo a rota permanece oculta e sem acesso ao DB.
- Homologar na Vercel a resposta real de `/api/ready`, latência, timeout/função, caminho de rede Atlas e política de alerta; health HTTP não substitui observabilidade contínua.
- W-09 sem revisão remota necessária; decisão local não foi submetida a deploy. UX deve comunicar futuramente que logout encerra outros dispositivos, se isso for exposto na interface.
- Sem sessões individuais, não é possível revogar somente um dispositivo. Falha de DB durante logout limpa o cookie local mas não revoga JWT copiado; API sinaliza erro e requer retry/monitoramento.

**W-09: RESOLVIDO localmente** — logout autenticado agora revoga todas as sessões; sem sessão continua idempotente. **W-12: PARCIAL** — implementação e testes locais prontos, mas segredo do monitor, ambiente Vercel/Atlas e alertas ainda não configurados/homologados.

Nenhuma migração, escrita em banco persistente, alteração remota, dependência ou lockfile, commit, push ou deploy foi executado.

---

## Adendo — AUTH-01B.1: redirecionamento seguro e recuperação do cadastro (11/11/2026)

### Decisões e contratos

**AUTH-A1:** `from` continua sendo opcional e pode conter rota interna, query e fragment; é validado por `getSafePostLoginDestination`. O helper rejeita destinos absolutos/protocol-relative, esquemas, controles/espaços, backslash, escapes malformados, separadores codificados, segmentos de traversal e codificação ambígua excessiva. Também recusa rotas de autenticação e `/api` para evitar ciclos ou navegação para endpoints. URL analisada usa origem sintética e só o pathname/search/hash são devolvidos. Qualquer entrada recusada usa `/home`. A validação é estrita e não depende de uma lista completa de páginas privadas; caminhos internos desconhecidos permanecem same-origin.

**AUTH-A3 — estratégia B (recuperação uniforme na UI):** não foi alterado o contrato HTTP do cadastro nem feita compensação/remoção do usuário persistido. Se a solicitação de email falha depois da persistência, a API continua retornando erro 500 sanitizado; não declara sucesso de envio. A UI descreve o resultado como indeterminado e oferece link para `/check-email`. Falhas de rede também recebem esse caminho, porque o cliente não sabe se o servidor persistiu a conta ou se o provedor aceitou a mensagem. Cadastro com sucesso continua indo à mesma página de confirmação, agora sem incluir o endereço na query string.

`/check-email` pede o endereço manualmente e reutiliza `POST /api/auth/resend-verification`. A resposta do endpoint continua genérica para conta inexistente/verificada e o limite atual permanece aplicado. A mensagem informa que uma solicitação pode ter sido processada, mas não confirma entrega. O usuário permanece sem sessão, `emailVerifiedAt` permanece nulo e login continua recusado até confirmação. A estratégia evita um novo contrato público que revelaria explicitamente se o usuário foi persistido. Ela não resolve consistência transacional entre usuário, token e provider — escopo da AUTH-01B.2.

O caminho manual também dá saída ao caso de cadastro duplicado com conta pendente: a mensagem de erro atual permanece, e o link de reenvio está disponível na própria tela. Email não é colocado na URL nem persistido por um novo mecanismo de estado.

### Arquivos e testes

- `lib/auth/post-login-destination.ts`: helper puro de validação de destino.
- `features/auth/login-form.tsx`: navega somente para o resultado validado.
- `features/auth/register-form.tsx`: navega sem email na URL; em resposta 5xx/erro de rede explica a incerteza e mantém link de recuperação; também oferece link para cadastro pendente.
- `features/auth/check-email.tsx`, `app/(auth)/check-email/page.tsx`: campo manual, reenvio existente e feedback sem alegação de entrega.
- `tests/auth/post-login-destination.test.ts`: destinos internos, query/fragment, esquemas externos, protocol-relative, backslash, traversal, escapes malformados, controles e ciclos.
- `tests/auth/auth-recovery-ui.test.tsx`: LoginForm usa fallback seguro; falha indeterminada oferece recuperação; reenvio manual normaliza email e chama endpoint existente.
- `tests/auth/register-login.test.ts`: configuração ausente simulada, rejeição, timeout indeterminado, conta pendente/token hash-only, ausência de sessão e recuperação pelo endpoint genérico.

Não houve alteração de serviço Resend, configuração de credenciais, endpoint de autenticação ou schema/modelo. Falhas do provider foram simuladas por mocks; nenhum email real foi enviado.

### Limites e pendências

- O timeout pode significar que o provider aceitou a mensagem sem a resposta chegar; a UI deliberadamente não tenta afirmar se houve entrega. Um reenvio posterior substitui o token anterior, conforme o comportamento existente.
- A conta e o token continuam sendo operações separadas; recuperação de falhas entre operações, transação/compensação e consumo/update atômico permanecem para AUTH-01B.2.
- AUTH-01B.3 deve tratar os demais achados da auditoria (cobertura E2E compatível, estados de UX e consistência de reset/verificação).
- W-06 segue dependendo de rate limiting distribuído/WAF; este trabalho não muda o limiter local.
- AUTH-01C ainda requer configuração/homologação de Resend, domínio, DNS, APP_URL e ambientes Vercel. A confirmação de código não comprova entrega real.

**AUTH-A1: RESOLVIDO localmente. AUTH-A3: RESOLVIDO localmente para recuperação visível, mantendo API genérica e sem alegar entrega. AUTH-01B.1: implementação local; validação completa registrada no relatório da fase.**

---

## Adendo — AUTH-01B.2: integridade transacional dos tokens (11/11/2026)

### Diagnóstico e política escolhida

Antes desta fase, `verifyEmail` removia o token antes de atualizar `User.emailVerifiedAt`. `resetPassword` marcava `used` antes de gerar o hash e alterar a senha/`sessionVersion`. `issueVerification` e `forgotPassword` removiam links anteriores antes de criar/enviar o próximo. Em reset, a notificação Resend era awaited depois da escrita; erro/timeout podia retornar 500 mesmo com senha e versão de sessão já alteradas.

O projeto já executa transações MongoDB para escritas do Review Editor (`server/reviews/transaction.ts`) e os testes de auth usam MongoMemoryReplSet. Foi adicionado helper de sessão em `server/auth/transaction.ts`; não existe fallback não-atômico. Transações só cobrem leituras/escritas MongoDB curtas. Bcrypt e Resend ficam fora delas.

**Política de reenvio escolhida:** solicitar novo email não invalida imediatamente tokens anteriores. Cada token permanece válido até seu TTL, ou até um sucesso para a conta. Confirmação bem-sucedida marca a conta verificada e apaga atomicamente todos os tokens de verificação presentes; reset bem-sucedido consome o token vencedor e apaga atomicamente os demais tokens de reset da conta. Assim, rejeição/timeout do provider não destrói um link anterior utilizável e reenvios concorrentes não apagam um token cujo email ainda está em voo. Em troca, links anteriores continuam válidos durante suas janelas de 24h (verificação) ou 1h (reset); cada link tem entropia aleatória, só seu hash é persistido, e o primeiro sucesso retira os demais. Não foi adicionada coleção, estado de envio, fila ou serviço externo.

### Fluxos e garantias

- **Confirmação:** dentro de `withAuthTransaction`, remove condicionalmente um token por hash e `expiresAt > agora`, exige `emailVerifiedAt: null` ao atualizar o usuário, e apaga os demais tokens daquele usuário. Falta de token/usuário aborta a transação. Uma falha na escrita deixa o token disponível; duas confirmações concorrentes só permitem o commit que atualizar a conta primeiro. Links da mesma conta não verificam outro usuário.
- **Reset:** consulta token válido fora da transação para não gastar bcrypt em token aleatório inválido; calcula bcrypt antes de abrir a sessão. Dentro da transação, revalida `_id`, hash, `used: false` e expiração, marca o vencedor usado, atualiza a senha com `$set` e incrementa `sessionVersion` com `$inc`, e exclui os outros links. Falha ou conflito aborta todas as escritas; token e senha anterior permanecem. Apenas um reset concorrente pode confirmar. Sessões antigas são invalidadas no mesmo commit da senha.
- **Notificação pós-reset:** Resend é chamado somente após commit. Rejeição, timeout ou indisponibilidade não muda o resultado do reset nem faz a rota responder falha de token já consumido. É registrado evento sanitizado contendo apenas o tipo/nome do erro, sem email, token ou segredo. Resposta de sucesso significa reset concluído; não afirma entrega do email.
- **Cadastro, reenvio e forgot:** criação do usuário/token e envio seguem sem transação externa. Reenvio/recuperação agora criam o novo token sem apagar os anteriores. Um timeout pode deixar um token que o usuário não conhece, mas não torna links anteriores inutilizáveis; o TTL e consumo bem-sucedido fazem a limpeza. Respostas genéricas e rate limits existentes não foram alterados.
- `withAuthTransaction` sempre tenta encerrar a sessão em `finally`, permite o retry limitado padrão do driver para erros transitórios e não captura erros da operação para convertê-los em sucesso. Falha ao encerrar sessão é logada sem mascarar o resultado já confirmado ou o erro original.

As transações exigem replica set; Atlas e a fixture MongoMemoryReplSet atendem essa condição. Em standalone, falha é propagada/sanitizada — não se executam escritas sem transação. A confirmação definitiva de resultado desconhecido de commit depende do comportamento de retry do driver; se a conectividade acabar antes de resolver a ambiguidade, permanece a limitação normal de resultado transacional indeterminado e ela deve ser observada operacionalmente.

### Implementação e evidências

- `server/auth/transaction.ts`: helper de sessão/`withTransaction`, cleanup e logging sanitizado.
- `server/auth/service.ts`: transações de confirmação/reset, revalidação condicional, limpeza de tokens no sucesso, emissão sem invalidar links previamente e notificação após commit.
- `tests/auth/token-transactions.test.ts`: rollback quando a escrita do usuário falha; usuário ausente; expiração/reuso; confirmação de links concorrentes; reenvios concorrentes; duas recuperações/reset concorrentes; rollback de senha, token e `sessionVersion`; link anterior preservado após falha de novo envio; notificação com falha após commit.
- `tests/auth/register-login.test.ts`: atualizada para a política explícita de múltiplos links válidos até confirmação, ao invés de pressupor substituição imediata.

Os testes usam MongoMemoryReplSet e mocks de `emailService`; nenhum Atlas, banco persistente ou Resend real foi acessado. A execução de rollback injeta falha na escrita de User depois da operação do token dentro da transação real. Não foi simulado failpoint de falha física no comando de commit; retries de erro transitório/resultado desconhecido ficam a cargo do driver e há limitação ambiental para testar interrupção de rede na confirmação do commit.

### Riscos e pendências

- Vários links da mesma conta podem coexistir até expirar ou um ser usado. A escolha evita quebrar links em falhas externas e concorrência, mas permite usar um email anterior ainda válido dentro do TTL. A primeira confirmação/reset bem-sucedido invalida os outros.
- Sem fila/outbox, falha de notificação depois do reset pode deixar o usuário sem aviso; o reset permanece correto e retorna sucesso. Alertas/entrega confiável são evolução operacional, não foram adicionados.
- Resend pode ter aceitado um email antes de timeout; o código não consegue provar entrega. Os tokens correspondentes ficam persistidos e a UI mantém resposta genérica.
- AUTH-01B.3 permanece para UX/E2E residual; AUTH-01C para homologação real de provider/domínio/ambientes. W-06 continua dependente de rate limiting distribuído/WAF.

Validações finais: `pnpm exec vitest run --maxWorkers=1` — **111 arquivos / 1.337 testes aprovados, zero falhas (exit code 0)**; `pnpm exec tsc --noEmit` passou; `pnpm exec eslint .` teve zero erros e 7 warnings preexistentes; `git diff --check` passou, com avisos de conversão LF/CRLF. Build não executado.

**AUTH-A4: RESOLVIDO localmente** — consumo, senha e `sessionVersion` são atômicos; falha de notificação não retorna erro falso. **AUTH-A5: RESOLVIDO localmente** — consumo, verificação e limpeza são atômicos. **AUTH-01B.2: CONCLUÍDA localmente, validada pela regressão global.** Nenhuma dependência, lockfile, banco persistente, configuração remota, commit, push ou deploy foi alterado nesta fase.

---

## Adendo — AUTH-01B.3: UX e preparação E2E da autenticação (11/11/2026)

### A. Diagnóstico

Na inspeção local, login não oferecia acesso contextual ao reenvio; a tela `/verify-email` só descrevia o link inválido/expirado; `LoginForm` ignorava `passwordReset`; o formulário de alteração de senha mantinha o usuário na área protegida depois do incremento de `sessionVersion`; e `LogoutLink` navegava em `finally`, indistintamente após sucesso ou erro. A fixture `SOURCE_MODELS` do teste de índices não continha `EmailVerificationToken`. Vários E2E chamavam o endpoint de login imediatamente após cadastro pendente.

### B. Correções de UX e segurança

- **AUTH-A6:** link visível de `/login` para `/check-email`; falha de confirmação oferece o mesmo caminho direto. Mensagem permanece genérica, sem identificar conta ou estado; email não é colocado na URL. A tela usa região `status` e link acessível.
- **AUTH-A7:** `/login?passwordReset=1` mostra texto fixo acessível orientando login com a senha nova. Valores arbitrários não são renderizados. A mensagem de alteração de senha e resultados do logout também usam flags conhecidas e textos fixos.
- **Troca de senha:** após resposta HTTP de sucesso, `change-password` limpa o cookie HttpOnly na resposta e `PasswordForm` encaminha para `/login?passwordChanged=1`; não é emitido JWT novo nem incrementada novamente a versão. Respostas de erro não limpam cookie nem navegam e não mostram sucesso.
- **AUTH-A10:** `/api/logout` mantém o contrato W-09: tenta revogação global e sempre limpa o cookie local, inclusive se falhar; falha de armazenamento continua retornando erro HTTP. A UI distingue sucesso de falha; no segundo caso explica que a revogação em outros dispositivos não foi confirmada e que este navegador foi desconectado. Não há retry enganoso sem cookie; novo login é necessário para tentar novamente.
- **AUTH-A11 — decisão:** não alterar o contrato da API nesta fase. O cadastro ainda retorna `EMAIL_ALREADY_IN_USE` para duplicados, um canal de enumeração; respostas uniformes exigiriam mudança compatível de produto/API e experiência de recuperação. Risco classificado como **residual conhecido**, recomendado para decisão de produto/segurança antes de 1.0. Rate limiting existente não elimina enumeração distribuída. Testes existentes preservam explicitamente o contrato atual.

### C. Índices

`EmailVerificationToken` foi adicionado à fixture de modelos schema-driven em MongoMemoryServer efêmero. Teste dedicado verifica índice unique de `tokenHash`, TTL `expiresAt` (`expireAfterSeconds: 0`) e índice `userId`, provisionamento em base vazia e verificação read-only; cobre ainda fail-closed para índice obrigatório ausente e opção unique incompatível. O teste geral de idempotência agora também inclui o modelo. Nenhuma alteração no provisionador B-01.

### D. E2E e limitação de execução

Os helpers de `tests/e2e-perf` passaram a criar fixtures de usuário explicitamente verificadas diretamente no banco isolado; os testes seguem executando login, sessão, logout e APIs reais. Uma jornada cria conta pendente/token hash no fixture, comprova login recusado, chama o endpoint real de confirmação e então autentica; outra cobre reset real, uso único e revogação de sessão. Não existe adaptador de email interceptável no harness atual, portanto esses fluxos usam tokens sintéticos conhecidos; cadastro real + captura de email não foi exercitado em browser.

Para evitar que os helpers ou global setup usem um Mongo persistente por engano, exigem `E2E_MONGODB_URI` com host loopback, database exatamente `save-state-e2e`, parâmetro de replica set e opt-ins explícitos (`E2E_DATABASE_EPHEMERAL=1`, `E2E_ALLOW_FIXTURES=1`; para reset, também `E2E_ALLOW_DATABASE_RESET=1`). O servidor recebe `MONGODB_DB_NAME=save-state-e2e` explicitamente, sem herdar seleção da `.env`. Global setup limpa apenas esse banco no replica set em memória e usa o provisionador B-01 existente para criar/verificar os índices; Playwright não reaproveita processo servidor existente. O spec completo de autenticação foi executado com MongoMemoryReplSet local efêmero: **10 testes aprovados, incluindo auth setup (exit code 0)**. Cobriu login UI, conta pendente, endpoint real de confirmação com token sintético, logout, alteração/reset e revogação de sessões. `pnpm exec playwright test --list --project=e2e` listou **82 testes em 11 arquivos (exit code 0)**. A suíte E2E completa de domínio/performance não foi executada; cadastro real com captura de email/Resend tampouco foi testado no browser. Duas tentativas Playwright anteriores ao sucesso terminaram no `auth.setup` com **1 falha e 2 testes dependentes não executados (exit code 1)**: primeiro por validação de ambiente production (URL/valores placeholder), depois por seleção diferente de `MONGODB_DB_NAME` dentro do replica set efêmero. Ambos foram corrigidos e o spec completo passou. Uma tentativa anterior de launcher encerrou por timeout (exit code 1) antes de iniciar Playwright; não deixou processo Node/Mongo iniciado por ela.

### E. Arquivos alterados nesta fase

- `features/auth/login-form.tsx`, `features/auth/verify-email.tsx`: recuperação contextual e feedback de reset/logout.
- `features/settings/password-form.tsx`, `app/api/auth/change-password/route.ts`: navegação após troca e limpeza do cookie apenas após sucesso.
- `features/navigation/nav-desktop.tsx`: tratamento distinto de sucesso/falha de logout.
- `tests/auth/auth-recovery-ui.test.tsx`, `tests/auth/password.test.ts`: cobertura de mensagens, navegação, falhas e cookie.
- `tests/db/index-management.test.ts`: cobertura dos índices de verificação.
- `tests/e2e-perf/helpers.ts`, `global-setup.ts`, `auth.setup.ts`, `e2e-auth.spec.ts`, `e2e-game-form-review-rs0.spec.ts`, `e2e-game-form-review.spec.ts`, `e2e-library.spec.ts`, `e2e-review-editor.spec.ts`, `e2e-review-homolog-replset.spec.ts`, `e2e-review-homolog.spec.ts`, `playwright.config.ts`: fixtures compatíveis com email obrigatório e proteção de banco/servidor.
- `docs/VERCEL_PRODUCTION_READINESS.md`: este adendo; histórico anterior preservado.

### F. Validações e vereditos

- Focadas: `pnpm exec vitest run tests/auth/auth-recovery-ui.test.tsx tests/auth/password.test.ts tests/auth/logout.test.ts tests/auth/register-login.test.ts tests/auth/token-transactions.test.ts tests/db/index-management.test.ts --maxWorkers=1` — **6 arquivos / 63 testes, exit code 0**.
- Regressão: `pnpm exec vitest run --maxWorkers=1` — **111 arquivos / 1.348 testes, zero falhas, exit code 0**.
- `pnpm exec tsc --noEmit` — exit code 0.
- `pnpm exec eslint .` — exit code 0, zero erros e 7 warnings preexistentes em arquivos não alterados nesta fase.
- `pnpm build` — build otimizado Next.js 15.5.29 passou, exit code 0. Antes do build foi verificado que não havia processo Node ativo. O build escreveu o diretório local `.next`.
- `pnpm exec playwright test tests/e2e-perf/e2e-auth.spec.ts --project=e2e` — **10 testes aprovados, exit code 0**, incluindo o auth setup, com MongoMemoryReplSet e placeholders sem acesso a providers.
- `pnpm exec playwright test --list --project=e2e` — 82 listados, exit code 0; descoberta da suíte, não execução dos demais specs.
- `git diff --check` — exit code 0; sem erros de whitespace, com avisos Git de conversão LF/CRLF em arquivos locais preexistentes.

**AUTH-A6: RESOLVIDO localmente. AUTH-A7: RESOLVIDO localmente. AUTH-A8: PARCIAL** — spec de autenticação passou e helpers respeitam email obrigatório; suíte E2E restante e captura de email real/interceptado continuam pendentes. **AUTH-A9: RESOLVIDO localmente. AUTH-A10: RESOLVIDO localmente. AUTH-A11: PARCIAL** — risco e contrato classificados; disclosure explícito permanece até decisão anterior ao 1.0. **AUTH-01B.3: PARCIAL**, pendente da suíte E2E restante e decisão de produto/segurança para AUTH-A11. AUTH-01C e homologações externas permanecem pendentes; W-06/W-08 não foram alterados.

---

## Adendo — AUTH-01B.3-FINAL: Fechamento E2E e proposta AUTH-A11 (12/11/2026)

### Escopo e salvaguardas

Esta etapa não fez deploy, commit/push, alteração remota, uso de credenciais reais, envio de e-mail real, migração, seed ou acesso a banco persistente. A branch continuou `main`, HEAD `9aaa952bae0bbe0bfca5674d301b0284c44bc824`; as modificações locais preexistentes foram preservadas. Nenhuma dependência ou lockfile foi alterado.

Os testes Playwright foram executados por `next start` isolado na porta 3101, com `reuseExistingServer: false`, `MONGODB_DB_NAME=save-state-e2e` e um `MongoMemoryReplSet` local efêmero em porta dinâmica. As guardas exigiram host loopback, database `save-state-e2e`, parâmetro `replicaSet` e opt-ins explícitos. O setup provisionou e verificou 33 índices declarados somente nesse banco efêmero; o reset do global setup ficou restrito a ele. O processo `mongod.exe` preexistente, filho de `services.exe`, foi observado e deixado intocado.

### Captura local de email e jornada de cadastro

Foi adicionado `tests/e2e-perf/capture-resend.cjs`, carregado exclusivamente como preload pelo comando `next start` autorizado no harness. A instalação falha fechado sem os opt-ins, o URI do replica set permitido, o caminho temporário `Temp/opencode/save-state-e2e-email-*` e a invocação de `next start`. O preload simula sucesso somente para `POST https://api.resend.com/emails`; qualquer fetch servidor para outro destino não local é bloqueado. O payload capturado fica em arquivo temporário com modo restrito e é removido ao encerrar a execução.

O teste em `tests/e2e-perf/e2e-auth.spec.ts` exercita UI de cadastro, criação de conta pendente, ausência de sessão, rejeição de login antes da confirmação, link capturado, confirmação pela página e API real, login e persistência da sessão após reload. Não altera o estado de verificação diretamente. O spec de autenticação desliga trace, screenshot e vídeo para impedir que o bearer token seja preservado em artefatos. A leitura do estado é apenas uma consulta read-only à fixture Mongo local.

Comando focado: `pnpm exec playwright test tests/e2e-perf/e2e-auth.spec.ts --project=e2e --grep 'cadastro, email interceptado'`, dentro do launcher PowerShell que inicia e encerra o replica set. **2/2 aprovados, exit code 0**, incluindo auth setup. Nenhuma chamada real ao Resend ocorreu. Um primeiro início foi corretamente recusado pelo preload antes de subir o servidor (exit code não zero); a guarda foi ajustada para reconhecer a invocação real do Next, sem remover os requisitos de isolamento. Uma tentativa seguinte revelou seletor acessível ambíguo e foi corrigida para senha exata; a execução aprovada ocorreu depois.

### Inventário e resultado da suíte funcional

O inventário final contém **83 testes em 11 arquivos/specs** (contagem Playwright inclui 1 auth setup):

| Grupo/spec | Casos listados |
|---|---:|
| `auth.setup.ts` | 1 |
| `e2e-auth.spec.ts` (autenticação/sessão) | 10 |
| `e2e-adverse.spec.ts` (falhas simuladas) | 10 |
| `e2e-game-form-review-rs0.spec.ts` e `e2e-game-form-review.spec.ts` (jogos/reviews/transações) | 9 |
| `e2e-library.spec.ts` (biblioteca/coleções/Top 10) | 10 |
| `e2e-matrix.spec.ts` (viewport desktop/tablet/mobile) | 20 |
| `e2e-review-editor.spec.ts`, `e2e-review-homolog-replset.spec.ts`, `e2e-review-homolog.spec.ts` (editor e homologação de review) | 14 |
| `e2e-search.spec.ts` (busca, catálogo, dashboard/activity) | 9 |
| **Total** | **83** |

Comando completo: `pnpm exec playwright test --project=e2e`, no mesmo launcher efêmero. Resultado: **68 aprovados, 1 ignorado, 14 reprovados; exit code 1**. Os 14 bloqueios ocorreram por `RATE_LIMIT_EXCEEDED`/429 no limiter em memória: o servidor `next start` está em modo production e vários logins de usuários de fixture compartilham o IP local. Isso impediu inclusive alguns assertions de login e os testes posteriores de editor/homologação; não é evidência de regressão funcional nesses cenários. O comportamento reproduz a limitação de volume já observada na auditoria anterior. Não se alteraram limites nem se desabilitou o rate limiter; o harness não possui hoje distribuição de IP/fixtures que permita executar toda a sequência sem saturar esse controle.

IGDB/Twitch usou apenas placeholders e egress remoto foi bloqueado pelo preload. Os testes de busca observados passaram ao aceitar os estados tratados de erro/indisponibilidade; **não** validam resultados reais do provedor nem importação externa. A matriz funcional E2E foi executada, mas a bateria integral não pode ser declarada verde. Perf/Lighthouse não fazem parte do projeto `e2e` executado e continuam fora deste resultado.

### AUTH-A11 — avaliação atual e recomendação

- **Comportamento atual:** `registerUser` retorna `EMAIL_ALREADY_IN_USE` com status 400 quando o e-mail já existe, tanto no caso sequencial quanto na colisão resolvida pelo índice único. O cadastro de e-mail novo responde pelo fluxo de conta pendente. Portanto, a diferença revela existência de conta a quem pode enviar cadastro.
- **Impacto/exploração:** um atacante pode enumerar endereços por tentativas automatizadas e correlacionar contas; volume pode ser escalado por múltiplos IPs. O limiter local reduz abuso por instância/IP, mas não elimina enumeração distribuída. W-06 permanece pendente até configurar e homologar proteção distribuída/borda.
- **Mitigações atuais:** validação/rate limit no cadastro; respostas genéricas na rota de reenvio (“If the account is pending...”) e na recuperação; tokens de confirmação não são expostos em respostas/logs normais. Não foi adicionado novo canal de enumeração nesta etapa. O limiter atual não equivale a mitigação global e WAF também não elimina totalmente a diferença observável do endpoint de cadastro.
- **Decisão recomendada:** manter temporariamente o contrato explícito nesta fase, sem alteração automática da API/UX; registrar o risco como conhecido e decidir com produto/segurança antes de v1.0. Exigir configuração e homologação de W-06 antes de lançamento público, sem tratar isso como eliminação do risco.
- **Critérios de reavaliação:** antes de v1.0/público, responsável deve aprovar explicitamente a proposta ou optar por resposta uniforme; reabrir imediatamente se o cadastro tornar-se irrestrito, houver evidência de enumeração/abuso, ou a mitigação distribuída não estiver configurada. Se resposta uniforme for escolhida, definir UX e contrato compatíveis para endereços novos e existentes e testar a ausência de diferenças observáveis.

**AUTH-A11: ACEITE PROPOSTO.** Não há aprovação explícita do responsável registrada; este documento não atribui aceite em nome dele.

### Validações e estado

| Verificação | Resultado |
|---|---|
| `pnpm exec tsc --noEmit` | Aprovado, exit code 0 |
| `pnpm exec eslint .` | 0 erros, 7 warnings já conhecidos, exit code 0 |
| `pnpm exec vitest run --maxWorkers=1` | 111 arquivos; 1.348/1.348 testes aprovados, exit code 0 |
| `git diff --check` | Aprovado, exit code 0 (avisos Git de conversão LF/CRLF, sem erros de diff) |
| Playwright focused de cadastro | 2/2 aprovados, exit code 0 |
| Playwright funcional completo | 68 aprovados, 1 ignorado, 14 bloqueados por 429, exit code 1 |
| Build | Não repetido: as mudanças desta etapa são do harness/specs E2E; build Next havia passado na validação anterior e não houve alteração de runtime nesta etapa |
| Lockfile/dependências | `pnpm-lock.yaml` sem diff; nenhuma dependência adicionada |

Ao concluir, os processos `node.exe` iniciados pelo launcher estavam encerrados; não foi encontrado servidor Next ou mongod criado pela execução. O `mongod.exe` preexistente permaneceu intocado.

**AUTH-A8: PARCIAL** — jornada integrada de cadastro/confirm/login comprovada isoladamente; suíte funcional restante foi executada, mas não ficou verde por saturação de rate limit e IGDB real permanece sem credenciais autorizadas. **AUTH-A11: ACEITE PROPOSTO** — sujeito a aprovação explícita. **AUTH-01B.3: PARCIAL** — não declarar conclusão integral enquanto persistirem a limitação de execução da bateria E2E e a decisão formal AUTH-A11. Próxima etapa: AUTH-01C, homologação controlada de domínio/provedor/ambientes, além de plano seguro de execução E2E sem relaxar limites. W-06 continua pendente de configuração/homologação distribuída; W-08 mantém o estado do adendo próprio; W-12 segue parcial e depende de configuração/homologação remota.

---

## Adendo — AUTH-01B.3-E2E-R: Recuperação da suíte Playwright (12/11/2026)

### A. Diagnóstico das falhas anteriores

Foi consultado `tests/e2e-perf/.results/summary.json` da execução anterior e os 14 `error-context.md` gerados pelo Playwright; nenhum teste foi omitido para o diagnóstico. O contrato em `server/auth/rate-limit.ts` usa um `Map` em memória por `${clientKey(request)}:${routeKey}`, sendo o client key o primeiro `x-forwarded-for` ou `unknown`; o bucket tem janela fixa de 15 minutos e máximo 20. O bypass depende somente de `NODE_ENV === "test"`; o harness usa `next start` (production) para testar runtime real, portanto não recebe esse bypass. O limite não foi alterado.

| # | Teste que falhou | Falha observada / evidência HTTP | Classificação |
|---:|---|---|---|
| 1 | `e2e-auth.spec.ts` — login via UI e persistência | Permaneceu em `/login`; DOM do error-context mostra alerta “Too many requests, try again later”. | Saturação confirmada |
| 2 | `e2e-auth.spec.ts` — cadastro, email interceptado, confirmação e login | O login pré-confirmação esperava 401 e recebeu 429. | Saturação confirmada |
| 3 | `e2e-auth.spec.ts` — conta pendente e confirmação pelo endpoint | O login da conta pendente esperava 401 e recebeu 429. | Saturação confirmada |
| 4 | `e2e-auth.spec.ts` — isolamento usuário B | Helper `loginUser` recebeu HTTP 429 / `RATE_LIMIT_EXCEEDED`. | Saturação confirmada |
| 5 | `e2e-auth.spec.ts` — troca de senha/sessionVersion | Helper `loginUser` recebeu HTTP 429 / `RATE_LIMIT_EXCEEDED`. | Saturação confirmada |
| 6 | `e2e-auth.spec.ts` — reset e invalidação de sessão | Helper `loginUser` recebeu HTTP 429 / `RATE_LIMIT_EXCEEDED`. | Saturação confirmada |
| 7 | `e2e-review-editor.spec.ts` — modo `userGameId` | Preparação da conta falhou em `loginUser` com HTTP 429. | Saturação confirmada |
| 8 | `e2e-review-editor.spec.ts` — isolamento de rascunhos por conta | Preparação da conta falhou em `loginUser` com HTTP 429. | Saturação confirmada |
| 9 | `e2e-review-homolog.spec.ts` — H1 persistência longa | Preparação da conta falhou em `loginUser` com HTTP 429. | Saturação confirmada |
| 10 | `e2e-review-homolog.spec.ts` — H2 navegação com gravação pendente | Preparação da conta falhou em `loginUser` com HTTP 429. | Saturação confirmada |
| 11 | `e2e-review-homolog.spec.ts` — H3 conflito entre guias | Preparação da conta falhou em `loginUser` com HTTP 429. | Saturação confirmada |
| 12 | `e2e-review-homolog.spec.ts` — H4 fidelidade Markdown | Preparação da conta falhou em `loginUser` com HTTP 429. | Saturação confirmada |
| 13 | `e2e-review-homolog.spec.ts` — H5 segurança da prévia | Preparação da conta falhou em `loginUser` com HTTP 429. | Saturação confirmada |
| 14 | `e2e-review-homolog.spec.ts` — H6 viewport mobile | Preparação da conta falhou em `loginUser` com HTTP 429. | Saturação confirmada |

Assim, **14/14** falhas foram confirmadas como interrupções pela resposta 429, diretamente no helper/asserção ou no alerta renderizado pela UI; não houve falha funcional independente entre essas falhas. Os casos afetados apareceram depois de muitos testes sequenciais no mesmo processo de servidor. A raiz é a repetição de cadastros de fixture e logins reais para cenários de domínio, todos contabilizados no mesmo bucket de login local durante a janela. Os relatórios mostram o status HTTP e mensagem, mas não registram o valor efetivo da chave IP nem o contador interno; portanto a identificação do bucket compartilhado decorre do código e da topologia comum local, não de logging interno do mapa.

### B. Isolamento adotado

Foi adicionada a `tests/e2e-perf/helpers.ts` a função `createAuthenticatedE2EContext`, que abre contexto independente com `tests/e2e-perf/.auth/user.json`. Esse storage state é produzido antes pelo `auth.setup.ts`: cria fixture verificada no Mongo efêmero e autentica pelo formulário/UI real, recebendo o cookie HttpOnly legítimo. Os E2E de domínio passam a reutilizar essa sessão em vez de criar e autenticar uma conta nova em cada caso. Dados de jogo continuam identificados por marcadores únicos; contextos de navegador permanecem separados. Testes que verificam biblioteca vazia ou isolamento entre contas mantêm usuários dedicados e logins legítimos. Os testes de cadastro, conta pendente, login, logout, reset, troca de senha e `sessionVersion` continuam exercitando os fluxos próprios de autenticação.

Não houve uso de JWT forjado, header `x-forwarded-for` sintético, endpoint de limpeza de limiter, reset de buckets, `NODE_ENV=test` no servidor, alteração de limite ou mudança em código de produção. A autenticação específica e o cenário de 429 simulado permanecem cobertos; a suíte Vitest completa também voltou a executar os testes de rate limit.

### C. Arquivos alterados nesta recuperação

- `tests/e2e-perf/helpers.ts` — helper de contexto com storage state gerado pelo setup.
- `tests/e2e-perf/e2e-game-form-review.spec.ts` — sessão do setup em testes de domínio.
- `tests/e2e-perf/e2e-game-form-review-rs0.spec.ts` — sessão compartilhada em casos de domínio; usuário adicional preservado no teste de ownership.
- `tests/e2e-perf/e2e-review-editor.spec.ts` — sessão compartilhada na maioria dos casos; duas contas reais preservadas no cenário de isolamento.
- `tests/e2e-perf/e2e-review-homolog.spec.ts` — sessão do setup nos testes de editor sem teste de identidade.
- `tests/e2e-perf/e2e-review-homolog-replset.spec.ts` — sessão do setup para proprietário; segunda conta real mantida para ownership.
- `tests/e2e-perf/e2e-library.spec.ts` — sessão do setup nos cenários de domínio; conta nova mantida para backlog vazio e segunda conta mantida no cenário cross-user.

Nenhum arquivo de produção foi modificado nesta recuperação.

### D. Resultado Playwright

O inventário permaneceu em 83 testes/11 arquivos. Com MongoMemoryReplSet local em porta dinâmica, banco `save-state-e2e`, servidor isolado em `localhost:3101`, captura local do email ativa, placeholders Twitch e saída externa bloqueada:

```text
pnpm exec playwright test --project=e2e
83 passed (1.9m)
exit code 0
```

Não houve falhas ou skips na execução recuperada. Auth setup, specs de autenticação, os testes de isolamento e a jornada de cadastro/confirm/login foram executados na suíte completa. Os testes de busca aceitam o estado recuperável de indisponibilidade do IGDB; os placeholders não comprovam integração real nem importação externa.

Reprodução adicional isolada após a correção: `pnpm exec playwright test tests/e2e-perf/e2e-auth.spec.ts --project=e2e` — **11/11 aprovados** (10 de autenticação + auth setup), exit code 0. A execução isolada e a execução completa passaram, confirmando o comportamento tanto sem testes de domínio anteriores quanto depois deles.

### E. Regressão e integridade

| Verificação | Resultado |
|---|---|
| `pnpm exec tsc --noEmit` | Aprovado, exit code 0 |
| `pnpm exec eslint .` | 0 erros, 7 warnings preexistentes, exit code 0 |
| `pnpm exec vitest run --maxWorkers=1` | 111 arquivos; 1.348/1.348 testes, exit code 0 |
| `git diff --check` | Aprovado, exit code 0; apenas avisos Git de conversão LF/CRLF |
| `pnpm-lock.yaml` | Sem diff |
| Build | Não repetido: somente helpers/specs de teste foram alterados; produção e configuração Next não mudaram |

### F. Segurança, ambiente e pendências

Os limites reais continuam em 20 logins/cadastros por 15 minutos por chave de cliente/rota; os testes dedicados de rate limit não foram removidos ou relaxados. `emailVerifiedAt`, criação de cookie por login real, `sessionVersion` e autorização por usuário foram preservados. A execução usou apenas banco MongoMemoryReplSet efêmero; nenhuma credencial real, Resend, Atlas ou Vercel foi acessado.

O processo Node/Playwright e o MongoMemoryReplSet iniciados pelo launcher foram encerrados, arquivos temporários de captura removidos e a porta 3101 deixou de ser usada. O `mongod.exe` preexistente (filho de `services.exe`) foi deixado intocado. Alterações locais preexistentes, branch `main` e HEAD `9aaa952bae0bbe0bfca5674d301b0284c44bc824` foram preservados. Nenhum commit, push ou deploy ocorreu.

**AUTH-A8: RESOLVIDO localmente quanto ao escopo E2E funcional** — causa das 14 falhas identificada e corrigida no harness; suíte completa passou 83/83. Busca/importação IGDB real permanece para homologação autorizada. **AUTH-01B.3-E2E-R: CONCLUÍDA.** A conclusão da tarefa E2E não altera a decisão pendente sobre **AUTH-A11: ACEITE PROPOSTO**, que exige aprovação explícita do responsável; **AUTH-01C**, W-06 (mitigação distribuída) e W-12 (readiness remoto) continuam pendentes nos termos dos adendos anteriores.

Os testes Vitest usaram apenas MongoMemoryServer/MongoMemoryReplSet efêmeros; nenhum Atlas ou banco persistente foi conectado. Nenhum email real, credencial real, dependência, lockfile, migração, seed, configuração remota, commit, push ou deploy foi usado/alterado. O harness Playwright não foi executado.

---

## Adendo — AUTH-01B.4: Mitigação de enumeração no cadastro (11/11/2026)

### A. Diagnóstico

Antes desta alteração, `POST /api/auth/register` retornava `201` com `SafeUser` para endereços novos, mas `400` com `EMAIL_ALREADY_IN_USE` para duplicidades sequenciais. A corrida de índice único também era convertida nesse erro explícito. Para endereço novo, o handler aguardava token e Resend antes de responder; uma falha de configuração/provedor produzia `500`, enquanto uma conta já existente não chamava o Resend. Assim status, JSON e caminho de execução permitiam enumeração, incluindo uma diferença grosseira por chamada de rede externa. Índice único `email` no modelo User é mantido como garantia concorrente.

### B. Contrato e integridade

Pedidos sintaticamente válidos admitidos pelo limitador respondem com `201` e o mesmo envelope `{ data: { message } }` para endereço novo, pendente e verificado. Não são retornados email, ID, estado, token nem sessão. Validação continua anterior à operação, 429 continua ativo e erros internos de banco permanecem erros sanitizados. O formulário navega ao `/check-email`; validações permanecem visíveis e falha operacional orienta recuperação sem informar estado da conta.

Para endereço existente, é calculado e descartado bcrypt para reduzir a diferença de trabalho dominante; não há escrita na conta, substituição de senha, alteração de `emailVerifiedAt`/`sessionVersion`, sessão ou token novo. A confirmação da conta nova é agendada com `after()` e não bloqueia a resposta; reenvio usa a mesma entrega diferida e resposta genérica. Reenvio continua limitado pelo limitador existente. Falhas de configuração, rejeição e timeout são observadas em log com somente tipo/nome do erro, sem endereço, token ou senha. O fluxo segue recuperável por `/check-email`.

O índice único permanece autoridade final. Erros `11000` só são classificados como email duplicado quando `keyPattern.email`, `keyValue.email` ou o nome exato do índice `email_1` identificam esse campo; outros conflitos/erros de banco não são convertidos em sucesso. A corrida não cria uma segunda conta nem token ligado à conta vencedora pelo perdedor.

### C. Temporização e riscos residuais

Bcrypt adicional evita o retorno imediato simples para endereço existente, e o envio externo foi removido do caminho síncrono de resposta. Isso reduz sinais grosseiros, mas não é tempo constante: leitura/índice, persistência de conta/token, carga, latência de Mongo e escalonamento Next ainda podem variar. Não há atraso artificial nem chamada externa fictícia. Diferenças estatísticas residuais não são declaradas impossíveis. O limitador atual não é proteção distribuída; W-06 (rate limiting distribuído/WAF) continua necessário e não foi relaxado. A execução do callback `after()` depende do runtime/infraestrutura Next; falha de entrega não revoga a conta e reenvio permanece o mecanismo de recuperação.

### D. Verificação local

Vitest focado pós-alteração: `pnpm exec vitest run tests/auth/register-login.test.ts tests/auth/token-transactions.test.ts tests/mutations/concurrency.test.ts tests/auth/login-failures.test.ts tests/seeds/atlas-seed.test.ts --maxWorkers=1` — 5 arquivos, 59 testes aprovados, exit code 0; após incluir teste de configuração Resend ausente, `tests/auth/register-login.test.ts` passou 17/17. Regressão global final `pnpm exec vitest run --maxWorkers=1`: **111 arquivos, 1.350/1.350 testes aprovados**, exit code 0. TypeScript (`pnpm exec tsc --noEmit`) passou, exit code 0; ESLint (`pnpm exec eslint .`) teve 0 erros e 7 warnings preexistentes; `git diff --check` passou, exit code 0; `pnpm-lock.yaml` não tem diff.

Playwright no clone isolado (build separado, MongoMemoryReplSet local `save-state-e2e`, captura local e egress do servidor bloqueado): **83/83 passaram**, incluindo setup e 11 casos de autenticação, exit code 0. O runner usa diretamente o CLI local do Playwright e invoca o provisionador via TSX para evitar pnpm tratar o `node_modules` junction como instalação necessária; não alterou o harness no working tree. Foram usados somente sentinelas Twitch não válidos e o preload bloqueou as chamadas externas; as mensagens `Twitch token request failed` demonstram a indisponibilidade simulada, não uma conexão a Twitch. Nenhum Resend/IGDB/Atlas real foi acessado.

Build Next no clone isolado: `node node_modules/next/dist/bin/next build --no-lint` — compilação concluída, tipos conferidos, 60 páginas estáticas geradas, exit code 0. Para evitar fetch público de `next/font/google`, a variável de teste `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` usou resposta CSS mock e um arquivo WOFF2 já presente no cache local; nenhum arquivo de fonte/layout versionado foi alterado. `--no-lint` evitou uma falha de resolução do plugin ESLint causada pela junction temporária; ESLint foi executado separadamente no working tree e passou com zero erros/7 warnings preexistentes. Uma primeira chamada de build sem mock de fonte falhou no loader Google Fonts por indisponibilidade de rede; o build final acima é a execução isolada concluída.

**AUTH-A11: RESOLVIDO LOCALMENTE** quanto à enumeração direta pelo contrato público, sem alegação de tempo constante. **AUTH-01B.4: CONCLUÍDA localmente** — contrato, integridade, Vitest, Playwright, TypeScript, ESLint, build isolado e diff check verificados. AUTH-01C, homologação real de Resend/domínio e W-06 (proteção distribuída/WAF) permanecem pendentes fora do escopo; nenhuma homologação externa ocorreu nesta fase.

---

## Adendo — AUTH-01C.1: Auditoria pré-deploy local (11/11/2026)

Relatório operacional completo: [`AUTH_01C_PREDEPLOY_AUDIT.md`](AUTH_01C_PREDEPLOY_AUDIT.md). A fase foi somente local; não houve acesso a Vercel, Atlas, DNS, Resend, Twitch/IGDB, banco persistente ou credenciais reais, nem email, deploy, commit/push, instalação ou alteração de lockfile.

**Estado:** AUTH-01C.1 concluída como auditoria; Preview e Production não homologados. Não foi confirmado bloqueador de código para criar um Preview isolado, mas sua configuração/deployment depende de autorização do proprietário e de recursos descartáveis protegidos. Homologação Preview depende de isolamento Atlas, índices, HTTPS, credenciais de ambiente, remetente/inbox controlados e acesso restrito. Promoção Production permanece **NO-GO** até homologação, decisão/mitigação W-06, configuração operacional e aprovação.

**Achados principais:** W-06 continua pendente (rate limit em memória por instância); W-08 tem CSP Report-Only, portanto sem enforcement; W-12 está implementado read-only, porém token/monitor/alertas não foram configurados; W-14 e Resend continuam sem teste real. W-11 apresenta `lang="en"` e não foram encontrados `robots.txt`/sitemap no inventário local; requer decisão de produto/SEO, sem evidência aqui de vazamento de conteúdo privado. Runtime Node 24, pnpm 11.3 e lockfile v9 estão alinhados localmente, não confirmados no painel Vercel. Atlas e DNS/provedor permanecem pendências externas.

As validações globais não foram repetidas porque esta fase não mudou código: a baseline AUTH-01B.4 está registrada acima (Vitest 111 arquivos/1.350 testes, TypeScript aprovado, ESLint sem erros/7 warnings, Playwright 83/83 e build isolado aprovado). `git diff --check` foi executado antes da edição documental e será novamente conferido após este adendo; não se declara resultado posterior até essa conferência.

**Próxima etapa: AUTH-01C.2**, somente mediante autorização explícita, seguindo a sequência, checklist e critérios go/no-go do relatório. Este adendo não declara deployment ou homologação.
