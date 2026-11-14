# DB-LOCAL-07 / GATE 3B.2-AUTH — Validação da credencial de desenvolvimento

**Resultado da repetição: FALHOU — resposta de erro do servidor durante autenticação.**
**Conexão autenticada / ping:** não concluídos.
**GATE 3B.2-B:** NÃO AUTORIZADO.

## 1. Objetivo e limite

Validar a nova credencial exclusivamente pela variável `MONGODB_DEV_URI`, com uma conexão e um ping em `admin`, sem usar a URI atual da aplicação. Na repetição, o preflight local passou e foi feita uma única tentativa de conexão. O servidor respondeu com código sanitizado `MONGO_8000` durante `connect()`; a autenticação não foi aprovada e o ping não foi enviado. Uma tentativa preliminar anterior parou em erro local de resolução do módulo antes de criar cliente ou abrir conexão.

## 2. Pré-condições observadas

| Verificação | Resultado |
|---|---|
| Node.js | `v24.22.2` |
| pnpm | `11.3.0` |
| MongoDB Driver / Mongoose | `6.20.0` / `8.24.4` |
| Carregador | `@next/env`, modo development |
| `MONGODB_DEV_URI` após carregar ambiente | presente |
| Origem observada | `.env`; sem override no processo |
| `MONGODB_URI` | presença verificada sem revelar conteúdo; não usado para conexão |
| `MONGODB_DB_NAME` | corresponde a `save-state-dev` |
| `.env` | modo `600` |

O preflight sanitizado confirmou formato `mongodb+srv`, credenciais presentes e percent-encoding válido; cluster compatível com o padrão esperado `Cluster0`; ausência de database path; nenhuma opção TLS insegura; validação de certificado/hostname mantida; e `authSource` implícito. Nenhum valor da URI, usuário, hostname ou detalhe secreto foi exibido. A conexão alcançou uma resposta de servidor sob TLS, mas a autenticação falhou; não se deve inferir que a credencial, usuário ou origem estejam corretos.

## 3. Execução remota

- Tentativa de conexão: **uma**, exclusivamente com `MONGODB_DEV_URI`.
- Opções: TLS ativado com validação de certificado e hostname; timeouts finitos; pool/conexões simultâneas limitados a 1; `retryReads: false`, `retryWrites: false`; nenhum `dbName` passado ao construtor.
- `connect()`: falhou durante autenticação, código sanitizado `MONGO_8000` (resposta do servidor; mensagem/stack brutas descartadas).
- TLS: o driver negociou TLS para alcançar a resposta do servidor, com validação habilitada; nenhum bypass de TLS foi usado.
- Autenticação: **não aprovada**; categoria registrada `AUTHENTICATION_FAILED`.
- `ping` em `admin`: **não executado**, pois `connect()` falhou.
- Fechamento: cliente fechado em `finally`.
- Duração total do probe: aproximadamente `639 ms`; exit code local `2`.
- Não houve retry, consulta, leitura de documentos ou operação de escrita.

O probe temporário foi criado fora do repositório com permissão restrita e removido ao terminar. Não exibiu URI, usuário, senha, hostname, IP, mensagem bruta ou stack. `MONGODB_URI` não foi usado para conexão, e nenhum arquivo de configuração foi modificado.

## 4. Processos e integridade

Na verificação passiva final, os PIDs Next conhecidos `24526`, `24550` e `24585` não estavam ativos e não foram observados sockets MongoDB estabelecidos. Nenhum processo foi encerrado por esta tarefa; não é possível atribuir o término a alguém. Não foram inspecionadas variáveis de ambiente, memória ou credenciais desses processos; não houve interação HTTP. Não se atribui a eles nenhuma operação remota.

`.env` permaneceu modo `600`; `MONGODB_DB_NAME` permaneceu configurado como `save-state-dev`; lockfile inalterado. O script temporário de conexão foi removido. Nenhum código de aplicação, credencial, role, dependência ou recurso Atlas foi alterado.

Branch/HEAD: `main` / `9aaa952bae0bbe0bfca5674d301b0284c44bc824`. O working tree tinha 484 entradas em `git status --short`, incluindo alterações preexistentes; esta tarefa acrescentou somente este relatório. `git diff --check` retornou exit code 2 por problemas preexistentes de whitespace/CRLF no working tree; o relatório novo foi verificado separadamente.

## 5. Próximo passo necessário

O proprietário deve revisar privadamente a credencial recém-configurada, o usuário Atlas e sua origem de autenticação; não compartilhar URI/senha no chat. Se decidir corrigir a credencial ou `authSource`, fazê-lo fora desta execução e solicitar nova autorização antes de qualquer nova tentativa. Não alterar `MONGODB_URI`, `MONGODB_DB_NAME`, roles ou infraestrutura como parte deste gate. Uma futura validação deve ser uma autorização nova; não repetir automaticamente.

**GATE 3B.2-AUTH: FALHOU — uma tentativa via `MONGODB_DEV_URI` recebeu resposta de erro do servidor durante autenticação; ping não executado.**
**GATE 3B.2-B: NÃO AUTORIZADO.**

---

## GATE 3B.2-AUTH-R2 — Validação após redefinição de senha

### Pré-condições

- Node `v24.22.2`, MongoDB Driver `6.20.0`, Mongoose `8.24.4`.
- Ambiente carregado por `@next/env` em modo development.
- `MONGODB_DEV_URI` presente e proveniente de `.env`; nenhum override dessa variável no processo.
- `MONGODB_DB_NAME` corresponde a `save-state-dev`; nenhum override dessa variável no processo.
- `.env` modo `600`.
- URI sintaticamente válida, scheme `mongodb+srv`, credenciais presentes e percent-encoding válido; cluster compatível com o padrão esperado Cluster0; sem database path conflitante.
- `authSource` implícito, sem alteração. Nenhuma opção TLS insegura detectada.
- Valores da URI, usuário, senha, hostname e IP não foram exibidos.

### Conexão, autenticação e ping

- Uma única chamada `MongoClient.connect()`, usando exclusivamente `MONGODB_DEV_URI`; sem `dbName` no construtor.
- TLS explicitamente habilitado, com validação de certificado e hostname habilitada; timeouts finitos, pool limitado a uma conexão e retries de leitura/escrita desabilitados.
- `connect()` recebeu resposta do servidor com código sanitizado `MONGO_8000`; a conexão autenticada não foi estabelecida. Resultado classificado como `AUTHENTICATION_FAILED`.
- O TLS não foi desabilitado nem contornado. O servidor respondeu durante o handshake/conexão; o probe não registrou uma verificação TLS separada antes da falha de autenticação.
- Ping em `admin`: **não executado**, pois `connect()` falhou.
- Cliente fechado em `finally`.
- Duração total aproximada: `533 ms`; exit code local `2`.
- Nenhum retry e nenhuma consulta de documentos, listagem de databases/collections/indexes ou escrita.

### Integridade e veredito R2

O probe temporário foi mantido fora do repositório, com permissão restrita, e removido ao terminar. Não foram alterados `.env`, variáveis, código, dependências, lockfile, credenciais, roles ou recursos Atlas. Não houve inicialização do Next.js, commit, push ou deploy. O relatório foi atualizado para preservar a falha anterior e acrescentar este resultado.

**GATE 3B.2-AUTH-R2: FALHOU — a tentativa única recebeu `MONGO_8000` durante `connect()`; autenticação não concluída e ping não executado.**
**GATE 3B.2-B: NÃO AUTORIZADO.**

### Reexecução R2 solicitada — resultado

- Pré-condições novamente passaram: Node `v24.22.2`, `@next/env` development, variável de desenvolvimento vinda de `.env` sem override de processo, database `save-state-dev`, `.env` modo `600`, URI `mongodb+srv` sintaticamente válida, percent-encoding válido, cluster compatível com Cluster0, sem database path conflitante e sem opções TLS inseguras.
- Feita **uma** chamada `connect()` exclusivamente com `MONGODB_DEV_URI`. TLS e validação de certificados/hostname explicitamente habilitados; timeouts finitos; pool de uma conexão; retries desligados; sem `dbName` e sem alterar `authSource`.
- `connect()` falhou com código sanitizado `MONGO_8000`, classificado como `AUTHENTICATION_FAILED`. Cliente fechado em `finally`.
- Ping: **não executado**, pois a conexão não autenticou. Nenhuma consulta/listagem de dados e nenhuma escrita.
- Duração total: aproximadamente `645 ms`; exit code local `2`. Nenhuma segunda tentativa foi feita automaticamente.
- `.env` continuou em modo `600`; lockfile sem alteração; probe temporário removido. Nenhuma configuração, código, dependência, role ou recurso Atlas foi alterado.

**Resultado desta reexecução GATE 3B.2-AUTH-R2: FALHOU — `MONGO_8000` durante `connect()`; autenticação não concluída e ping não executado.**

---

## GATE 3B.2-AUTH-R3 — Validação após correção da identidade

### Pré-condições

- Node `v24.22.2`; driver `6.20.0`; Mongoose `8.24.4`.
- `@next/env` carregado em modo development; `MONGODB_DEV_URI` veio de `.env`, sem override do processo.
- `MONGODB_DB_NAME` corresponde a `save-state-dev`; `.env` em modo `600`.
- URI `mongodb+srv` sintaticamente válida, credenciais presentes, percent-encoding válido, cluster compatível com Cluster0, sem database path conflitante ou configuração TLS insegura.
- Comparação local da identidade: **`username_matches_expected: true`**. O username não foi impresso nem registrado.
- `authSource` não foi alterado; nenhum `dbName` foi passado ao construtor.

### Conexão, TLS, autenticação e ping

- Uma única chamada `MongoClient.connect()` exclusivamente com `MONGODB_DEV_URI`; TLS e validação de certificado/hostname explicitamente habilitados; timeouts finitos; pool limitado a uma conexão; retries de leitura/escrita desabilitados.
- O servidor respondeu durante `connect()` com código sanitizado `MONGO_8000`; categoria `AUTHENTICATION_FAILED`. A autenticação não foi concluída.
- O TLS não foi desabilitado nem contornado. A resposta MongoDB chegou com o transporte seguro configurado; não houve teste TLS independente.
- Ping em `admin`: **não executado**, pois a conexão autenticada falhou.
- Cliente encerrado em `finally`; duração total aproximada de `500 ms`; exit code local `2`.
- Nenhuma consulta/listagem de dados, operação persistente, retry ou segunda tentativa.

### Segurança e integridade

O probe temporário foi criado fora do repositório com permissão restrita e removido. Não foram exibidos ou persistidos URI, senha, username, hostname, IP, erro bruto ou stack. `.env` permaneceu modo `600`; nenhum arquivo de configuração, `MONGODB_URI`, credencial, role, dependência ou lockfile foi alterado. Os PIDs Next anteriormente conhecidos não estavam ativos na inspeção passiva final; nenhum processo foi encerrado pela tarefa. Não se conclui que não havia atividade Atlas por outros clientes. `git diff --check` retornou exit code `2` por problemas preexistentes de whitespace/CRLF no working tree amplo; os dois relatórios deste gate foram verificados separadamente e não têm whitespace final.

**GATE 3B.2-AUTH-R3: FALHOU — identidade corresponde, mas `connect()` retornou `MONGO_8000`; ping não executado.**
**GATE 3B.2-B: NÃO AUTORIZADO.**
