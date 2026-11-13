# DB-LOCAL-01 — Diagnóstico de conexão MongoDB no desenvolvimento

**Data:** 11/11/2026
**Resultado:** inconclusivo quanto à causa exata do HTTP 500. Evidências atuais afastam uma falha ampla de resolução DNS ou de conectividade TCP, mas não verificam protocolo MongoDB, TLS, autenticação nem acesso ao database.

## A. Ambiente

- Projeto na raiz do checkout atual (`C:\Users\Heric\Desktop\save-state`); branch `main`, HEAD `9aaa952bae0bbe0bfca5674d301b0284c44bc824`.
- Windows 11 Home, Node `v24.22.1`, Next.js instalado `15.5.29`.
- O estado do Git já tinha numerosas alterações locais não commitadas antes do diagnóstico; foram preservadas. Nenhum arquivo de aplicação foi alterado.
- A URI configurada é remota `mongodb+srv://`, com hostname classificado sanitizadamente como compatível com Atlas. Nenhum hostname ou valor de configuração é reproduzido neste relatório.
- Foram encontrados listeners locais em `127.0.0.1:27017` (`mongod`) e `[::]:3000` (`node`, servidor de desenvolvimento). São processos preexistentes no ambiente e foram preservados. O `mongod` local não é o destino configurado pela URI atual, que é remota. Nenhum processo persistente foi iniciado pelo diagnóstico.

## B. Configuração e ambiente

Arquivos presentes: `.env` e `.env.example`. Não foram encontrados `.env.local`, `.env.development` ou `.env.development.local`. O shell que executou o diagnóstico não tinha `MONGODB_URI`, `MONGODB_DB_NAME`, `NODE_ENV`, `VERCEL_ENV` ou `VERCEL` herdados; isso **não permite ler retroativamente** o ambiente do processo Next que produziu a falha.

Foi feita leitura em memória de `.env` apenas para classificar configuração e realizar os testes DNS/TCP limitados. Nenhum valor foi emitido. Resultado:

| Variável/atributo | Resultado sanitizado |
|---|---|
| `MONGODB_URI` | Presente; formato `mongodb+srv` remoto; contém informação de credencial (não registrada). |
| Database na URI | Sem database path. |
| Opções da URI | Nenhuma opção query detectada. |
| `MONGODB_DB_NAME` | Ausente do ambiente do processo de diagnóstico e de `.env`. |
| `NODE_ENV` | Ausente do shell de diagnóstico; o Next `dev` normalmente estabelece `development` no processo da aplicação. |
| `VERCEL` / `VERCEL_ENV` | Ausentes no shell de diagnóstico; sem evidência de contexto Vercel local. |

No desenvolvimento local, `resolveMongoDbName` escolhe o fallback `save-state` se `MONGODB_DB_NAME` estiver ausente. Em Vercel Preview/Production a ausência falha de forma explícita. Não foi alterado o nome do database. Um database incorreto pode direcionar a aplicação ao destino lógico errado, mas normalmente não explica sozinho um timeout de seleção de servidor.

No `next dev`, a prioridade normal de carregamento é variável já herdada pelo processo, depois `.env.development.local`, `.env.local`, `.env.development` e `.env`; somente `.env` existia no inventário. O processo real do Next não estava disponível para inspecionar suas variáveis e não foi iniciado para reproduzir a falha. Portanto, uma variável antiga herdada por um servidor Next preexistente não pode ser descartada retrospectivamente.

## C. Caminho da falha

O código atual confirma este fluxo:

1. `POST /api/auth/register` entra no Route Handler Node.js.
2. Handler aplica rate limit e valida o body.
3. Chama `registerUserForPublicSignup`.
4. O serviço chama `connectDatabase()` **antes** de ler/criar usuário ou token.
5. `connectDatabase()` valida as variáveis, resolve o database (`MONGODB_DB_NAME` ou fallback local), cria/reutiliza a promise global e chama `mongoose.connect(uri, { dbName, ...options })`.
6. Se `mongoose.connect` rejeita, o `catch` de `db/connection.ts` descarta a causa original e lança a mensagem genérica `MongoDB connection failed; verify the configured URI and network settings (credentials redacted)`.
7. `handleRoute` registra erro sanitizado no servidor e retorna `INTERNAL_ERROR` HTTP 500. O código de cadastro não alcança escrita de usuário/token nem agendamento do email.

A linha aproximada do bundle não prova a linha correspondente do TypeScript. No arquivo atual, a chamada fica em `db/connection.ts` linhas 67–73; a mensagem é lançada pelo `catch`, não identifica uma causa específica.

## D. Configuração Mongoose e tempo observado

`db/mongo-config.ts` define `maxPoolSize: 5`, `minPoolSize: 0`, `serverSelectionTimeoutMS: 10_000`, `socketTimeoutMS: 45_000` e `maxIdleTimeMS: 30_000`. O tempo do log (~12,5s) é compatível com a janela de seleção de servidor de 10s acrescida do overhead do request/compilação; não prova timeout, porque o código converte qualquer rejeição do `mongoose.connect` à mesma mensagem. `socketTimeoutMS` de 45s não é o limite de seleção.

O cache compartilha promise/conexão para chamadas concorrentes. Em rejeição, limpa a promise; se Mongoose estiver desconectado, limpa também identidade, permitindo nova tentativa. Cache de URI/database incompatível e conexão em estado não reutilizável geram mensagens próprias antes do `catch`; não são a melhor correspondência para o erro genérico observado, embora estado do processo na hora da falha não tenha sido capturado.

## E. DNS e conectividade sem autenticação

Testes atuais, limitados ao destino obtido internamente da URI configurada, sem imprimir host e sem autenticação:

| Teste | Resultado |
|---|---|
| Resolução SRV via resolver Node | Sucesso; 3 alvos retornados. |
| Resolução TXT via resolver Node | Sucesso. |
| Resolução dos hosts SRV via Node `dns.lookup` | 3/3 resolvidos. |
| TCP aos alvos/portas anunciados por SRV | 3/3 conectaram, timeout de 2,5s por alvo; nenhuma negociação Mongo/TLS/autenticação. |
| Resolvedor Windows (`Resolve-DnsName`) | SRV 3 alvos; TXT resolvido; registros A de 3/3 alvos resolvidos. Resultado atual coincide com o teste Node. Endereços DNS foram omitidos. |
| Portas locais | TCP `127.0.0.1:27017` aceita conexão pelo processo `mongod`; porta `3000` está em listen pelo processo Node. Portas `27018`, `3001` e `3101` não aceitaram conexão. O Mongo local não foi autenticado/acessado pelo protocolo MongoDB. |

Esses resultados mostram que **no momento do diagnóstico** o problema histórico de SRV no Windows não se reproduziu e não há bloqueio TCP geral até os alvos testados. Há um MongoDB local disponível, mas a URI remota significa que ele não atende a conexão atual do app. Os resultados não provam que DNS/network estavam iguais no horário do cadastro, que a configuração do processo Next era a mesma, nem que os servidores completam handshake MongoDB/TLS. Também não consultamos painel Atlas, firewall, allowlist ou estado do cluster.

## F. Diagnóstico diferencial

| Hipótese | Evidência favorável | Evidência contrária | Estado |
|---|---|---|---|
| URI ausente/inválida | Não há evidência; URI existe e usa esquema SRV esperado. | SRV/TXT e hosts são resolvidos com sucesso; forma geral reconhecida. Validação completa pelo parser/driver não foi executada. | NÃO VERIFICADA (invalidade ampla improvável) |
| Variável não carregada / sobrescrita no Next | Shell não herdava variáveis; processo Next da falha não foi capturado. `.env` existe. | `.env` atual contém URI e é fonte padrão de `next dev`. | NÃO VERIFICADA para o processo que falhou |
| DNS SRV falhando | Histórico de problema semelhante no Windows. | Resolvedores Windows e Node resolvem SRV/TXT e alvos no teste atual. | DESCARTADA no teste atual; NÃO VERIFICADA no momento da falha |
| Servidor Mongo indisponível | Falha original de conexão é real segundo o log. | TCP aos três alvos remotos conecta agora; mongod local também está ativo, mas não é destino configurado. | NÃO VERIFICADA no protocolo Mongo; indisponibilidade ampla improvável no teste atual |
| Porta inacessível | Poderia causar seleção expirada. | TCP aos alvos SRV conectou 3/3 agora. | DESCARTADA como bloqueio TCP atual; estado histórico desconhecido |
| Restrição de rede/allowlist Atlas | Aplicação usa destino remoto; política externa não inspecionada. | TCP atual conectou. Isso não testa hello/TLS/autenticação e não valida política do painel. | NÃO VERIFICADA |
| Credencial rejeitada | URI contém credencial; nenhum login foi tentado. | Nenhuma evidência de aceitação ou rejeição. | NÃO VERIFICADA |
| TLS incompatível/handshake falho | TCP não valida TLS; erro original foi perdido pelo helper. | Nenhuma evidência positiva; os testes permitidos não fazem handshake Mongo/TLS. | NÃO VERIFICADA |
| Database incorreto | `MONGODB_DB_NAME` ausente e sem database path; código usa fallback `save-state`. | A seleção de database ocorre após descoberta de servidor; não explica normalmente `server selection timeout`. | CONFIGURAÇÃO LOCAL CONFIRMADA; causa do HTTP 500 DESCARTADA como explicação suficiente |
| Cache de conexão inválido | Processo de desenvolvimento pode manter estado em memória. | Rejeição limpa promise/cache; cache mismatch tem erro distinto. Processo no momento da falha não foi inspecionado. | NÃO VERIFICADA; menos provável pelo texto genérico |
| Outro: falha de seleção/handshake ou estado transitório no instante do POST | Timeout 10s corresponde aproximadamente ao intervalo reportado e erro genérico vem de rejeição do driver. | Causa original foi apagada; conectividade atual passou. | PROVÁVEL como classe de falha; subcausa inconclusiva |

## G. Causa e correção mínima recomendada

**Veredito: DB-LOCAL-01 INCONCLUSIVO.** Não é possível apontar com evidência suficiente credencial, TLS, allowlist, cluster ou configuração do Next como causa raiz, pois o código atual apaga o erro técnico original e os testes restritos não autenticam no Mongo persistente.

**Hipótese mais provável:** no instante do POST, a conexão não completou seleção/handshake de servidor dentro da janela de aproximadamente 10s (transiente, TLS/protocolo ou política/credencial que impede o handshake). O sintoma atual não parece uma falha ampla de DNS SRV ou TCP. A causa mais concreta de configuração detectada é a ausência de `MONGODB_DB_NAME`, que faz desenvolvimento usar `save-state`; corrija esse direcionamento apenas após confirmar com o proprietário qual database local/de desenvolvimento é o pretendido. Não é uma explicação demonstrada para o timeout.

**Menor próximo passo, sem patch:** confirmar com o operador que mantém o Mongo o database de desenvolvimento pretendido; em seguida, mediante autorização explícita para conexão autenticada de diagnóstico, realizar uma única conexão read-only/sem operações de dados, com a mesma origem `.env` e versão do Node, capturando tipo/código da exceção do driver sem URI/credenciais. Se o proprietário não autorizar conexão, pedir que execute localmente `mongosh`/um probe equivalente e compartilhe apenas código/nome sanitizado do erro. Depois verificar em ordem: (1) processo Next iniciou com a URI esperada e sem override herdado; (2) authSource/credencial/TLS; (3) regra Network Access e disponibilidade do cluster; (4) database explícito correto. Um TCP connect não substitui isso.

Não se recomenda alteração no cadastro. Não se recomenda aumentar timeout como primeira correção: os 10s são finitos e o registro já retorna indisponibilidade; aumentar o limite pode apenas prolongar a falha. Não há patch de código recomendado nesta fase. Se for necessário diagnóstico de código, propor separadamente logging local opt-in do `name`, `code`, `codeName`, `cause` e `reason` do erro de seleção, com sanitização rigorosa, sem URI, host, usuário, mensagens que contenham connection string ou stack não filtrada. Isso requer revisão/implementação autorizada; nenhum logger foi alterado.

## H. Segurança, testes e integridade

- Nenhuma conexão MongoDB autenticada foi aberta; nenhuma consulta de dados foi realizada. O listener local foi identificado por porta/processo apenas; não houve handshake Mongo.
- Os probes feitos foram apenas DNS e TCP não autenticados ao destino remoto já configurado; nenhum dado foi enviado em protocolo MongoDB.
- Nenhuma escrita, cadastro, migração, seed, provisionamento de índices ou operação remota de Atlas foi executada.
- `.env` não foi alterado e seus valores não foram exibidos. Nenhuma configuração de rede/serviço foi alterada; processos encontrados foram preservados.
- Nenhuma dependência/lockfile foi alterada; sem testes, build, commit, push ou deploy.
- `git diff --check` e estado final do Git devem ser registrados na conclusão da tarefa. Alterações desta fase se limitam a este relatório.

## I. Próximos passos e limites

1. Confirmar qual database o desenvolvedor deve usar; configurar `MONGODB_DB_NAME` somente após essa decisão, sem assumir `save-state` nem alterar `.env` automaticamente.
2. Reiniciar o próprio servidor de desenvolvimento somente pelo operador, se houver mudança aprovada de env; isso não foi feito nesta auditoria.
3. Se persistir, autorizar explicitamente um teste de conexão autenticado e sem leitura/escrita de dados, ou executar o teste pelo proprietário do banco.
4. Capturar o erro original sanitizado para distinguir server selection, autenticação, TLS ou estado do servidor.
5. Somente depois do diagnóstico validar o cadastro em ambiente local controlado. O fluxo não foi reexecutado e não se afirma que funciona.

Não houve alteração do status AUTH-01C.2 nem declaração de homologação Atlas, Resend ou Vercel.

---

## Adendo — DB-LOCAL-02: probe Atlas autorizado (11/11/2026)

O probe isolado usando MongoDB Driver `6.20.0` e o loader de ambiente Next `15.5.29` confirmou: URI presente em `.env`, aceita pelo parser; DNS SRV/TXT e TCP já haviam passado; a tentativa de seleção/conexão atual falhou em ~10,2s com erro interno classificado sanitizadamente como `TLS_HANDSHAKE_ERROR`. O handshake não foi concluído, portanto autenticação não foi confirmada; o `ping` não foi executado. O cliente foi fechado. Nenhuma consulta/escrita/alteração remota ocorreu.

**Correção histórica:** a afirmação acima de que a URI não contém database path estava incorreta; DB-LOCAL-02 confirmou um path, sem registrar seu nome. `MONGODB_DB_NAME` continua ausente e o código seleciona explicitamente o fallback local `save-state`; isso é independente da falha TLS. O relatório detalhado, limites, recomendação e plano para nome exclusivo estão em [`DB_LOCAL_02_ATLAS_CONNECTION.md`](DB_LOCAL_02_ATLAS_CONNECTION.md). Não houve alteração de código ou configuração e o estado AUTH-01C.2 permanece inalterado.
