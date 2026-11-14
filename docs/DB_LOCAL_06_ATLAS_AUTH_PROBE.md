# DB-LOCAL-06 — Probe autenticado do MongoDB Atlas no Garuda Linux

**Data:** 12/11/2026
**Horário do probe:** `2026-11-12 09:50:40 -03:00`
**Veredito:** **CONEXÃO AUTENTICADA APROVADA** — o driver MongoDB selecionou servidor, concluiu TLS com validação ativa, autenticou com a credencial local e executou um único `ping` administrativo. O database `save-state-dev` **não** foi criado, acessado ou validado.

## 1. Resumo executivo

- A URI local foi carregada com `@next/env` da versão instalada do Next.js, sem imprimir valores.
- O driver `MongoDB 6.20.0`, via `MongoClient`, concluiu `connect()` em **340 ms**.
- A conexão autenticada foi estabelecida. O TLS permaneceu com validação ativa; nenhuma opção insegura foi usada.
- O comando administrativo `ping: 1` foi executado uma única vez em `admin` e respondeu `ok: 1` em **18 ms**.
- O cliente foi encerrado com `close()` em **3 ms**; o processo terminou com exit code `0`.
- Nenhuma operação de leitura ou escrita de dados foi executada.
- O `ping` comprova resposta administrativa do servidor, **não** a existência, permissões ou índices do database `save-state-dev`.

## 2. Ambiente Linux

| Item | Valor observado |
|---|---|
| Sistema | Garuda Linux (rolling), KDE |
| Kernel | `7.2.14-zen1-1-zen` x86_64 |
| Diretório real do projeto | raiz do checkout local do Save State |
| Branch / HEAD | `main` / `9aaa952` |
| Estado inicial do working tree | 440 arquivos modificados e 33 não rastreados, preexistentes; preservados |
| Node.js | `v22.23.4` |
| OpenSSL do runtime / CLI | `3.6.5` / `3.6.5` |
| Next.js | `15.5.29` |
| Mongoose | `8.24.4` |
| MongoDB Node Driver | `6.20.0` |
| pnpm | `11.3.0` |
| Processo do probe | temporário, fora do repositório, encerrado ao final |

O projeto declara Node.js 24.x para produção. Nesta fase foi usado o Node.js 22.23.4 já presente no Linux; nenhuma versão foi alterada.

## 3. Configuração sanitizada

A configuração foi carregada com `@next/env 15.5.29`, modo `development`, a partir da raiz do projeto. `MONGODB_URI` e `MONGODB_DB_NAME` não estavam previamente definidos no processo, portanto a origem efetiva foi o `.env` local.

| Campo | Resultado permitido |
|---|---|
| `MONGODB_URI` | Presente |
| Formato | `mongodb+srv` |
| Credenciais | Presentes |
| Database path | Ausente |
| `MONGODB_DB_NAME` | Ausente |
| `authSource` | Implícito |
| Opções de query | Nenhuma |
| Opções TLS | Padrão (seguras) |
| `tlsInsecure` / `tlsAllowInvalid*` | Ausentes |
| `NODE_EXTRA_CA_CERTS` / `NODE_TLS_REJECT_UNAUTHORIZED` | Não definidos |
| `SSL_CERT_FILE` / `SSL_CERT_DIR` | Não definidos |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY` | Não definidos |

Nenhum valor de URI, usuário, senha, hostname, IP ou database path foi impresso ou persistido. Nenhuma credencial foi copiada ou substituída.

## 4. Comparação com Windows

| Item | Windows (DB-LOCAL-02/03) | Linux (DB-LOCAL-06) |
|---|---|---|
| URI | `mongodb+srv`, credenciais presentes, database path presente | `mongodb+srv`, credenciais presentes, database path ausente |
| `authSource` | Implícito | Implícito |
| Opções de query | Nenhuma | Nenhuma |
| TLS | Falha `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` | **Concluído com validação ativa** |
| Seleção de servidor | Falhou após ~10 s | **OK — 340 ms até conexão autenticada** |
| Autenticação | Não alcançada | **Aprovada** |
| `ping` | Não executado | **OK** |
| Runtime | Node `v24.22.1`, OpenSSL `3.5.9` | Node `v22.23.4`, OpenSSL `3.6.5` |

A diferença de database path não impediu a autenticação no Linux. Como `authSource` é implícito e a URI não tem database path, o driver usou o comportamento padrão da URI. Não foi necessário alterar `authSource`, credenciais ou qualquer parâmetro.

## 5. Resultado de conexão

Implementação temporária fora do repositório, usando apenas `MongoClient` do driver instalado. Não foram usados `connectDatabase()`, modelos Mongoose, rotas HTTP, serviços de autenticação ou código de provisionamento de índices.

Opções finitas usadas:

- `serverSelectionTimeoutMS`: `10.000`
- `connectTimeoutMS`: `10.000`
- `socketTimeoutMS`: `15.000`
- `maxPoolSize`: `1`
- `maxConnecting`: `1`
- `retryReads`: `false`
- `retryWrites`: `false`
- `tls`: `true` (validação de certificados padrão, sem opções inseguras)

| Etapa | Resultado |
|---|---|
| Parse da URI | **OK** |
| Criação do `MongoClient` | **OK** |
| `client.connect()` | **OK** |
| Seleção de servidor | **OK** |
| Handshake TLS | **OK** |
| Autenticação | **OK** |
| Tempo até conexão autenticada | **340 ms** |
| `client.close()` | **OK** — 3 ms |
| Processo | terminou com exit code `0` |
| Tentativas | uma única tentativa completa, sem retry manual |

## 6. Resultado TLS

| Item | Resultado |
|---|---|
| TLS no driver | Ativo por padrão; não desabilitado |
| Validação de certificado | Habilitada |
| Opções inseguras | Nenhuma |
| Certificado | Não persistido nem reproduzido |
| Evidência adicional | DB-LOCAL-05 confirmou TLS 1.3 autorizado no mesmo alvo (`6401b9a3d9ab`) |
| Resultado nesta fase | Conexão autenticada só foi possível após handshake TLS bem-sucedido |

Não houve novo probe TLS independente nesta fase; o resultado acima é o comportamento observado pelo driver durante a conexão autenticada.

## 7. Resultado de autenticação

| Item | Resultado |
|---|---|
| Credencial | A existente no `.env` local; nenhum valor lido em texto pelo relatório |
| `authSource` | Implícito, não alterado |
| Autenticação | **APROVADA** |
| Evidência | `client.connect()` concluído com credenciais presentes na URI |
| Erro de credencial | Nenhum observado |

A autenticação bem-sucedida não comprova permissões de escrita, existência do database de desenvolvimento ou adequação do usuário para operações futuras.

## 8. Resultado do ping

Comando executado uma única vez, somente após a conexão autenticada:

```javascript
await client.db("admin").command({ ping: 1 });
```

| Item | Resultado |
|---|---|
| Database alvo | `admin` |
| Resposta | `ok: 1` |
| Tempo | **18 ms** |
| Erro | Nenhum |
| Operações adicionais | Nenhuma |

O `ping` comprova resposta administrativa do servidor. **Não** comprova a existência ou as permissões do database `save-state-dev`.

## 9. Erros e limitações

- Nenhum erro de conexão, TLS, autenticação ou ping foi observado.
- Apenas uma tentativa completa foi executada; não houve repetição automática.
- Não foram registrados hostname, IP, topologia, URI, usuário, senha, certificado ou `error.message`/`error.stack`.
- O `ping` não valida escrita, coleções, índices, Mongoose, cadastro, e-mail/Resend ou o database `save-state-dev`.
- O teste usou Node.js 22.23.4; o runtime declarado para produção é Node.js 24.x e não foi validado nesta fase.
- O database `save-state-dev` não foi criado, configurado, acessado ou autorizado.
- Nenhuma permissão do usuário Atlas foi inspecionada no painel.
- A rede não foi reavaliada nesta fase; o resultado de TLS usa a mesma janela e o mesmo alvo da DB-LOCAL-05.

## 10. Recomendações para DB-LOCAL-07

A próxima fase deve tratar da preparação segura do database exclusivo, sem iniciar automaticamente:

1. O proprietário confirma e autoriza explicitamente o nome `save-state-dev`.
2. Confirmar, no Atlas, que o usuário atual tem a permissão mínima necessária para esse database e decidir se o `authSource` continuará implícito ou será explícito na configuração da aplicação.
3. Definir o método controlado de criação do database/coleções/índices, preferencialmente por script versionado ou migração aprovada, sem seeds de produção.
4. Validar a conexão Mongoose apenas depois da preparação autorizada, sem tráfego do aplicativo.
5. Manter cadastro, autenticação de usuários, Resend e testes E2E em fases separadas.
6. Não reutilizar credenciais de produção para desenvolvimento e não alterar `.env` sem autorização específica.

Não recomendado: criar o database implicitamente por uma operação de escrita não planejada, rodar seeds/migrações sem autorização, desabilitar TLS, alterar `authSource` sem evidência ou elevar privilégios do usuário.

## 11. Garantias de integridade

- Nenhum documento MongoDB foi lido, escrito ou modificado.
- Nenhum `find`, `insert`, `update`, `delete`, `aggregate`, `listDatabases`, `listCollections`, `listIndexes`, `createIndexes` ou `syncIndexes`.
- Nenhuma migração, seed, cadastro, criação de database, coleção ou índice.
- Nenhum `ping` adicional; apenas o único comando administrativo autorizado.
- Nenhuma alteração em `.env`, credenciais, certificados, dependências, lockfile, DNS, firewall, rede, Atlas ou Vercel.
- Nenhum commit, push, deploy, `git reset`, `git clean` ou `git stash`.
- Nenhum processo preexistente encerrado.
- Cliente MongoDB fechado em `finally`; nenhum processo de probe ou socket ativo ao final.

Validação final:

| Comando | Resultado |
|---|---|
| `git status --short` | 440 modificados (preexistentes) e 34 não rastreados (33 preexistentes + este documento) |
| `git diff --check` | exit `2` por 75.858 diagnósticos preexistentes; nenhum no documento novo |
| Verificação isolada do documento | nenhuma linha de diagnóstico de whitespace |
| `.env` | tamanho `394` e mtime `2026-11-09 16:14:13` inalterados |
| `pnpm-lock.yaml` | tamanho `245026` e mtime `2026-11-09 17:34:50` inalterados |
| Processos do probe | nenhum |
| Sockets estabelecidos na porta do alvo | nenhum |

## 12. Veredito

**DB-LOCAL-06: CONEXÃO AUTENTICADA APROVADA.**

O MongoDB Atlas aceitou uma conexão autenticada a partir do Garuda Linux, concluiu TLS com validação ativa, respondeu a um `ping` administrativo e encerrou a conexão corretamente. O database `save-state-dev` permanece não criado, não configurado e não validado. Cadastro, Mongoose, índices e Resend continuam exigindo fases próprias.

## 13. Adendo DB-LOCAL-07 — GATE 1

**Data:** 12/11/2026
**Status:** GATE 1 concluído; somente planejamento.

- O proprietário aprovou o nome `save-state-dev`.
- O DB-LOCAL-07 foi iniciado exclusivamente no GATE 1, sem autorização para criação, configuração, acesso ou provisionamento.
- Nenhuma conexão autenticada adicional com o Atlas foi aberta nesta fase.
- Nenhum comando `ping`, `listDatabases`, `listCollections`, `listIndexes` ou `dbStats` foi executado.
- O plano completo está em `docs/DB_LOCAL_07_DEV_DATABASE_PLAN.md`.
- A conclusão da DB-LOCAL-06 permanece válida: a URI não tem database path, o `authSource` é implícito e a autenticação foi aprovada.
- A inspeção do Mongoose 8.24.4 mostra que `options.dbName` é removido antes da criação do `MongoClient` e o database é selecionado com `client.db(dbName)`. Portanto, usar `dbName` via Mongoose não altera o `authSource` implícito.
- Nenhuma alteração foi feita em `.env`, código, credenciais, Atlas ou Vercel.
