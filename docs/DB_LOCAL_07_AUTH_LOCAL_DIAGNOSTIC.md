# DB-LOCAL-07 / GATE 3B.2-AUTH-DIAG — Diagnóstico local da autenticação Atlas

**Data:** 14/11/2026
**Escopo:** inspeção local de construção, codificação, carregamento e interpretação de `MONGODB_DEV_URI`.
**Conexão MongoDB:** nenhuma (local ou Atlas).
**Autenticação:** não tentada.
**Alterações de configuração/código:** nenhuma.
**Resultado do diagnóstico:** **INCONCLUSIVO** — nenhum defeito local detectável; a causa remota permanece não verificada.

> Este documento registra somente fatos observáveis localmente e categorias sanitizadas.
> Nenhum valor de URI, username, senha, hostname, comprimento, hash, fragmento ou mensagem
> bruta de autenticação é reproduzido.

---

## A. Estado do ambiente

| Item | Valor observado |
|---|---|
| Distribuição | Ubuntu 26.04.1 LTS (base Kubuntu) |
| Kernel | `7.0.0-43-generic` |
| Shell | Fish |
| Node.js | `v24.22.3` (fnm) |
| pnpm | `11.3.0` |
| `@next/env` | `15.5.29` (usado para carregar o ambiente) |
| Mongoose | `8.24.4` |
| MongoDB Driver resolvido pelo Mongoose | `6.20.0` |
| Segunda cópia de driver no store pnpm | `7.6.0` (transitiva; não é a usada pelo Mongoose) |
| `mongodb-connection-string-url` | `3.0.2` (do driver 6.20.0) e `7.0.2` (transitiva) |
| mongosh | `2.14.2` disponível |
| MongoDB Compass | **não instalado** |
| MongoDB local | serviço nativo ativo em `127.0.0.1:27017` — **não acessado** |
| Arquivos dotenv carregados | somente `.env` |
| `.env.local`, `.env.development`, `.env.production`, `.env.test` | ausentes |
| Diretório `.vercel` | ausente |

Nenhuma ferramenta foi instalada e nenhum serviço foi iniciado, parado ou consultado.

---

## B. Variáveis de ambiente

Carregamento executado com `loadEnvConfig(cwd, dev=true)`, equivalente ao modo development do projeto.

| Verificação | Resultado |
|---|---|
| `MONGODB_DEV_URI` presente antes do load | não |
| `MONGODB_DEV_URI` presente após o load | sim |
| Origem | exclusivamente `.env` |
| Definições duplicadas da chave em `.env` | **1** |
| Override pré-existente no processo | não |
| Valor efetivo idêntico ao valor parseado do arquivo | **sim** |
| Nome da variável com duplicidade/case divergente | não |
| Arquivo `.env` em CRLF | **sim** |
| Linha da variável com espaço à direita | não |
| Valor com espaço/whitespace externo | não |
| Valor com `\r`, `\n`, `\t` ou caracteres de controle | não |
| Valor com BOM | não |
| Valor com aspas literais remanescentes | não |
| Linha do `.env` delimitada por aspas duplas | **sim** |
| Conteúdo após a aspa de fechamento | não |
| Interpolação de `$` pelo `@next/env` | não (valor não contém `$`) |
| Sequências `\n`/`\r`/`\\` no valor bruto | não |
| Caractere `#` no valor | não |
| Valor ASCII | sim |

### Interpretação

- O `@next/env` normaliza CRLF antes do parse e remove o par de aspas externo. O valor efetivo
  entregue à aplicação é igual ao valor pré-interpolação do dotenv, sem `\r`, sem aspas e sem
  interpolação.
- **Fato:** o CRLF do `.env` **não** contamina o valor efetivo.
- **Fato:** não há override, duplicidade ou arquivo concorrente de ambiente.
- **Inferência:** o carregamento local está consistente com o que os probes anteriores
  relataram.

---

## C. Parsing da URI e percent-encoding

### Estrutura

| Verificação | Resultado |
|---|---|
| Scheme | `mongodb+srv` |
| Username presente | sim |
| Password presente | sim |
| Username corresponde exatamente a `hericmendez00_db_dev` | **sim** |
| Database path | **não** |
| Parâmetros de query | **0** |
| `authSource` explícito | não |
| `authMechanism` explícito | não |
| `authMechanismProperties` | não |
| `tls`, `ssl`, `tlsInsecure`, `tlsAllowInvalid*`, `sslValidate` | ausentes |
| `retryReads`/`retryWrites`/`directConnection` na URI | ausentes |
| Múltiplos `@` na authority | não |
| Host único no SRV | sim |

### Percent-encoding

| Verificação | Resultado |
|---|---|
| Username com `%` malformado | não |
| Password com `%` malformado | não |
| Presença de `%25` (indicador de dupla codificação) | não |
| `decodeURIComponent` altera o username | **não** |
| `decodeURIComponent` altera o password | **não** |
| Segunda decodificação altera o valor | não |
| Caracteres reservados não escapados (`: / ? # [ ] @`) | não |
| Espaço, `+` ou `%` no password | não |
| Espaço no username | não |
| Parser WHATWG (`new URL`) aceita | sim |
| Parser do driver (`ConnectionString` 3.0.2) aceita | sim |
| Ambos os parsers concordam em username e password | **sim** |
| Ambos concordam que não há database path | sim |
| Username decodificado pelo driver corresponde ao esperado | sim |

### Interpretação

- **Fato:** a decodificação percentual é **no-op** para username e password. Não há
  percent-encoding a interpretar, logo não há divergência possível entre `decodeURIComponent`,
  WHATWG URL e `mongodb-connection-string-url`.
- **Fato:** não há evidência local de dupla codificação, truncamento por `#`, escape de aspas
  ou interpolação de variável.
- **Limite:** uma URI sintaticamente impecável **não prova** que a senha decodificada
  corresponde à senha cadastrada no Atlas. Essa correspondência é impossível de verificar
  localmente.

---

## D. Mecanismo de autenticação

### Comportamento confirmado no código local

- `mongodb+srv` é interpretado pelo `mongodb-connection-string-url` 3.0.2 (WHATWG URL) e pelo
  driver 6.20.0.
- Sem database path e sem `authSource` explícito, `MongoCredentials` usa a origem padrão
  **`admin`** (`mongodb/lib/cmap/auth/mongo_credentials.js`).
- Sem `authMechanism`, o mecanismo é `DEFAULT`; o driver negocia SCRAM (SHA-256/SHA-1 conforme
  o servidor). Nenhuma opção local altera o mecanismo.
- `mongodb+srv` habilita TLS por padrão; nenhuma opção insegura está presente.
- O driver lê registros DNS TXT do SRV e aceita `authSource` como override de TXT. **Esse
  caminho não foi consultado nesta execução** e permanece como hipótese remota.

### Mongoose versus probe

- `db/connection.ts` chama `mongoose.connect(uri, { dbName, ... })`.
- O código do Mongoose 8.24.4 (`NativeConnection.createClient`) remove `options.dbName` antes
  de criar o `MongoClient` e usa `dbName` apenas para selecionar o database em `_setClient`.
- Portanto, o `authSource` efetivo da aplicação continua **`admin`**, igual ao probe que usou
  `MongoClient` diretamente sem `dbName`.
- **Fato:** não há divergência local de `authSource` entre a aplicação e os probes R2/R3.
- **Fato:** não há `authMechanism`, `authMechanismProperties` ou opção TLS divergente entre a
  configuração observada e a descrita nos probes.

### Limites

- A negociação SCRAM e o resultado da autenticação dependem do servidor Atlas e não podem ser
  reproduzidos localmente sem conexão.
- O código sanitizado `MONGO_8000` foi registrado sem a mensagem bruta. Isso preserva segredos,
  mas **removeu a classificação exata do erro** (por exemplo, distinção entre senha inválida,
  usuário inexistente, erro específico do Atlas ou bloqueio temporário). Essa é uma limitação
  do histórico, não um defeito local.

---

## E. Histórico dos probes

| Tentativa | Pré-condições | O que foi testado | Resultado |
|---|---|---|---|
| AUTH inicial | Variável ausente no ambiente carregado | Nada | Nenhuma conexão |
| AUTH repetição | Variável presente; TLS respondeu | Uma conexão via `MONGODB_DEV_URI` | `MONGO_8000`; ping não executado |
| AUTH-R2 | Variável presente; database `save-state-dev`; `.env` 600 | Uma conexão; TLS explícito; sem `dbName` | `MONGO_8000`; ping não executado |
| AUTH-R2 repetição | Idênticas | Uma conexão | `MONGO_8000`; ping não executado |
| AUTH-R3 | Username corrigido e confirmado | Uma conexão; TLS explícito; sem `dbName` | `MONGO_8000`; ping não executado |

### Hipóteses já descartadas pelo histórico

- Variável ausente — descartada após o `.env` ser salvo.
- Username divergente — corrigido e confirmado como correspondente no R3.
- Percent-encoding malformado — os preflights reportaram válido; este diagnóstico confirma que
  a decodificação é no-op.
- Bypass de TLS — nunca foi usado; os probes usaram TLS com validação.
- `authSource` alterado manualmente — nunca foi alterado; permanece implícito/`admin`.

### Hipóteses ainda abertas

- Senha local diferente da senha cadastrada no Atlas.
- Usuário inexistente, desabilitado, recriado ou com senha rotacionada sem atualização local.
- Override de `authSource` via registro TXT do SRV.
- Propagação/estado transitório do Atlas ou bloqueio temporário por tentativas repetidas.
- Significado específico do código `8000` (mensagem bruta descartada).

### Sobre TLS nos relatórios

Os relatórios R2/R3 afirmam corretamente que **não houve teste TLS independente**: houve
resposta do servidor durante a conexão com TLS e validação habilitados. A primeira seção AUTH
descreve que "o driver negociou TLS para alcançar a resposta", o que é uma inferência razoável,
não uma validação criptográfica separada. Não há alegação indevida de validação independente
nos documentos mais recentes.

---

## F. Hipóteses

| # | Hipótese | Evidência favorável | Evidência contrária | Situação |
|---|---|---|---|---|
| 1 | Variável não carregada / duplicada / sobrescrita | — | Carregada de `.env`, definição única, sem override, efetivo = parseado | **Descartada** |
| 2 | Aspas, CRLF, espaço ou caractere invisível contaminando o valor | `.env` em CRLF e linha entre aspas | Dotenv normaliza CRLF e remove aspas; sem `\r`, controle, BOM ou whitespace externo | **Descartada** |
| 3 | Interpolação de `$` pelo `@next/env` | — | Valor não contém `$`; pré-interpolação = efetivo | **Descartada** |
| 4 | Percent-encoding malformado / dupla codificação | — | Sem `%` malformado, sem `%25`, decodificação no-op | **Descartada** |
| 5 | Caracteres reservados não escapados | — | Parser do driver aceita; nenhum reservado não escapado | **Descartada** |
| 6 | Username divergente | — | Comparação exata com `hericmendez00_db_dev`; ambos os parsers concordam | **Descartada** |
| 7 | Database path ou `authSource` conflitante | — | Sem path, sem `authSource` explícito; driver usa `admin` | **Descartada localmente** |
| 8 | `authMechanism` ou propriedades conflitantes | — | Nenhum parâmetro; mecanismo `DEFAULT`/SCRAM | **Descartada localmente** |
| 9 | Opção TLS insegura ou bypass | — | Nenhuma opção presente; SRV usa TLS por padrão | **Descartada** |
| 10 | Divergência de `authSource` entre app e probe | App passa `dbName` ao Mongoose | Mongoose remove `dbName` antes do `MongoClient`; ambos usam `admin` | **Descartada** |
| 11 | Senha local diferente da cadastrada no Atlas | Falha persistente mesmo com username correto | Não há como comparar localmente; exige conferência privada/autenticação | **Não verificada** |
| 12 | Usuário inexistente/desabilitado/recriado no Atlas | Falha persistente | Não há evidência local | **Não verificada** |
| 13 | Override de `authSource` via TXT do SRV | Driver aceita `authSource` de TXT | TXT não foi consultado; Atlas normalmente não define esse registro | **Não verificada** |
| 14 | Propagação/estado transitório do Atlas ou bloqueio temporário | Tentativas repetidas em curto intervalo | Sem evidência | **Não verificada** |
| 15 | Código `8000` classificado de forma insuficiente | Mensagem bruta foi descartada | O código foi preservado, mas sem `codeName`/categoria | **Confirmada como limitação** |
| 16 | Roles/isolamento insuficientes | Roles nunca auditadas | Erro de autorização normalmente difere de falha de autenticação | **Não verificada** (não explica `8000` por si) |

---

## G. Próxima ação recomendada

A menor validação necessária, em ordem:

1. **Conferência privada no Atlas (proprietário, sem compartilhar segredos):**
   confirmar que o usuário `hericmendez00_db_dev` existe, está ativo, qual senha está vigente,
   qual é o database de autenticação (`admin`) e quais roles possui. Confirmar também que a
   senha do `.env` foi atualizada após a última rotação.

2. **Validação independente opcional (requer autorização):**
   instalar o MongoDB Compass e testar host, usuário, senha e `authSource=admin` com TLS — ou
   usar `mongosh` interativo pelo proprietário. O objetivo é separar “credencial inválida” de
   “construção/decodificação da URI no Node”. O Compass **não** está instalado e não deve ser
   instalado nesta execução.

3. **AUTH-R4 (somente com autorização explícita):**
   uma única conexão + um único ping, exclusivamente com `MONGODB_DEV_URI`, sem retry e sem
   escrita. Preservar de forma sanitizada o `codeName` e a categoria do erro (sem mensagem
   bruta), para distinguir autenticação de autorização/erro do Atlas.

4. **Não alterar `authSource`, senha, roles ou URI** por iniciativa do agente.

**Não repetir conexão nesta etapa.** O diagnóstico local não encontrou causa; a próxima
evidência precisa vir da credencial/Atlas ou de uma nova tentativa autorizada.

---

## H. Integridade

Confirmado nesta execução:

- **Nenhuma conexão MongoDB** (local ou Atlas).
- **Nenhum `ping`, leitura ou escrita remota.**
- **Nenhum modelo Mongoose inicializado.**
- **Nenhum Next.js iniciado.**
- **Nenhuma criação de índice/coleção, seed ou migração.**
- **Nenhuma alteração de `.env`, código, schema, dependências ou lockfile.**
- **Nenhum usuário, senha, role ou configuração do Atlas alterado.**
- **Nenhum processo iniciado ou encerrado.**
- **Nenhum segredo exibido, copiado ou persistido.**
- **Nenhum commit, push ou deploy.**
- **Nenhum comando Git destrutivo.**
- A única escrita foi este documento novo em
  `docs/DB_LOCAL_07_AUTH_LOCAL_DIAGNOSTIC.md`.

O carregamento de `@next/env` e o parse com `ConnectionString` ocorreram em processo filho,
sem abrir sockets.

---

## Conclusão

**INCONCLUSIVO** — não foi encontrado nenhum defeito local de carregamento, aspas, CRLF,
percent-encoding, username, `authSource`, mecanismo ou opção TLS. A falha persistente de
autenticação depende de informação que não pode ser comprovada localmente (credencial/estado do
usuário no Atlas) ou de uma nova tentativa remota autorizada.

**GATE 3B.2-AUTH:** ainda não aprovado.
**AUTH-R4:** não autorizado nesta execução.
**GATE 3B.2-B:** NÃO AUTORIZADO.

**STATUS FINAL: CONCLUÍDO — diagnóstico local documentado; nenhuma conexão realizada.**
