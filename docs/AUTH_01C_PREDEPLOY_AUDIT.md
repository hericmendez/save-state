# AUTH-01C.1 — Auditoria pré-deploy local

**Data:** 11/11/2026  
**Escopo:** somente arquivos e evidências locais. Nenhuma consulta ou alteração externa foi feita.  
**Resultado:** auditoria local concluída; Preview e Production ainda não homologados.

## 1. Resumo executivo

O checkout está tecnicamente preparado para iniciar uma configuração isolada de Preview, condicionado à confirmação manual dos parâmetros de projeto/runtime e à preparação de recursos remotos exclusivos. Não há evidência local de configuração no painel Vercel, conectividade Atlas, domínio/Resend ou credenciais IGDB/Twitch reais. Logo, **não está autorizado nem comprovado iniciar deployment ou homologação externa com base nesta auditoria**. A promoção para Production não está pronta.

O código contém proteções locais verificáveis: seleção explícita do banco em Vercel, verificação fail-closed de índices, readiness autenticada e read-only, cookies HttpOnly e revogação por `sessionVersion`, fluxo transacional de tokens e resposta uniforme de cadastro. Limitações/pendências principais: limiter em memória (W-06), CSP somente Report-Only, W-11 incompleto, dependência da entrega não persistente via `after()`, configurações remotas desconhecidas e integrações não testadas com serviços reais.

**Não foi encontrado bloqueador de código comprovado para construir um Preview isolado**, mas a homologação segura fica bloqueada até o proprietário confirmar isolamento, credenciais descartáveis, acesso restrito e recursos de e-mail. Production público fica **NO-GO** enquanto W-06 e as configurações essenciais não forem decididos/homologados.

## 2. Inventário técnico

| Item | Evidência local |
|---|---|
| Aplicação / workspace | Raiz atual; Next.js App Router; `pnpm-workspace.yaml` contém `packages: ["."]` e allowBuilds para `esbuild`, `mongodb-memory-server`, `unrs-resolver`. |
| Runtime | Node local `v24.22.1`; `engines.node: 24.x`; `.nvmrc` contém `24`; `packageManager: pnpm@11.3.0`; pnpm local `11.3.0`. |
| Lockfile | `pnpm-lock.yaml`, versão `9.0`; deve ser instalado com pnpm compatível e conferido no log remoto. |
| Vercel | `vercel.json` não encontrado. Root Directory, framework preset, instalação, build, Node e Corepack no painel são **desconhecidos**. O comentário do workspace recomenda Root Directory na raiz do app; confirmar sem presumir. |
| Scripts | `build=next build`, `typecheck=tsc --noEmit`, `lint=eslint .`, `test=vitest run`, `db:indexes=tsx scripts/verify-indexes.ts`; há scripts de migração/seeds, não usar no Preview. |
| Rotas sensíveis | Auth, health e ready declaram `runtime = "nodejs"`; Mongoose, bcryptjs e transações não são Edge. `sharp` está entre dependências runtime. |
| Dependências de build | TypeScript, ESLint, PostCSS/Tailwind e Next tooling estão em devDependencies; verificar que instalação do build não omite devDependencies. Não há evidência de Corepack já habilitado na Vercel. |
| Raízes duplicadas | Workspace tem comentário referindo `AGORA_VAI/pnpm-workspace.yaml`, mas neste inventário não foi validada uma segunda raiz/deploy; confirmar configuração do repositório no painel e evitar lockfile concorrente. |

**W-01/W-02:** versões alinhadas localmente, não verificadas na Vercel. Confirmar Node 24.x, pnpm 11.3.0 e `ENABLE_EXPERIMENTAL_COREPACK=1` se necessário no ambiente de build conforme suporte atual do projeto Vercel; verificar versão efetiva no log. Não adicionar variável nem mudar Root Directory sem a confirmação do proprietário.

## 3. Matriz de variáveis

Status Production e Preview para todas: **pendente de configuração/verificação remota**. Valores não foram consultados, copiados nem registrados. Obrigatoriedade se refere ao código/funcionalidade local.

| Variável | Uso / categoria | Obrigatoriedade e validação local | Production / Preview |
|---|---|---|---|
| `MONGODB_URI` | Runtime secreto, conexão Mongo | Obrigatória no runtime; string não vazia. | Pendente; URI e usuário separados por ambiente. |
| `MONGODB_DB_NAME` | Runtime, seleção explícita de database | Opcional no schema genérico, obrigatória em Vercel Production/Preview; não vazia/nome válido. | Pendente; database isolado, nome explicitamente conferido. |
| `JWT_SECRET` | Runtime secreto, assinatura JWT | Obrigatória; mínimo 32 caracteres. | Pendente; segredos distintos por ambiente. |
| `JWT_EXPIRES_IN` | Runtime, expiração de JWT | Opcional, default `7d`; revisar decisão operacional. | Pendente/confirmar política. |
| `APP_URL` | Runtime, URLs de e-mail e origem canônica | Obrigatória; URL limpa, origem sem credenciais/query/hash; HTTPS em produção. | Pendente; domínio HTTPS próprio de cada ambiente. |
| `RESEND_API_KEY` | Runtime secreto, envio de e-mail | Opcional no schema/boot; necessária para enviar (exceto bypass de teste). | Pendente; chave isolada/restrita quando possível. |
| `EMAIL_FROM` | Runtime, remetente | Opcional no schema/boot; necessária junto à chave para envio. | Pendente; remetente autorizado em domínio validado. |
| `READINESS_PROBE_TOKEN` | Operacional secreto, endpoint ready | Lido diretamente pela rota; mínimo 32 caracteres; não está no schema geral. Sem token/inválido ready retorna 404. | Pendente; token aleatório distinto por ambiente, exclusivamente server-side. |
| `SEARCH_METHOD` | Runtime não secreto, provedor de busca | Opcional, default `IGDB`; enum `IGDB` ou `ATP`. | Pendente; decidir provedor ativo. |
| `TWITCH_CLIENT_ID` | Runtime secreto/identificador para IGDB | Opcional no boot; obrigatório com secret para IGDB real. | Pendente; credencial apropriada ao ambiente. |
| `TWITCH_CLIENT_SECRET` | Runtime secreto para IGDB | Opcional no boot; obrigatório com ID para IGDB real. | Pendente; não usar credencial pessoal/prod sem decisão. |
| `ATP_BASE_URL` | Runtime, integração ATP alternativa | Opcional; presente no schema; conferir quando `SEARCH_METHOD=ATP`. | Pendente, condicional ao uso. |
| `NODE_ENV` | Runtime/build, modo do framework | Gerenciada pela plataforma; afeta HTTPS, cookies, logs e headers. | Não alterar sem necessidade; conferir valor efetivo. |
| `VERCEL_ENV`, `VERCEL` | Plataforma, seleção de ambiente/database e headers | Gerenciadas pela Vercel; não devem ser simuladas como prova remota. | Confirmar valores automáticos no deploy. |
| `ENABLE_EXPERIMENTAL_COREPACK` | Build/platform, habilitação Corepack conforme ambiente | Não lida pelo app; necessidade/configuração depende do build. | Pendente de confirmação no painel/log. |
| `LOG_LEVEL` | Operacional, verbosidade debug | Opcional; debug habilita logs detalhados. | Não habilitar debug indiscriminadamente em produção. |
| `E2E_*` | Testes apenas: DB/URL/email capture/Twitch | Usadas por Playwright/harness; não transportar para runtime do app. E2E requer salvaguardas de DB efêmero. | Não configurar no deployment normal. |
| `E2E_PORT`, `E2E_BASE_URL`, `E2E_APP_URL` | Harness de testes | Opcionais, defaults locais. | Não aplicável ao runtime. |
| `IMPORT_CONCURRENCY`, `IMPORT_ONLY` | Scripts locais de importação | Opcionais, scripts operacionais; fora da configuração do app. | Não aplicar automaticamente. |

Inventário derivado de `lib/env.ts`, usos diretos de `process.env`, config Playwright e scripts pesquisados. Variáveis de plataforma e ferramentas externas podem existir fora do código; revisar painel manualmente, sem copiar valores para o repositório. `.env.example` é parcial e não constitui prova de configuração de deploy.

## 4. Vercel: Production e Preview

Usar projeto/branch Preview protegido e URL HTTPS própria, sem indexação. Separar `MONGODB_URI`, `MONGODB_DB_NAME`, `JWT_SECRET`, `APP_URL`, `READINESS_PROBE_TOKEN`, Resend e credenciais de catálogo entre Production e Preview; não compartilhar banco nem assumir que URL não divulgada é controle de acesso. Proteger Preview por controle de acesso compatível com os testes de callback/cookies. Confirmar Root Directory, Node, pnpm/Corepack, comandos de install/build e não ignorar devDependencies de build.

Preview poderá criar usuários, tokens e enviar mensagens reais; usar banco descartável, caixas controladas e dados sintéticos. Desativar indexação via configuração adequada e confirmar headers/metadata manualmente. Não há configuração Vercel local que comprove essas políticas.

## 5. MongoDB Atlas e B-01

`db/mongo-config.ts` exige database explícito em Vercel Preview/Production e recusa fallback compartilhado; Mongoose usa `maxPoolSize: 5`, `minPoolSize: 0`, seleção 10s, socket 45s e idle 30s. Cache global reutiliza conexão/promise. Produção/readiness não deve provisionar índices automaticamente. Transações de auth dependem de replica set; Atlas deve oferecer esse requisito.

`scripts/verify-indexes.ts` é verify-only por padrão. Provisionamento é create-only e exige conjuntamente `--create-missing --yes`; não remove/substitui/sincroniza índices. Antes de servir tráfego, comparar modelos (incluindo índices unique, TTL e tokens), provisionar explicitamente e rodar verificação read-only. Não executar agora.

**W-03/W-04 — INFO, pendente externo:** confirmar egress Vercel e Atlas Network Access; não adicionar `0.0.0.0/0` por conveniência. Preferir solução de rede compatível com plano/provedor; se acesso amplo for inevitável, documentar risco, usuário de privilégio mínimo, segredo forte/rotacionável, database exclusivo, monitoramento e aprovação explícita. Production e Preview devem ter credenciais e databases separados. Confirmar replica set, usuário limitado ao database necessário, conectividade e ausência de URI path ambíguo.

## 6. Resend e e-mail

`server/auth/email.ts` envia via API HTTPS, timeout 10s, falha em configuração ausente/rejeição e não registra corpo/segredo; em `NODE_ENV=test` é no-op. Antes de AUTH-01C.2, proprietário confirma controle do domínio, validação Resend, SPF/DKIM, recomenda DMARC, remetente, chave por ambiente quando disponível e inbox de teste. Sem DNS/API nesta fase.

Tokens de confirmação expiram em 24h e reset em 1h (conforme histórico/modelos); URLs usam `APP_URL`. Os tokens persistem como hash. `after()` é usado em cadastro e reenvio depois que criação de usuário/token retorna; o callback trata e loga falhas sanitizadas. Isso preserva resposta pública uniforme, mas **não é fila durável nem garantia de entrega**: encerramento da função/plataforma pode afetar o trabalho. Há caminho de reenvio para recuperação. Não foi evidenciado acesso a dados/conexões encerrados pelo callback, que recebe job independente; verificar em Preview aceitação e entrega distintas. Pode haver retry manual e links simultâneos dentro da validade segundo a política AUTH-01B.2; primeiro sucesso invalida os demais.

Matriz futura: cadastro novo; e-mail existente (resposta uniforme, senha/sessões/tokens não substituídos); conta pendente; reenvio; link válido/expirado/reutilizado; forgot/reset; notificação pós-reset; falha simulada do provedor. Registrar separadamente resposta HTTP, aceitação pelo Resend, recebimento em inbox, abertura/consumo do link e alteração persistida. Nenhum email real foi enviado.

## 7. Autenticação e segurança

Implementação local: cookie `token`, HttpOnly, SameSite=Lax, Path `/`, Secure em produção; JWT carrega `userId` e `sessionVersion`, lookup compara versão corrente. Logout autenticado incrementa versão global; troca/reset de senha também revogam sessões anteriores. Login requer email verificado. Reset/verificação usam transações MongoDB e exigem replica set. Cadastro público mantém resposta uniforme para novo/existente; hash descartado de tentativa existente não é persistido, não cria sessão nem substitui token existente; erros operacionais seguem observáveis internamente. Esses comportamentos são evidência local, não homologação de integração.

**W-06 — HIGH, produção pública:** rate limiter é `Map` em memória por instância/função, fixed windows; cadastro 20/15min, forgot 5/15min, reset possui limite próprio e rotas sensíveis chamam `checkRateLimit`. Não coordena instâncias e não é limite global nem necessariamente por destinatário; IP/chave também depende do proxy. Antes de público, proprietário deve decidir/configurar WAF ou proteção distribuída. Validar disponibilidade/plano da Vercel, regras específicas para signup/login/forgot/reset/resend/verify, Preview, bypass de usuários internos, limites, falsos positivos e observabilidade de 429. Não foi configurado WAF; não classificar W-06 como resolvido por AUTH-A11.

## 8. Headers, privacidade e W-11

`next.config.ts` aplica headers globais. Há `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `X-Frame-Options: DENY`. CSP definida em `Content-Security-Policy-Report-Only` quando build production; **não bloqueia** violações. HSTS `max-age=15552000` apenas quando `VERCEL_ENV=production`, sem includeSubDomains/preload. Allowlist de imagens Next inclui IGDB e Wikimedia; política CSP permite imagens HTTPS amplamente por requisito do editor. Medir console/reports e editor em Preview antes de mudança; verificar cookies/HTTPS, headers de cache em rotas privadas, logs e ausência de tokens/dados pessoais em respostas.

**W-11 — MEDIUM, conteúdo/indexação:** inventário da aplicação não encontrou `robots.txt` ou sitemap; `app/layout.tsx` declara `lang="en"`. Verificar conteúdo público versus páginas privadas, canonical/metadata/noindex e idioma com responsável de produto/SEO antes do lançamento. Não há evidência local de vazamento de páginas privadas por indexação; não ampliar escopo automaticamente. Páginas de tokens têm metadata `referrer: no-referrer`, além do header global. Revisar que token em URL não é repassado por logs/analytics e que página não cacheia conteúdo autenticado.

## 9. Readiness e operação (W-12)

`/api/health` é liveness público e não consulta Mongo. `/api/ready` usa Node, requer bearer secreto de pelo menos 32 chars; ausente/inválido retorna 404 sem DB. Autorizado: connect, ping Mongo, inspeção read-only dos índices enforced. 200 ready ou 503 indisponível sanitizado, `Cache-Control: no-store`; log registra apenas tipo do erro. Cache de índices 30s por processo/identidade; ping a cada chamada; timeouts connect 11s, ping 2.5s e índices 4s. Não provisiona índices.

W-12 permanece **parcial** até configurar token distinto por ambiente e alertas. Futuro: testar health, ready sem token, token inválido, autorizado; em banco descartável simular banco/índice indisponível e timeout, confirmar 503 sanitizado e recuperação. Monitor deve enviar Authorization sem expor token em URL/log; se não suportar header secreto, manter rota sem token (404) ou aprovar controle equivalente.

Mínimo operacional: alertar 5xx, falhas Atlas/readiness, falhas e-mail, falhas auth, 429 anormais e falhas de build; conferir logs sanitizados e latência. Escolher retenção/acesso e responsável antes de público; não criar serviço nesta etapa.

## 10. IGDB/Twitch (W-14)

Credenciais Twitch são opcionais no boot; seleção IGDB exige Client ID + Secret. OAuth tem timeout 10s, cache em memória, single-flight e margem de expiração 60s; IGDB usa timeouts de 10s (search/detail) e 15s (cover), serialização mínima de 250ms, retry único de 401 e mapeamento de 429/indisponibilidade. Cache/limites são por processo. Busca/importação com placeholders E2E não prova integração real. W-14 **pendente de homologação**, não bloqueia Preview se recurso for deliberadamente não testado/desativado, mas bloqueia declarar catálogo real aprovado. Futuro: credencial de ambiente autorizada, OAuth, busca, detalhes, importação, snapshot persistido somente no database Preview, 401/429/timeout e indisponibilidade; nunca usar banco produtivo.

## 11. Achados classificados

| ID | Descrição e evidência | Severidade / ambiente / situação | Ação, dependência e responsável sugerido | Critério verificável |
|---|---|---|---|---|
| A01 / W-01/02 | Runtime e pnpm alinhados localmente; Corepack/Vercel não confirmados. | INFO — Preview/Production; pendente remoto. | Proprietário Vercel: revisar Root Directory, Node 24, pnpm/Corepack e log. | Build remoto mostra versões esperadas, sem lockfile alternativo. |
| A02 / W-03/04 | Egress/allowlist e bancos distintos são desconhecidos. | HIGH — Preview/Production; pendente configuração. | Proprietário Atlas/Vercel: isolamento, rede e least privilege; sem `0.0.0.0/0` automático. | Conexão validada em DB Preview separado, replica set e credencial limitada. |
| A03 / B-01 | Provisionamento create-only e verificação read-only existem; não executados contra remoto. | HIGH — Preview/Production; implementado, não homologado. | Operador de banco autorizado após setup. | Índices enforced de todos os modelos presentes/compatíveis e readiness 200. |
| A04 / W-07 | Resend implementado com timeout, mas domínio, DNS, chave e entrega não verificados. | HIGH — fluxo de auth Preview; pendente externo. | Proprietário Resend/DNS: autorizar domínio/remetente e inbox controlada. | Email aceito e recebido; links válidos consumidos em DB Preview isolado. |
| A05 / `after()` | Persistência usuário/token ocorre antes de agendar callback; catch/log sanitizado; não é fila persistente. | MEDIUM — Preview/Production; limitação operacional conhecida. | Operador: testar ciclo de vida e reenvio em Preview; não há infra nova aprovada. | Resposta, entrega, falha e recovery observados; nenhuma promessa de entrega. |
| A06 / W-06 | Limites em memória por instância; não distribuídos. | HIGH — público/Production; pendente decisão/configuração. | Proprietário segurança/Vercel: decidir WAF/limites distribuídos e cobertura. | Regras aplicadas e testes multi-instância/rotas, alertas 429/falsos positivos aceitos. |
| A07 / W-08 | CSP somente Report-Only; outras headers aplicadas no código. | MEDIUM — Preview/Production; política implementada parcialmente. | Produto/segurança: validar relatórios e editor em Preview; decisão separada antes de enforcing. | Relatórios sem violações inesperadas e headers confirmados na resposta real. |
| A08 / W-11 | `lang="en"`, sem robots/sitemap encontrados no inventário. | MEDIUM — público/SEO; verificado localmente. | Produto/SEO: decidir idioma, indexação, metadata/canonical/noindex. | Decisão aprovada e crawler não indexa conteúdo privado; públicos indexáveis conforme política. |
| A09 / W-12 | Ready read-only e autenticado localmente; segredo/monitor externos ausentes de evidência. | MEDIUM — operação; parcial. | Proprietário: token por ambiente e monitor que aceita header. | Matriz health/ready/falha concluída, responses sanitizadas e alertas operantes. |
| A10 / W-14 | Credenciais opcionais e integração com cache/timeouts; placeholders não homologam fornecedor. | MEDIUM — catálogo; pendente externo. | Proprietário Twitch/IGDB: decidir se Preview inclui teste com credenciais próprias. | Fluxos busca/importação aprovados no banco Preview sem segredos em logs. |
| A11 / W-15 | Histórico relata necessidade de E2E completo isolado; baseline fornecida pelo solicitante. | INFO — validação local/homologação; não repetida. | QA: E2E real apenas após infraestrutura efêmera explicitamente autorizada. | Playwright de Preview concluído sem database persistente compartilhado. |

Nenhum BLOCKER de implementação local foi confirmado. Dependências remotas são pendências operacionais, não confirmação de defeito nem comprovação de prontidão.

## 12. Bloqueadores por etapa

- **Criar/configurar Preview:** condicional. Código não apresenta bloqueador local comprovado; antes de executar, proprietário precisa aprovar configuração e assegurar credenciais/database descartáveis e proteção de acesso. Sem esses pré-requisitos, não iniciar deployment.
- **Homologar Preview:** bloqueada até existir deployment autorizado, banco Preview exclusivo com índices, HTTPS/URL correta, e-mail sob controle e acesso de teste seguro. W-14 pode ser excluído formalmente se integração não fizer parte do aceite.
- **Promover para Production:** NO-GO. Exige homologação Preview completa, decisão/mitigação de W-06, isolamento e backups/recuperação Atlas, e-mail e domínio autenticados, monitoramento/readiness, revisão W-11, critérios de segurança e aprovação explícita.

## 13. Checklist AUTH-01C.2 (não executar nesta fase)

1. Proprietário confirmar estado Git/branch e autorizar escopo; registrar limites e contato de rollback.
2. Definir URL Preview, domínio/canonical, acesso restrito e política de indexação.
3. Proprietário configurar/revisar projeto Vercel, Root Directory e Node 24/pnpm 11.3/Corepack; confirmar logs de install/build.
4. Criar database/credencial Mongo exclusivos de Preview, replica set, privilégio mínimo e política de rede aprovada; jamais `0.0.0.0/0` sem avaliação/aceite explícito.
5. Configurar ambiente Preview com valores próprios, `APP_URL` HTTPS, JWT e readiness tokens fortes e distintos; revisar produção sem copiar segredos para arquivos versionados.
6. Preparar índices de forma autorizada: executar primeiro verificação; provisionar somente com aprovação expressa e `--create-missing --yes` mirando database confirmado; executar verificação read-only após provisionamento. Não rodar migrações/seeds por conveniência.
7. Configurar domínio/remetente Resend e DNS pelo proprietário; usar inbox controlada e credencial específica, sem email real a destinatário externo.
8. Configurar proteção de Preview e decidir WAF (cobertura, plano, regras, false positives); não tratar obscuridade da URL como proteção.
9. Somente após autorização de deployment, publicar Preview e verificar build, domínio/HTTPS, `/api/health`, `/api/ready` nos quatro casos (ausente, inválido, autorizado, DB/index indisponível) sem registrar segredo.
10. Homologar auth por matriz da seção 6 em contas descartáveis; confirmar cookies, sessão/revogação, logs e entrega; limpar dados apenas pelo procedimento controlado do DB efêmero, sem limpeza indiscriminada.
11. Testar IGDB/Twitch, headers/CSP Report-Only/editor, privacidade, erros/429 e alertas; registrar evidências sem dados pessoais/secrets.
12. Registrar defeitos, aceite e decisão go/no-go. Nova autorização é necessária para qualquer alteração remota, criação de recursos ou promoção Production.

**Proprietário manualmente:** aprovar recursos, domínio/DNS, segredos nos painéis, permissões, rede, WAF e autorizar deployment. **Agente após autorização explícita:** ajudar a executar procedimentos acordados e testes permitidos, sem solicitar segredos no chat ou gravá-los no repo. **Dependências externas:** Vercel, Atlas, Resend, DNS e Twitch/IGDB. Se não fornecidos, nenhuma integração é presumida.

## 14. Plano de rollback

Em falha de Preview, interromper tráfego/testes e revogar/pausar o deployment pelo operador autorizado; preservar logs sanitizados e evidências. Desabilitar temporariamente o recurso/integration ou voltar à versão Preview anterior pelo procedimento da plataforma, sem tocar Production. Se suspeita de credencial exposta, revogar e substituir no painel; nunca copiá-la para issue/log. Se banco Preview for inconsistente, suspender escrita e restaurar/recriar somente a instância descartável conforme backup/decisão do proprietário; não apagar database sem confirmação explícita. Se e-mail abusivo, desativar envio/chave Preview e verificar fila/eventos do provedor. Revalidar health/readiness e registrar causa/aceite antes de retomar. Não há rollback remoto executado ou autorizado nesta fase.

## 15. Critérios go/no-go para Production

**GO somente quando:** Preview isolado e protegido foi homologado; build/logs confirmam runtime; banco Production escolhido e separado, replica set, menor privilégio, índices conferidos e recuperação testada; APP_URL/domínio/HTTPS e Resend autenticados; auth, links, cookies e sessões aprovados; WAF/antiabuso de W-06 decidido e verificado; headers/CSP e editor avaliados; indexação/idioma decididos; IGDB aprovado ou explicitamente fora do escopo; readiness/alertas e responsáveis operacionais testados; sem falhas críticas abertas; proprietário aprova promoção.

**NO-GO** diante de mistura de Preview/Production, índice enforced ausente, transações indisponíveis, segredo exposto, envio sem controle, readiness/monitoramento insuficiente, abuso sem mitigação aceita, regressão auth, falha de build ou decisão operacional não aprovada. Auditoria concluída não equivale a lançamento aprovado.

## 16. Evidências e limites desta execução

Inventário inicial registrado: branch `main`, HEAD `9aaa952bae0bbe0bfca5674d301b0284c44bc824`; working tree já continha alterações não commitadas extensas. Node `v24.22.1`, pnpm `11.3.0`, lockfile v9.0. `.env` existe; nenhum valor foi lido ou impresso. Não houve acesso a banco persistente, rede/provedor, envio de email, instalação, migração, seed, deployment, commit ou push. E2E completo e build não repetidos: não houve alteração de código; baseline indicada pelo solicitante, não reexecutada nesta tarefa.

Validação específica desta auditoria: `git diff --check` foi executado antes da edição e passou; deve ser reexecutado após documentação. Não se atribuem totais de testes locais a esta auditoria. O estado final do working tree deve ser interpretado contra o inventário inicial; somente este documento e o adendo readiness são mudanças desta etapa.
