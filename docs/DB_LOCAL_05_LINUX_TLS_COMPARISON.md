# DB-LOCAL-05 — Comparação TLS Windows vs. Garuda Linux

**Data:** 12/11/2026
**Veredito:** **DIFERENÇA ENTRE AMBIENTES CONFIRMADA** — o mesmo alvo SRV, com o mesmo fingerprint, concluiu TLS 1.3 autorizado no Garuda Linux, enquanto o Windows falhou com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`. A causa específica da falha no Windows **não** foi isolada.

## 1. Ambiente Linux

| Item | Valor observado |
|---|---|
| Sistema | Garuda Linux (rolling), KDE |
| Kernel | `7.2.14-zen1-1-zen` x86_64 |
| Usuário | `revi` |
| Shell de login observado | `/bin/bash` |
| Diretório do projeto | raiz do checkout local do Save State |
| Branch / HEAD | `main` / `9aaa952` |
| Alterações preexistentes | 440 arquivos modificados e 32 não rastreados no inventário; preservados |
| Node.js | `v22.23.4` |
| OpenSSL do runtime | `3.6.5` |
| OpenSSL CLI | `3.6.5` (29/09/2026), `linux-x86_64` |
| Next.js | `15.5.29` |
| Mongoose | `8.24.4` |
| MongoDB Node Driver | `6.20.0` |
| pnpm / npm | `11.3.0` / `12.2.2` |
| Ferramentas TLS instaladas | `openssl`, `gnutls-cli`, `curl`, `dig`, `nslookup`, `host`, `mongosh` |

`mongosh` não foi usado: qualquer operação autenticada estava fora do escopo.

## 2. Origem sanitizada da configuração

| Campo | Resultado seguro |
|---|---|
| Origem | `.env` local do checkout, lido diretamente pelo probe; nenhum valor impresso |
| `MONGODB_URI` | Presente; esquema `mongodb+srv`; destino remoto; credenciais presentes |
| Database path na URI | Ausente |
| Opções de query | Nenhuma |
| Opções TLS inseguras | Ausentes |
| `NODE_EXTRA_CA_CERTS` / `NODE_TLS_REJECT_UNAUTHORIZED` | Não definidos |
| `SSL_CERT_FILE` / `SSL_CERT_DIR` | Não definidos |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY` | Não definidos |
| TLS padrão do Node | mínimo `TLSv1.2`, máximo `TLSv1.3` |

Nenhuma credencial, hostname, IP ou URI foi persistido ou reproduzido neste relatório.

## 3. Rede utilizada

| Item | Valor observado |
|---|---|
| Interface padrão | Ethernet `enp8s0`, ativa, configuração por DHCP |
| VPN | Nenhuma interface VPN-like ativa observada |
| Proxy de usuário/ambiente | Não configurado |
| DNS | 3 registros SRV; 1 endereço para o alvo selecionado, classe pública |
| Resolvedor | `systemd-resolved` inativo; 1 nameserver não-loopback |
| Fingerprint da rede | `852e31db03e3` (SHA-256 dos primeiros 12 hex do IPv4 público; valor não é o IP) |

O fingerprint da rede Linux **não** coincidiu com os fingerprints Windows `88feb53f0ebd` e `9766960b75d1`. Como o procedimento exato do fingerprint de rede do Windows não foi confirmado, essa diferença é indicativa, não conclusiva, de que o caminho de rede é distinto.

## 4. Alvo comparado

O alvo foi derivado exclusivamente da configuração local:

1. `resolveSrv` do hostname `mongodb+srv` da URI.
2. Ordenação determinística por nome e porta.
3. Seleção do primeiro registro.
4. Porta obtida do registro SRV (`27017`).
5. SNI igual ao hostname do alvo.
6. Fingerprint calculado como `SHA-256(host:porta)` truncado em 12 hex.

**Fingerprint do alvo:** `6401b9a3d9ab`

Esse é exatamente o fingerprint registrado nas fases Windows DB-LOCAL-04 (REDE-A e REDE-B). O mesmo procedimento e o mesmo `host:porta` foram confirmados. O alvo é equivalente ao das fases anteriores.

## 5. Resultado Node TLS

Método: TCP aberto separadamente e promovido com `tls.connect({ socket })`, `servername` do alvo, `rejectUnauthorized: true`, mínimo TLS 1.2, máximo TLS 1.3, timeout TCP de 6 s e TLS de 8 s, **uma única tentativa**, socket destruído em `finally`.

| Etapa | Resultado |
|---|---|
| DNS | **OK** — 3 alvos SRV; 1 endereço; classe pública |
| TCP | **Estabelecido** — 43 ms |
| TLS | **OK** |
| Versão negociada | `TLSv1.3` |
| Cifra | `TLS_AES_128_GCM_SHA256` |
| `authorized` | `true` |
| Validação de certificado | **Alcançada e aprovada** |
| Código de erro | nenhum |
| Tempo TLS | 53 ms |
| Tempo total | 109 ms |
| Socket | encerrado |
| Fingerprint do alvo | `6401b9a3d9ab` (equivalente ao Windows) |

Não houve autenticação, comando MongoDB, `ping` ou acesso a documentos.

## 6. Controle TLS

Mesmo método, host público neutro, sem credenciais.

| Item | Resultado |
|---|---|
| DNS | **OK** |
| TCP | **Estabelecido** — 22 ms |
| TLS | **OK** |
| Versão negociada | `TLSv1.3` |
| Cifra | `TLS_AES_256_GCM_SHA384` |
| `authorized` | `true` |
| Tempo TLS | 21 ms |
| Tempo total | 45 ms |
| Socket | encerrado |

O controle confirma que o runtime Node e o repositório de confiança do Linux funcionam para um destino público neutro.

## 7. Resultado OpenSSL CLI

Uma única tentativa com `openssl s_client`, mesmo alvo e mesmo fingerprint, SNI correto, `-verify_return_error` e `-verify_hostname` habilitados, mínimo TLS 1.2 e máximo TLS 1.3, timeout finito, sem credenciais e sem operação de banco.

| Item | Resultado |
|---|---|
| Fingerprint do alvo | `6401b9a3d9ab` (equivalente) |
| Handshake | **OK** |
| Versão negociada | `TLSv1.3` |
| Verificação de certificado | Compatível com aprovada (exit `0` sob `-verify_return_error`); código explícito não capturado |
| Exit code | `0` |
| Sinal | nenhum |
| Duração | 84 ms |
| Certificado | não persistido nem reproduzido |

## 8. Comparação Windows vs. Linux

| Verificação | Windows (DB-LOCAL-03/04) | Linux (DB-LOCAL-05) |
|---|---|---|
| DNS SRV | OK | **OK** |
| TCP | OK | **OK** |
| Node TLS | `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` | **OK — TLS 1.3 autorizado** |
| Controle TLS | OK — TLS 1.3 | **OK — TLS 1.3** |
| OpenSSL CLI | Não testado (ausente) | **OK — TLS 1.3** |
| Autenticação Mongo | Não alcançada | Não executada |
| Ping Mongo | Não executado | Não executado |
| Fingerprint do alvo | `6401b9a3d9ab` | **`6401b9a3d9ab`** |
| Node.js | `v24.22.1` | `v22.23.4` |
| OpenSSL do runtime | `3.5.9` | `3.6.5` |
| Rede | Ethernet pública, fingerprint `88feb53f0ebd` / `9766960b75d1` | Ethernet pública, fingerprint `852e31db03e3` |
| Proxy/VPN observado | Nenhum / nenhum | **Nenhum / nenhum** |
| Antivírus | 1 produto reportado | Não inventariado nesta fase |

### Leitura

- **Linux funciona; Windows falhou.** O alvo é equivalente pelo fingerprint e as opções TLS foram comparáveis.
- A diferença é real, mas o experimento **não separa** sistema operacional, versão do Node/OpenSSL, software de segurança e caminho de rede.
- O IP público/caminho Linux é diferente do Windows pelo fingerprint disponível. Portanto, não é possível atribuir a falha Windows exclusivamente ao runtime ou ao sistema operacional.
- TLS aprovado **não** valida autenticação, IP Access List ou conexão MongoDB funcional.

## 9. Hipóteses

| Hipótese | Evidência | Resultado |
|---|---|---|
| Alvo diferente do comparado | fingerprint `6401b9a3d9ab` idêntico ao Windows | **DESCARTADA** |
| Certificado/CA inválido no Linux | `authorized: true`, validação alcançada, controle OK | **DESCARTADA** |
| Runtime Node/OpenSSL genérico quebrado no Linux | Node TLS e OpenSSL CLI concluíram TLS 1.3 | **DESCARTADA** |
| Incompatibilidade geral de TLS com o endpoint Atlas | mesmo alvo concluiu TLS 1.3 no Linux | **DESCARTADA** para o caminho Linux |
| Endpoint Atlas rejeita todos os clientes | Linux concluiu handshake no mesmo alvo | **DESCARTADA** como rejeição universal |
| Diferença de ambiente cliente (OS/runtime/segurança) | Windows falhou; Linux funcionou; versões e SO diferem | **PROVÁVEL**, não isolada |
| Diferença de caminho de rede | fingerprints de rede distintos; caminho Linux funciona | **PROVÁVEL**, não isolada |
| IP Access List | TLS não prova autorização; owner confirmou o checklist, mas sem evidência direta | **INCONCLUSIVA** |
| Falha transitória no Windows | não houve nova tentativa Windows nesta fase | **INCONCLUSIVA** |
| Intermediário TLS/antivírus no Windows | sem nova evidência direta nesta fase | **INCONCLUSIVA** |
| Diferença de versão Node/OpenSSL como causa | Node 22/OpenSSL 3.6.5 vs. Node 24/OpenSSL 3.5.9 | **INCONCLUSIVA** (confundida com rede/SO) |

## 10. Limitações

- Apenas uma tentativa por alvo; não houve retry.
- O Windows não foi reexecutado nesta fase; a comparação usa os relatórios DB-LOCAL-03/04.
- O caminho de rede Linux é diferente do Windows pelo fingerprint disponível; o experimento não isola rede de cliente.
- O fingerprint de rede do Windows pode ter usado algoritmo diferente; a comparação de rede é indicativa.
- Apenas um dos 3 alvos SRV foi testado, o mesmo critério determinístico das fases anteriores.
- O código explícito `Verify return code` do OpenSSL não foi capturado; a aprovação é inferida de exit `0` com `-verify_return_error` e corroborada pelo Node TLS no mesmo alvo.
- O parser inicial do OpenSSL capturou uma linha de conexão do `stderr` contendo um IP do alvo; o valor não foi reproduzido neste relatório e não foi persistido em arquivo. Nenhuma credencial, URI, hostname ou certificado foi exposto.
- Não houve captura de pacotes.
- O processo servidor Next histórico do Windows não estava disponível; o probe usa o ambiente carregado no subprocesso.

## 11. Próxima ação mínima

Nenhuma alteração deve ser aplicada no Linux, que concluiu TLS 1.3 com validação ativa.

A menor ação segura para isolar a causa é uma **única** repetição do mesmo probe `node:tls` no Windows, com o mesmo alvo/fingerprint e as mesmas opções, **no mesmo caminho de rede usado pelo Linux** (ou o inverso: uma única execução Linux no caminho Windows, se autorizado). Registrar o fingerprint da rede e o resultado.

- Se o Windows funcionar no caminho Linux: o caminho/rede anterior (ou uma condição transitória) ganha peso.
- Se o Windows falhar no caminho Linux: o ambiente cliente Windows (OS, Node/OpenSSL, segurança) ganha peso.

Não recomendado: desabilitar validação TLS, usar `tlsInsecure`/`tlsAllowInvalid*`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, forçar TLS obsoleto, alterar IP Access List, DNS, firewall, certificados, credenciais ou dependências.

Autenticação, `ping` e qualquer operação MongoDB continuam exigindo autorização separada. Não declarar a conexão MongoDB funcional apenas porque o TLS passou.

## 12. Segurança e integridade

- Nenhum código de produção alterado.
- Nenhuma alteração em `.env`, credenciais, certificados, dependências, lockfile, DNS, firewall, Atlas ou Vercel.
- Nenhuma autenticação, `ping`, leitura/escrita de documentos, índices, databases ou coleções.
- Nenhum deploy, commit, push, `git reset`, `git clean` ou `git stash`.
- TLS permaneceu com validação habilitada em todas as tentativas.
- Nenhum processo preexistente reiniciado ou encerrado.
- Sockets dos probes encerrados; nenhum processo de probe remanescente e nenhuma conexão estabelecida na porta do alvo.
- Apenas este documento foi adicionado ao repositório.

Validação final:

| Comando | Resultado |
|---|---|
| `git diff --check` | exit `2`; 75.858 diagnósticos de whitespace, todos em modificações preexistentes; nenhum no arquivo novo |
| `git diff --no-index --check /dev/null docs/DB_LOCAL_05_LINUX_TLS_COMPARISON.md` | nenhuma linha de diagnóstico de whitespace |
| `git status --short` | 440 arquivos modificados (preexistentes) e 33 não rastreados (32 preexistentes + este documento) |
| `.env` | tamanho `394` e mtime `2026-11-09 16:14:13` inalterados |
| `pnpm-lock.yaml` | tamanho `245026` e mtime `2026-11-09 17:34:50` inalterados |

## 13. Veredito

**DB-LOCAL-05: DIFERENÇA ENTRE AMBIENTES CONFIRMADA.**

O mesmo alvo SRV (`6401b9a3d9ab`) concluiu TLS 1.3 com certificado autorizado no Garuda Linux, tanto via `node:tls` quanto via OpenSSL CLI, enquanto o Windows falhou com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`. A falha **não** se reproduziu no Linux.

A causa específica permanece **não isolada**: SO, versão de Node/OpenSSL, software de segurança e caminho de rede diferem entre os ambientes. O TLS funcional no Linux não valida autenticação, IP Access List nem conexão MongoDB.
