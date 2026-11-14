# DB-LOCAL-04 — Comparação de rede e TLS do MongoDB Atlas

**Data:** 12/11/2026
**Veredito:** **INCONCLUSIVO** — as duas redes testadas falharam com a mesma assinatura TLS e o mesmo alvo determinístico. Nenhuma diferença de rede foi identificada. O padrão aponta para o endpoint/configuração do Atlas ou um elemento comum às duas conexões, mas o checklist do painel permanece não confirmado. A estabilidade da REDE-B durante toda a execução também não foi confirmada.

## 1. Objetivo

Determinar se a falha TLS observada entre o ambiente local e o MongoDB Atlas está associada a:

1. A rede atualmente utilizada.
2. O IP público autorizado no Atlas.
3. Um intermediário de rede.
4. O endpoint remoto do Atlas.
5. Uma incompatibilidade específica do caminho de conexão.

Nenhum código do Save State foi alterado.

## 2. Ambiente

| Item | Valor observado |
|---|---|
| Data/hora do inventário inicial | `2026-11-12 00:09:52 -03:00` |
| Sistema | Windows 11 |
| Branch / HEAD | `main` / `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |
| Alterações preexistentes | 136 arquivos modificados e 31 não rastreados no inventário; preservados |
| Node.js | `v24.22.1` |
| OpenSSL do runtime | `3.5.9` |
| Next.js | `15.5.29` |
| Mongoose | `8.24.4` |
| MongoDB Node Driver | `6.20.0` |
| pnpm | `11.3.0` |
| Firewall | Serviço ativo; 3/3 perfis habilitados |
| Antivírus reportado | 1 produto |

### REDE-A

| Item | Valor observado |
|---|---|
| Horário do inventário | `2026-11-12 00:09:52 -03:00` |
| Adaptadores ativos | 1 |
| Tipo de conexão | Ethernet (`802.3`) |
| Categoria da rede | Pública |
| Adaptadores VPN-like ativos | 0 |
| Proxy de usuário/ambiente | Não configurado |
| WinHTTP | Direto |
| Impressão digital sanitizada | `88feb53f0ebd` (hash; não é o IP público) |

### REDE-B

| Item | Valor observado |
|---|---|
| Horário da confirmação da troca | `2026-11-12 00:21:54 -03:00` |
| Adaptadores ativos | 1 |
| Tipo de conexão | Ethernet (`802.3`) |
| Categoria da rede | Pública |
| Adaptadores VPN-like ativos | 0 |
| Proxy de usuário/ambiente | Não configurado |
| WinHTTP | Direto |
| Impressão digital sanitizada | `9766960b75d1` (hash; não é o IP público) |
| Verificação posterior | `2026-11-12 00:22:55 -03:00` voltou a `88feb53f0ebd`, com 1 adaptador ativo |

A impressão digital mudou imediatamente antes do probe da REDE-B e reverteu depois. Isso confirma que a configuração ativa mudou na janela do teste, mas **não** confirma que a REDE-B permaneceu estável durante toda a execução. Nenhum IP, hostname ou URI é reproduzido neste relatório.

## 3. Checklist do Atlas

O painel do Atlas **não foi acessado automaticamente** e nenhuma configuração remota foi consultada ou alterada. O proprietário confirmou a troca manual de rede, mas não forneceu os itens abaixo.

| Verificação | Estado |
|---|---|
| Cluster ativo | **NÃO CONFIRMADO** |
| Projeto correto selecionado | **NÃO CONFIRMADO** |
| Network Access inclui o IP público da REDE-A | **NÃO CONFIRMADO** |
| Network Access inclui o IP público da REDE-B | **NÃO CONFIRMADO** |
| Manutenção/indisponibilidade informada | **NÃO CONFIRMADO** |
| Destino corresponde ao cluster esperado | **NÃO CONFIRMADO** |

A ausência de erro TCP **não** foi tratada como prova de autorização na IP Access List.

## 4. Configuração do probe

Script temporário e não versionado: `%TEMP%\opencode\db-local-04-tls-probe.cjs`. O mesmo script, alvo e opções foram usados nas duas redes.

| Requisito | Implementação |
|---|---|
| Origem da configuração | `@next/env` em modo `development`, a partir da raiz do projeto; mesma origem validada na DB-LOCAL-02 |
| URI | Presente em `.env`; esquema `mongodb+srv`; destino remoto; credenciais e database path presentes; nenhum valor impresso |
| DNS | `resolveSrv` para os 3 alvos; seleção determinística por nome e porta; fingerprint SHA-256 do alvo, sem revelar hostname |
| SNI | Nome do alvo selecionado |
| Validação TLS | `rejectUnauthorized: true`; mínimo TLS 1.2; máximo TLS 1.3 |
| Timeouts | TCP 6 s; TLS 8 s |
| Tentativas | Uma por rede, sem retry |
| Dados | Nenhuma autenticação, nenhum comando MongoDB, nenhum certificado persistido |
| Controle | Mesmo probe para `example.com:443`, com validação habilitada |
| Encerramento | Sockets destruídos no resultado; processo encerrado ao final |

Para separar TCP de TLS, o script abre uma conexão TCP e a promove com `tls.connect({ socket })`. Isso mantém uma única tentativa de conexão por alvo.

## 5. Resultado REDE-A

**Horário do probe:** `2026-11-12 00:10:11 -03:00`
**Fingerprint do alvo:** `6401b9a3d9ab`

| Etapa | Resultado |
|---|---|
| DNS | **OK** — 3 alvos SRV; 1 endereço resolvido; classe `public` |
| TCP | **Estabelecido** |
| TLS | **FALHOU** |
| Código | `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` |
| Categoria | `TLS_HANDSHAKE_ERROR` |
| Versão/cifra | Nenhuma negociada |
| `authorized` | Não alcançado |
| Validação de certificado | **NOT REACHED** |
| Tempo do probe TLS | **39 ms** |
| Controle TLS | **OK** — TLS 1.3, certificado autorizado, 37 ms |

A REDE-A reproduziu a mesma assinatura da DB-LOCAL-03. Nenhuma repetição foi executada.

## 6. Resultado REDE-B

**Horário do probe:** `2026-11-12 00:21:59 -03:00`
**Fingerprint do alvo:** `6401b9a3d9ab` (o mesmo da REDE-A)
**Fingerprint da rede na confirmação:** `9766960b75d1`

| Etapa | Resultado |
|---|---|
| DNS | **OK** — 3 alvos SRV; 1 endereço resolvido; classe `public` |
| TCP | **Estabelecido** |
| TLS | **FALHOU** |
| Código | `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` |
| Categoria | `TLS_HANDSHAKE_ERROR` |
| Versão/cifra | Nenhuma negociada |
| `authorized` | Não alcançado |
| Validação de certificado | **NOT REACHED** |
| Tempo do probe TLS | **31 ms** |
| Controle TLS | **OK** — TLS 1.3, certificado autorizado, 38 ms |

O resultado é idêntico ao da REDE-A em código, categoria, alvo e etapa de falha. Uma única tentativa foi executada, sem retry. A verificação posterior mostrou o retorno à impressão digital original; portanto, o resultado é atribuído à janela em que a configuração estava alterada, mas a estabilidade da REDE-B durante toda a execução não pôde ser confirmada.

## 7. Comparação

| REDE-A | REDE-B | Interpretação |
|---|---|---|
| TLS falha com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` | TLS falha com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` | Investigar endpoint, configuração do Atlas ou elemento comum às duas conexões |

Condições da comparação:

- O alvo determinístico foi o mesmo nas duas redes (`6401b9a3d9ab`).
- As opções TLS foram idênticas.
- Os horários foram registrados.
- O estado operacional do Atlas **não** foi confirmado.
- A política de acesso de cada IP **não** foi confirmada.
- A estabilidade da REDE-B durante a execução **não** foi confirmada.

Não houve diferença de resultado entre as redes. Isso **não** prova que o endpoint do Atlas seja a causa, mas reduz a hipótese de uma restrição exclusiva da REDE-A ou do IP público atual.

## 8. Hipóteses

| Hipótese | Evidência | Resultado |
|---|---|---|
| Certificado não confiável / cadeia incompleta | validação não alcançada; controle público autorizado | **DESCARTADA** para esta falha |
| Problema específico do Node | `node:tls` falha sem o driver; controle funciona | **DESCARTADA** como falha geral do runtime/trust store |
| Problema específico do driver | falha ocorre sem o driver | **DESCARTADA** |
| Diferença de caminho de rede | REDE-A e REDE-B falharam de forma idêntica no mesmo alvo | **DESCARTADA** como diferencial observado |
| IP Access List de uma rede específica | ambas as redes não confirmadas; falha antes de auth | **INCONCLUSIVA** |
| Estado/configuração do Atlas | mesma assinatura nas duas redes, mesmo alvo, TCP OK | **PROVÁVEL** rejeição no lado do Atlas, mas não confirmada |
| Intermediário local / inspeção TLS | mesmo computador, mesmo antivírus; controle funciona; sem evidência direta | **INCONCLUSIVA** |
| Incompatibilidade de protocolo | nenhuma versão TLS negociada | **INCONCLUSIVA** |
| Interferência de proxy | nenhum proxy de usuário/ambiente; WinHTTP direto | **INCONCLUSIVA** (middlebox transparente não observável) |
| Interferência de antivírus | 1 produto presente, sem evidência direta | **INCONCLUSIVA** |
| Falha transitória | reproduzida em DB-LOCAL-03, REDE-A e REDE-B | **INCONCLUSIVA** (não foi episódio único na janela observada) |
| Outra causa | sem evidência específica | **INCONCLUSIVA** |

O alerta fatal `internal_error` é recebido do lado remoto da conexão. As duas redes testadas usam o mesmo computador, o mesmo Node, a mesma URI e o mesmo alvo; por isso, o resultado é compatível com uma rejeição do endpoint/configuração do Atlas ou com um elemento comum ao cliente, mas não permite separar esses cenários.

## 9. Correção mínima recomendada

Nenhuma alteração deve ser aplicada nesta fase. A menor próxima ação segura é:

1. O proprietário confirma o checklist do Atlas, sem alterar a IP Access List: cluster ativo, projeto correto, Network Access para os IPs das duas redes, manutenção e destino esperado.
2. Testar o mesmo handshake TLS a partir de um cliente/caminho independente deste computador — outra máquina ou `mongosh` em outro host, com validação habilitada. Se o cliente independente funcionar, o elemento comum local (Node/ClientHello/antivírus) ganha peso; se falhar, o endpoint/configuração do Atlas ganha peso.
3. Se for necessário confirmar a REDE-B de forma estável, o proprietário deve manter a troca ativa e autorizar uma nova tentativa única; o teste atual não deve ser repetido automaticamente.
4. Se o TLS funcionar, **não** iniciar autenticação automaticamente. Propor autorização separada para driver → auth → `ping` → Mongoose → Next.js.

Não recomendado: desabilitar TLS, usar `tlsInsecure`/`tlsAllowInvalid*`, definir `NODE_TLS_REJECT_UNAUTHORIZED=0`, aumentar timeout como primeira solução, alterar a IP Access List, trocar credenciais ou trocar de banco para contornar o problema.

## 10. Limitações

- Checklist do Atlas não confirmado pelo proprietário.
- A impressão digital da REDE-B mudou antes do probe e reverteu depois; a estabilidade da rede durante toda a execução não foi confirmada.
- Apenas uma tentativa por rede; não houve retry.
- As duas redes foram testadas do mesmo computador, mesmo Node, mesma URI e mesmo alvo; não é possível separar endpoint de elemento comum local.
- Apenas um alvo SRV por rede, embora existam 3 alvos; o driver já havia afetado 3/3 na DB-LOCAL-03.
- Sem captura de pacotes e sem certificado do servidor observado (o handshake não chega a apresentá-lo).
- `mongosh` e OpenSSL CLI não estão instalados; sem segundo cliente independente.
- A diferença de tempo entre as tentativas não foi usada como evidência de causa.
- A impressão digital da rede é um hash sanitizado, não um identificador público.

## 11. Próxima ação

Confirmar o checklist do Atlas e executar um teste TLS independente em outra máquina/cliente, com validação habilitada e uma única tentativa. Se o objetivo for validar a REDE-B de forma estável, repetir somente após o proprietário confirmar que a conexão permanece alterada e autorizar nova tentativa. Não executar testes autenticados sem autorização separada.

## 12. Segurança e integridade

- Nenhuma autenticação MongoDB, nenhum `ping`, nenhum comando de dados.
- Nenhuma leitura/escrita de documentos, índice, database ou coleção.
- Nenhuma alteração de `.env`, credenciais, certificados, dependências, lockfile, rede, firewall, proxy, DNS, Atlas ou Vercel.
- TLS permaneceu com validação habilitada; nenhuma opção insegura foi usada.
- Nenhum commit, push ou deploy.
- Nenhum processo preexistente reiniciado ou encerrado; nenhum processo de probe permaneceu.
- O script temporário está fora do repositório versionado e não contém segredos.

## 13. Veredito

**DB-LOCAL-04: INCONCLUSIVO.**

As duas redes testadas falharam com a mesma assinatura TLS, no mesmo alvo e com TCP estabelecido; o controle público funcionou. Não houve diferença de rede que explique a falha. O padrão é compatível com uma rejeição no endpoint/configuração do Atlas ou com um elemento comum às duas conexões, mas o checklist do Atlas não foi confirmado e a estabilidade da REDE-B não foi comprovada. Autenticação e `ping` continuam não validados.
