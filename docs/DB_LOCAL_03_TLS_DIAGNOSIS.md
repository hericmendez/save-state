# DB-LOCAL-03 — Diagnóstico diferencial TLS/SSL do MongoDB Atlas

**Data:** 11/11/2026
**Veredito:** **INCONCLUSIVO** quanto à causa específica. A camada de falha está confirmada — a negociação TLS é rejeitada com alerta fatal `internal_error` antes da validação de certificado —, mas não foi possível determinar se o alerta se origina no endpoint/cluster do Atlas ou em um intermediário de rede local.

## 1. Resumo executivo

- DNS e TCP funcionam. O destino é remoto, todos os endereços resolvidos foram classificados como públicos e nenhum alvo aparece no arquivo `hosts` do Windows.
- Um handshake TLS direto via `node:tls`, com SNI correto, validação de certificado habilitada e mínimo TLS 1.2, **falhou em ~415 ms** com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`. A validação de certificado **não foi alcançada**: não houve versão TLS, cifra ou certificado negociado.
- A repetição única do MongoDB Node Driver reproduziu a mesma assinatura: falha em ~10.136 ms, código único `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`, **os 3 servidores afetados**, sem autenticação e sem `ping`.
- Um controle neutro para um host público HTTPS concluiu TLS 1.3 com certificado autorizado em ~350 ms. Isso demonstra que o runtime Node, o repositório de confiança e o caminho TLS genérico funcionam; o problema é específico do destino/path do Atlas.
- `mongosh` não está instalado e não foi instalado. Não houve segundo cliente para comparação.
- **Não há evidência de senha inválida, certificado não confiável ou cadeia incompleta.** O alerta `internal_error` é enviado pelo lado remoto da conexão (endpoint ou intermediário) e não é um erro de validação de certificado.
- A correção mínima recomendada é **comparar o mesmo probe em outra rede/cliente** e, em paralelo, pedir ao responsável pelo Atlas que confirme o estado do cluster e a Network Access. Nenhuma alteração foi aplicada.

## 2. Ambiente

| Item | Valor observado |
|---|---|
| Sistema | Windows 11 |
| Node.js | `v24.22.1` |
| OpenSSL do runtime | `3.5.9` |
| TLS mínimo/máximo padrão | `TLSv1.2` / `TLSv1.3` |
| Next.js | `15.5.29` |
| Mongoose | `8.24.4` |
| MongoDB Node Driver | `6.20.0` (resolvido pela dependência do Mongoose) |
| pnpm | `11.3.0` |
| `mongosh` | não instalado |
| OpenSSL CLI | não instalado |
| Relógio local no início da fase | `2026-11-11 23:47:26 -03:00` |
| Projeto | raiz do checkout `C:\Users\Heric\Desktop\save-state` |
| Branch / HEAD | `main` / `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |

O working tree já continha as alterações locais registradas nas fases anteriores; elas foram preservadas. Esta fase adiciona apenas documentação.

Processos: o `mongod` local preexistente permaneceu ativo. O processo Node/Next observado nas fases anteriores não estava mais ativo no início desta fase; **esta tarefa não encerrou nenhum processo**. Ao final, não restou nenhum processo Node de probe. As conexões em `TIME_WAIT` observadas ao final são resíduos das tentativas já encerradas, não conexões ativas.

## 3. Origem da configuração

A configuração foi carregada com `@next/env` da mesma versão do Next instalada, em subprocesso isolado, modo `development`, sem imprimir valores.

| Campo | Resultado seguro |
|---|---|
| `MONGODB_URI` | Presente; origem efetiva `.env`; esquema `mongodb+srv`; destino remoto; credenciais presentes. |
| Database path | Presente; nome não divulgado. |
| Opções de query na URI | Nenhuma (`0` opções). |
| TLS explícito (`tls`/`ssl`) | Ausente. |
| Opções TLS inseguras | Ausentes (`tlsInsecure`, `tlsAllowInvalidCertificates`, `tlsAllowInvalidHostnames`). |
| `authSource` / `authMechanism` | Ausentes. |
| `replicaSet` / `directConnection` / `retryWrites` | Ausentes. |
| `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`, `SSL_CERT_FILE`, `SSL_CERT_DIR` | Não definidos no processo do probe. |
| `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` | Não definidos no processo do probe. |

O processo Next que gerou o HTTP 500 original não pôde ser inspecionado nas fases anteriores e não estava mais em execução no início desta. Portanto, as conclusões valem para o ambiente carregado no subprocesso, não necessariamente para o processo servidor histórico.

## 4. Probe Node TLS

Método: `node:tls` direto contra o primeiro alvo SRV descoberto a partir da URI local, porta obtida do registro SRV, SNI igual ao hostname do alvo, `rejectUnauthorized: true`, `minVersion: TLSv1.2`, timeout de 8 s, **uma única tentativa**. Nenhum comando MongoDB, nenhuma credencial e nenhum certificado foram enviados ou persistidos.

| Etapa | Resultado |
|---|---|
| TCP | estabelecido |
| Handshake TLS | **falhou** |
| Versão TLS negociada | nenhuma |
| Cifra negociada | nenhuma |
| `authorized` | não alcançado (`null`) |
| Código | `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` |
| Categoria sanitizada | `TLS_HANDSHAKE_ERROR` |
| Tempo | ~415 ms |

O alerta recebido é do tipo fatal `internal_error`. Ele indica que o lado remoto abortou a negociação, mas **não identifica qual hop o emitiu** e **não é evidência de certificado inválido**. Como a validação de certificado não chegou a ocorrer, qualquer conclusão sobre cadeia de confiança do Atlas seria especulativa.

## 5. Comparação MongoDB Driver

Foi feita **uma única repetição** autorizada, com os mesmos limites da DB-LOCAL-02: seleção 10 s, connect 10 s, socket 15 s, pool máximo 1, um connecting, retries de leitura/escrita desativados. Não houve loop nem nova tentativa após falha.

| Item | Resultado |
|---|---|
| Parse da URI | aceito |
| Seleção de servidor | **falhou** |
| Handshake | **falhou na camada TLS** |
| Autenticação | não confirmada / não alcançada |
| `ping` | não executado |
| Conexão fechada | sim (`finally`) |
| Categoria | `TLS_HANDSHAKE_ERROR` |
| Nomes sanitizados | `MongoServerSelectionError`, `MongoNetworkError`, `Error` |
| Códigos sanitizados | `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` |
| Servidores afetados | 3 de 3 |
| Tempo | ~10.136 ms |

Comparação com DB-LOCAL-02: mesma categoria, mesmo código e mesma falha antes de auth/ping; duração praticamente idêntica (~10.200 ms). Isso mostra que a falha **se repetiu** em dois momentos distintos, embora a janela de observação seja curta.

## 6. Comparação com mongosh

`mongosh` **não está instalado** e não foi instalado, conforme a restrição. Não houve como executar a comparação. Também não há OpenSSL CLI disponível para uma checagem independente.

| Cliente | TLS | Autenticação | Ping | Resultado |
|---|---|---|---|---|
| Node TLS | falhou (`ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`, ~415 ms) | não aplicável | não aplicável | negociação rejeitada antes do certificado |
| MongoDB Node Driver | falhou na camada TLS (~10.136 ms) | não alcançada | não executado | 3/3 servidores afetados |
| mongosh | não executado | não executado | não executado | limitação: ferramenta ausente |
| Controle neutro (Node TLS) | concluiu TLS 1.3, certificado autorizado (~350 ms) | não aplicável | não aplicável | runtime/confiança genéricos funcionam |

A ausência de `mongosh` impede distinguir, por um segundo cliente, entre rejeição do endpoint Atlas e interferência do path local.

## 7. Inspeção de rede

Inspeção exclusivamente observacional; nada foi desativado, alterado ou adicionado.

| Componente | Presença | Evidência de interferência | Situação |
|---|---|---|---|
| Proxy | não configurado (usuário/ambiente); WinHTTP em modo direto | nenhuma | não atribuído; proxy transparente não é observável por esses meios |
| VPN | 0 adaptadores ativos com perfil VPN | nenhuma | não atribuído |
| Firewall | serviço em execução; 3/3 perfis habilitados | nenhuma; TCP é estabelecido | não atribuído |
| Antivírus | 1 produto reportado pelo Security Center | nenhuma direta; inspeção HTTPS não avaliada | inconclusivo |
| Certificados | sem variáveis de CA customizada; controle neutro autorizado | nenhuma | não atribuído |
| Outro intermediário | não observável | nenhuma | inconclusivo |

DNS: 3 alvos SRV; 0 entradas no arquivo `hosts`; todos os endereços classificados como públicos (sem loopback, faixa privada ou link-local). Isso reduz a hipótese de redirecionamento local por `hosts`/DNS, mas não exclui NAT, proxy transparente ou inspeção TLS no caminho.

## 8. Hipóteses

| Hipótese | Evidência | Resultado |
|---|---|---|
| Certificado não confiável | validação não alcançada; alerta ocorre antes; controle neutro autorizado | **DESCARTADA** para esta falha |
| Cadeia de certificados incompleta | nenhum certificado chegou a ser validado | **DESCARTADA** para esta falha |
| Encerramento remoto de TLS | alerta fatal `internal_error` recebido; 3/3 servidores; TCP OK | **PROVÁVEL** |
| Interferência de proxy | nenhum proxy local configurado; middlebox transparente não observável | **INCONCLUSIVA** |
| Interferência de antivírus | 1 produto presente, sem evidência direta; inspeção HTTPS não avaliada | **INCONCLUSIVA** |
| Incompatibilidade de protocolo | Node suporta TLS 1.2/1.3, mas nenhuma versão foi negociada | **INCONCLUSIVA** |
| Estado do Atlas | sem acesso ao console/estado; 3/3 servidores afetados é compatível, mas não prova | **INCONCLUSIVA** |
| Falha transitória | reproduzida em dois momentos (DB-LOCAL-02 e DB-LOCAL-03) | **INCONCLUSIVA** (não foi episódio único na janela observada) |
| Problema específico do Node | `node:tls` direto e driver falham igual; controle neutro funciona | **DESCARTADA** como falha geral do runtime/trust store |
| Problema específico do driver | a falha ocorre também sem o driver, via `node:tls` | **DESCARTADA** |
| Outra causa (ex.: política de rede/allowlist do Atlas) | não verificável sem console ou segunda rede | **INCONCLUSIVA** |

O alerta idêntico no TLS direto e no driver, afetando os 3 servidores, aponta para uma rejeição sistêmica no destino/path, não para um erro de aplicação, credencial ou certificado. Ainda assim, os dados disponíveis não permitem separar endpoint Atlas de intermediário de rede.

## 9. Causa identificada ou limitações

**Confirmado:** a conexão é rejeitada na negociação TLS com alerta fatal `internal_error`, antes de autenticação, validação de certificado e `ping`. O runtime Node e o repositório de confiança funcionam para um destino público neutro.

**Não determinado:** a origem concreta do alerta — endpoint/cluster Atlas, política de rede do Atlas, proxy/inspeção TLS ou outro intermediário.

Limitações que impedem fechar a causa:

- `mongosh` e OpenSSL CLI ausentes; sem segundo cliente TLS.
- Sem acesso ao console/estado do Atlas, Network Access ou logs do cluster.
- Apenas um caminho de rede testado; sem segunda rede ou máquina.
- Sem captura de pacotes nem inspeção de certificado do servidor (o handshake não chegou a apresentá-lo).
- Software de inspeção HTTPS/antivírus não foi inspecionado em profundidade.
- O processo Next histórico não estava mais ativo e seu ambiente efetivo não pôde ser confirmado.
- Janela de observação curta; a falha se repetiu, mas não há histórico prolongado.

## 10. Correção mínima recomendada

Nenhuma alteração deve ser aplicada nesta fase. A menor ação compatível com as evidências é **discriminar rede local de endpoint Atlas**:

1. Pedir ao responsável pelo Atlas que confirme, sem alterar nada, se o cluster está disponível e se o IP público de saída atual está coberto pela Network Access.
2. Repetir o **mesmo** probe TLS único (`node:tls`, SNI correto, validação habilitada, timeout finito) a partir de outra rede/cliente — por exemplo, hotspot móvel ou outra máquina. Se funcionar, a causa provável está no path/rede local; se falhar, aponta para o endpoint/estado do Atlas.
3. Somente após o handshake concluir, repetir um probe único do driver e, se chegar lá, autenticação e `ping`.
4. Só depois avaliar um probe equivalente com Mongoose, sem modelos/índices/dados, e uma validação autorizada do processo Next.
5. A configuração do database exclusivo de desenvolvimento (`save-state-dev` é apenas proposta) fica para etapa separada, após o proprietário aprovar o nome e a conexão estar funcional.

Não recomendado: desabilitar validação TLS, usar `tlsInsecure`/`tlsAllowInvalid*`, definir `NODE_TLS_REJECT_UNAUTHORIZED=0`, forçar TLS obsoleto, aumentar timeout como primeira solução, trocar credenciais sem evidência de falha de autenticação, trocar de banco para contornar o problema ou alterar firewall/antivírus sem evidência.

## 11. Riscos

- **Desabilitar TLS** mascararia a falha e exporia credenciais/dados; não deve ser usado nem temporariamente.
- **Rotacionar credenciais** sem evidência de rejeição de autenticação pode causar indisponibilidade desnecessária.
- **Alterar firewall/antivírus/proxy** sem evidência pode reduzir a segurança e não corrigir a causa.
- **Aumentar timeout** apenas prolonga a espera; o alerta TLS é imediato (~415 ms no probe direto), não um problema de latência.
- **Concluir "Atlas fora do ar"** sem console/logs seria inferência não sustentada.
- **Usar o database errado** ao configurar `MONGODB_DB_NAME` sem aprovação pode misturar dados de desenvolvimento e produção/preview.

## 12. Próximas ações

1. Confirmar estado do cluster e Network Access com o responsável pelo Atlas (somente leitura).
2. Executar o probe TLS único em outra rede/cliente, com validação habilitada.
3. Se o handshake passar, repetir driver → auth → `ping`; registrar categoria e tempo.
4. Se necessário, comparar com `mongosh` apenas se ele for disponibilizado de forma segura e sem URI na linha de comando.
5. Após conexão validada, autorizar probe Mongoose e, depois, configuração do database exclusivo de desenvolvimento.
6. Não alterar AUTH-01C.2 nem declarar o cadastro funcional sem teste autorizado.

## 13. Segurança e integridade

- Nenhum documento lido ou escrito; nenhum `find`, `insert`, `update`, `delete`, aggregate, count, listagem de coleções/databases/índices.
- Nenhuma criação/alteração de database, índice, usuário, permissão, migração ou seed.
- Nenhum cadastro, token ou e-mail.
- Nenhuma alteração de `.env`, credenciais, certificados, dependências, lockfile, firewall, proxy, DNS, Atlas ou Vercel.
- Nenhum commit, push ou deploy.
- Nenhum processo preexistente encerrado; nenhum processo temporário remanescente.
- TLS permaneceu com validação habilitada em todas as tentativas.
- Nenhum hostname, IP, URI, usuário, senha ou certificado foi reproduzido neste relatório.

---

## Adendo — DB-LOCAL-04: comparação de rede (12/11/2026)

A DB-LOCAL-04 iniciou a comparação entre REDE-A e REDE-B com um probe TLS determinístico. Na REDE-A (Ethernet `802.3`, rede pública), o TCP foi estabelecido e o TLS falhou com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` em 39 ms, sem alcançar a validação de certificado; o controle público concluiu TLS 1.3 autorizado em 37 ms. A REDE-B **não foi executada** naquele primeiro momento porque dependia de troca manual e confirmação do proprietário. O checklist do Atlas permanece **NÃO CONFIRMADO**. Relatório completo em [`DB_LOCAL_04_NETWORK_COMPARISON.md`](DB_LOCAL_04_NETWORK_COMPARISON.md). Nenhuma configuração foi alterada e o estado AUTH-01C.2 permanece inalterado.

**Atualização — REDE-B concluída (12/11/2026 00:21:59 -03:00):** após a troca manual, o mesmo probe foi executado uma única vez na REDE-B e também falhou com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` (31 ms), com TCP estabelecido e validação de certificado não alcançada; o controle concluiu TLS 1.3 autorizado em 38 ms. A impressão digital da rede mudou antes do probe (`9766960b75d1`) e reverteu depois para a original (`88feb53f0ebd`), então a estabilidade da REDE-B durante toda a execução não foi confirmada. Não houve diferença de resultado entre as duas redes. O veredito permanece **INCONCLUSIVO**; o padrão aponta para o endpoint/configuração do Atlas ou um elemento comum às duas conexões, sem confirmação do painel. Nenhuma configuração foi alterada.
