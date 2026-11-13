# DB-LOCAL-07 / GATE 2 — Configuração controlada do ambiente Linux

**Data:** 12/11/2026
**Fase:** DB-LOCAL-07 / GATE 2
**Checkpoints executados:** 2.1 — Inspeção; 2.2 — Node.js 24; 2.3 — configuração MongoDB; 2.4 — validação local
**Checkpoints pendentes:** nenhum no escopo local do GATE 2
**Veredito atual:** **GATE 2 CONCLUÍDO NO ESCOPO LOCAL — CHECKPOINT 2.4 aprovado; verificação remota read-only concluída; provisionamento do GATE 3 não iniciado**
**Database aprovado:** `save-state-dev`
**Conexão MongoDB nesta fase:** nenhuma

## 1. Objetivo

Preparar o ambiente Linux do Save State para:

1. executar o projeto com Node.js 24.x;
2. resolver explicitamente o database de desenvolvimento como `save-state-dev`;
3. preservar a autenticação MongoDB existente;
4. impedir o uso acidental do fallback `save-state`;
5. registrar configurações e resultados;
6. deixar o ambiente pronto para um provisionamento futuro controlado.

O GATE 2 não autoriza criação ou alteração de recursos no Atlas. Nesta execução foram realizados os CHECKPOINTS 2.1 (inspeção local), 2.2 (Node.js 24 em espaço de usuário), 2.3 (configuração mínima do `.env`) e 2.4 (validação local da resolução). Nenhuma conexão MongoDB ou operação Atlas foi executada.

## 2. Ambiente e versões

| Item | Inicial (2.1) | Após 2.2/2.3 |
|---|---|---|
| Sistema | Garuda Linux rolling, KDE | inalterado |
| Kernel | `7.2.14-zen1-1-zen` x86_64 | inalterado |
| Shell do usuário | `/usr/bin/fish` | inalterado |
| Versão do Fish | `4.9.3` | inalterado |
| Diretório real do checkout | `/home/revi/Documentos/Projects/The Save State Project/AGORA_VAI/save-state` | inalterado |
| Branch | `main` | inalterada |
| HEAD | `9aaa952bae0bbe0bfca5674d301b0284c44bc824` | inalterado |
| Node.js do sistema | `v22.23.4` | preservado em `/usr/bin/node` |
| Node.js do projeto | `v22.23.4` | `v24.22.2` via `fnm` |
| OpenSSL do Node do projeto | `3.6.5` | `3.5.9` |
| OpenSSL do sistema/CLI | `3.6.5` | inalterado |
| npm do projeto | `12.2.2` | `11.19.1` no Node 24 |
| npx do projeto | não medido | `11.19.1` no Node 24 |
| pnpm dentro do projeto | `11.3.0` | `11.3.0` |
| pnpm fora do projeto | `12.17.0` | `12.17.0` |
| fnm | ausente | `1.39.0` em `~/.local/bin/fnm` |
| `MONGODB_DB_NAME` | ausente | `save-state-dev`, uma única definição no `.env` |
| Declaração do projeto | `.nvmrc` com `24`; `engines.node` com `24.x`; `packageManager` com `pnpm@11.3.0` | inalterada |

Não há processos Node, Next.js, pnpm ou tsx em execução. O `mongod` local em `127.0.0.1:27017` é preexistente, iniciado às `09:29:12`, e não foi iniciado, acessado ou encerrado nesta fase. Não há conexões estabelecidas nessa porta.

## 3. Versões observadas

### 3.1 Node.js e pacotes do sistema

- `/usr/bin/node` pertence ao pacote `nodejs-lts-jod 22.23.4-1` e permanece em `v22.23.4`.
- O Node.js `v24.22.2` está instalado em `~/.local/share/fnm/node-versions/v24.22.2/installation/`.
- O pacote `extra/nodejs-lts-krypton 24.22.2-1` não foi instalado; nenhum pacote do sistema foi substituído.
- `/usr/bin/pnpm` pertence ao pacote `pnpm 12.17.0-1`.
- Dentro do projeto, `pnpm -v` retorna `11.3.0`; fora do projeto, retorna `12.17.0`.
- O pnpm lê `packageManager: pnpm@11.3.0` e usa a versão gerenciada pelo projeto. O lockfile permaneceu inalterado.
- `npm` e `npx` do sistema existem em `/usr/bin`; no Node 24, ficam no multishell do `fnm`.
- `fnm 1.39.0` foi instalado em `~/.local/bin/fnm`.
- Não há `nvm`, `volta`, `asdf`, `mise` ou `n` instalados.
- `corepack` existe dentro do tarball oficial do Node 24, mas não foi habilitado.

### 3.2 Ferramentas disponíveis nos repositórios

| Ferramenta | Versão disponível | Observação |
|---|---|---|
| `nodejs-lts-krypton` | `24.22.2-1` | Não utilizada; instalação system-wide, conflito com `nodejs` e exigência de `sudo` |
| `fnm` | `1.39.0-1` | **Utilizada via release oficial 1.39.0**, sem `sudo`; o pacote do repositório não foi usado |
| `mise` | `2026.11.3-1` | Não utilizada; maior e exigiria `sudo` |
| `volta` | `2.0.2-1` | Não utilizada; disponível em repositório AUR/chaotic |

O método executado foi a Alternativa A (`fnm` em espaço de usuário). As demais alternativas não foram aplicadas.

## 4. Estado inicial do Git

Antes da criação deste documento:

| Item | Resultado |
|---|---|
| `git status --short` | `475` linhas: `440` modificados e `35` não rastreados |
| `git diff --check` | exit `2`, com `75.858` linhas de diagnóstico preexistentes |
| Branch / HEAD | `main` / `9aaa952bae0bbe0bfca5674d301b0284c44bc824` |

O HEAD e a branch são os mesmos registrados no GATE 1. Nenhuma limpeza, reset, stash ou alteração de arquivos preexistentes foi realizada. Este documento é um novo arquivo não rastreado.

## 5. Alternativas de instalação do Node.js 24

### 5.1 Alternativa A — `fnm` em espaço de usuário — **EXECUTADA**

- **O que é:** gerenciador de versões Node.js, binário Rust, compatível com `.nvmrc` e Fish.
- **Versão:** `fnm 1.39.0` (release oficial; o pacote do repositório Arch não foi usado).
- **Node instalado:** `v24.22.2`.
- **Download:** sim, binário do `fnm` e Node.js 24 pelo próprio `fnm`, ambos de fontes oficiais.
- **`sudo`:** não.
- **Pacotes do sistema:** não.
- **Impacto no PATH:** hook do `fnm` no Fish; o Node 24 é ativado conforme `.nvmrc`.
- **Impacto no pnpm:** o binário `/usr/bin/pnpm` permanece; o projeto continua resolvendo `pnpm@11.3.0`; o lockfile não foi alterado.
- **Arquivos afetados:** `~/.local/bin/fnm`; `~/.local/share/fnm/`; novo `~/.config/fish/conf.d/fnm.fish`.
- **Rollback:** ver seção 6.3; o Node do sistema continua intacto.
- **Vantagem:** respeita `.nvmrc`, não substitui `/usr/bin/node` e permite troca por projeto.
- **Desvantagem:** adiciona um gerenciador e um hook de shell.

### 5.2 Alternativa B — tarball oficial do Node.js — **NÃO UTILIZADA**

- **O que é:** extração do tarball oficial `node-v24.22.2-linux-x64.tar.xz` em `~/.local/opt`.
- **Download:** não realizado para instalação; o tarball foi baixado apenas para verificação de integridade.
- **`sudo`:** não.
- **Pacotes do sistema:** não.
- **Impacto no PATH:** adicionaria `~/.local/opt/node-v24.22.2-linux-x64/bin` ao PATH do Fish.
- **Impacto no pnpm:** o binário `/usr/bin/pnpm` permaneceria; scripts usariam o Node 24 do PATH.
- **Arquivos afetados:** não criados.
- **Rollback:** não aplicável.
- **Vantagem:** menos ferramentas; origem oficial; rollback simples.
- **Desvantagem:** não há troca automática por `.nvmrc`; o PATH do usuário ficaria global para todos os projetos.

### 5.3 Alternativa C — pacote `nodejs-lts-krypton`

- Instalação via `pacman`, com `sudo`.
- Substitui/conflita com o pacote Node atual e altera `/usr/bin/node`.
- Afeta todo o sistema e outros projetos.
- Rollback exige reinstalar o pacote anterior.
- **Não recomendada** para este GATE 2.

### 5.4 Alternativa D — `mise`, `volta`, `asdf` ou `nvm`

- Todas exigem uma ferramenta adicional e configuração de shell.
- `nvm` é orientado a Bash e exigiria plugin/adaptação no Fish.
- `mise` e `volta` são mais amplos do que o necessário.
- **Não recomendadas** para a alteração mínima deste GATE.

## 6. Método executado e integridade

**Método executado: Alternativa A — `fnm 1.39.0` em espaço de usuário + Node.js `24.22.2`.**

### 6.1 Fontes oficiais e checksums

| Artefato | Origem | Integridade |
|---|---|---|
| `fnm-linux.zip` | `https://github.com/Schniz/fnm/releases/download/v1.39.0/fnm-linux.zip` | SHA-256 `7807664f39d39fc518da1c35ba0181e4b3267603c4b1dedeb4b5fc6ae440a224`; igual ao digest da API oficial do GitHub |
| Binário `fnm` extraído | release oficial acima | SHA-256 `2b8810b610654de6914a17e3235d3948fbd5c7d4712815ac45724c3f06e8966f`; `fnm --version` = `1.39.0` |
| Node.js `24.22.2` | `https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz` | SHA-256 `48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75`; igual ao `SHASUMS256.txt` oficial |
| `bin/node` do tarball oficial | tarball verificado acima | SHA-256 `904a6d3484241d466989f9df9ba3aab822b1496191bdb28230eb491a55c32a52` |
| `bin/node` instalado pelo `fnm` | `~/.local/share/fnm/node-versions/v24.22.2/installation/bin/node` | SHA-256 idêntico ao binário oficial: `904a6d3484241d466989f9df9ba3aab822b1496191bdb28230eb491a55c32a52` |

O `fnm` usa o mirror oficial `https://nodejs.org/dist` (`FNM_NODE_DIST_MIRROR`). O tarball oficial foi baixado separadamente apenas para validar a integridade e comparar o binário instalado; não foi usado para instalação paralela.

### 6.2 Procedimento executado

1. Baixado `fnm-linux.zip` do release oficial `v1.39.0`.
2. Verificado o SHA-256 contra o digest oficial da API do GitHub.
3. Extraído o binário `fnm` e verificado `fnm --version` = `1.39.0`.
4. Instalado em `~/.local/bin/fnm` com modo `755`.
5. Criado somente `~/.config/fish/conf.d/fnm.fish`.
6. Executado `fnm install 24.22.2`.
7. Executado `fnm default system` para que diretórios sem `.nvmrc` continuem usando o Node do sistema.
8. Validado `fnm use` sem argumento no Save State, lendo o `.nvmrc` existente.
9. Comparado o `bin/node` instalado com o binário do tarball oficial; hashes idênticos.
10. Nenhum `sudo`, pacote do sistema, `pnpm install`, build, teste com banco ou comando MongoDB foi executado.

O conteúdo criado no Fish é:

```fish
if test -x ~/.local/bin/fnm; and not set -q __fnm_fish_initialized
    ~/.local/bin/fnm env --use-on-cd --shell fish | source
    set -g __fnm_fish_initialized 1
end
```

O guard `__fnm_fish_initialized` evita carregar o hook duas vezes no mesmo shell. Não há outro hook `fnm` em `config.fish` ou em `conf.d`.

### 6.3 Rollback

Procedimento sem `sudo`:

```bash
rm -f ~/.config/fish/conf.d/fnm.fish
~/.local/bin/fnm uninstall 24.22.2
rm -f ~/.local/bin/fnm
rm -rf ~/.local/share/fnm
```

Depois, reabrir o Fish. O `/usr/bin/node` continua em `v22.23.4`; o pnpm e o lockfile não são afetados. Os diretórios `/run/user/1000/fnm_multishells/` são efêmeros e não contêm processos persistentes.

### 6.4 Alternativa B não utilizada

O tarball oficial foi considerado como alternativa, mas não foi instalado em `~/.local/opt`. A ativação por PATH global não foi aplicada.

O projeto permaneceu com `.nvmrc` `24`; nenhum arquivo do projeto foi alterado para fixar a versão.

## 7. Impacto sobre Fish e pnpm

### 7.1 Fish

- O shell do usuário é Fish `4.9.3`.
- O PATH atual já contém `~/.local/bin`, antes de `/usr/bin`.
- O `fnm` foi instalado em `~/.local/bin/fnm`.
- O hook foi colocado em `~/.config/fish/conf.d/fnm.fish`, sem editar `~/.config/fish/config.fish`.
- O arquivo de configuração existente do Fish permaneceu inalterado; não há outro hook Node/pnpm.
- O `fnm default` foi definido como `system`, preservando o Node 22 em diretórios sem `.nvmrc`.
- Um Fish iniciado em `/tmp` usa `/usr/bin/node` `v22.23.4`.
- Um Fish iniciado no projeto `sniper`, que usa `.node-version` `22.23.4`, continua usando o Node do sistema.
- Um Fish iniciado no Save State lê `.nvmrc` `24` e usa `v24.22.2`.
- Shells Bash existentes não foram alterados; continuam usando `/usr/bin/node` `v22.23.4`.

### 7.2 pnpm e npm

- `/usr/bin/pnpm` é um binário ELF do pacote `pnpm 12.17.0-1`.
- Dentro do projeto, `pnpm -v` retorna `11.3.0` por causa de `packageManager: pnpm@11.3.0`.
- Fora do projeto, `pnpm -v` retorna `12.17.0`.
- O `fnm` não substituiu o binário do pnpm.
- `pnpm exec node -v` no projeto retornou `v24.22.2`; `pnpm exec node -p "process.versions.openssl"` retornou `3.5.9`.
- O npm do Node 24 é `11.19.1`; o npm do sistema continua `12.2.2`.
- O lockfile não foi alterado.
- Nenhuma instalação de dependências foi executada.

## 8. Configuração de ambiente atual

O arquivo de ambiente efetivo é:

`/home/revi/Documentos/Projects/The Save State Project/AGORA_VAI/save-state/.env`

| Item | Antes do 2.3 | Após o 2.3 |
|---|---|---|
| Arquivo existe | sim | sim |
| Tamanho | `394` bytes | `426` bytes |
| mtime | `2026-11-09 16:14:13` | `2026-11-12 11:08:14` |
| Modo | `755` | `755`, preservado |
| Proprietário | `revi:revi` | `revi:revi`, preservado |
| Rastreado pelo Git | não | não |
| Ignorado | sim, por `.gitignore` (`.env`) | sim |
| Linhas com newline | `7` | `9` |
| Último byte | `0x42` (`B`), sem newline final | `0x0A` (LF) |
| `MONGODB_DB_NAME` | ausente | presente, uma única definição |
| Valor de `MONGODB_DB_NAME` | — | `save-state-dev` |
| `MONGODB_URI` | uma definição | uma definição, preservada |
| `authSource` na URI | ausente | ausente, preservado |
| Chaves presentes | 6 | 7: `MONGODB_URI`, `JWT_SECRET`, `APP_URL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `SEARCH_METHOD`, `MONGODB_DB_NAME` |

Nenhum valor sensível foi impresso. A URI não tem database path e não tem `authSource` explícito, conforme a configuração já registrada na DB-LOCAL-06.

Não existem `.env.local`, `.env.development`, `.env.development.local`, `.env.production` ou `.env.test` no diretório do projeto. O único arquivo carregado na simulação local foi `.env`.

No CHECKPOINT 2.3, a única alteração foi a inclusão de `MONGODB_DB_NAME=save-state-dev` ao final do `.env`. O arquivo original não terminava em newline; foi inserido um newline antes da nova linha e o arquivo passou a terminar em LF. O conteúdo original e o inode foram preservados; as permissões continuam `755` e o proprietário continua `revi:revi`.

## 9. Precedência das variáveis

### 9.1 Aplicação Next.js

O `@next/env 15.5.29` carrega, para desenvolvimento, nesta ordem:

1. variáveis já definidas em `process.env`;
2. `.env.development.local`;
3. `.env.local`;
4. `.env.development`;
5. `.env`.

A primeira ocorrência vence; variáveis já exportadas no processo não são sobrescritas. Como nenhum dos arquivos mais específicos existe, `.env` é a origem efetiva.

### 9.2 Scripts `tsx`

`scripts/load-local-env.ts` carrega:

1. variáveis já definidas em `process.env`;
2. `.env`;
3. `.env.local`.

O arquivo `.env` é lido primeiro e não é sobrescrito por `.env.local`; portanto, para scripts, a prioridade efetiva é `process.env` > `.env` > `.env.local`. O loader não lê `.env.development*`.

### 9.3 Consequência

`MONGODB_DB_NAME=save-state-dev` foi adicionado ao `.env` no CHECKPOINT 2.3. A presença textual e a unicidade foram confirmadas. No CHECKPOINT 2.4, ambos os caminhos de carregamento resolveram `save-state-dev`:

- `@next/env` carregou somente `.env`;
- `scripts/load-local-env.ts` carregou `.env`;
- nenhum valor conflitante foi encontrado em `process.env`.

A resolução continuará correta desde que:

- a variável não esteja exportada no shell com outro valor;
- nenhum `.env.development.local` ou `.env.local` seja criado com valor conflitante;
- a chave não seja duplicada no mesmo arquivo.

Existe uma diferença de precedência entre Next.js e scripts em relação a `.env.local`. Para evitar ambiguidade, a chave não deve ser duplicada em outro arquivo.

## 10. Local exato da configuração aplicada

A alteração aplicada foi a inclusão de uma única linha no arquivo `.env`:

```dotenv
MONGODB_DB_NAME=save-state-dev
```

Regras observadas na edição do CHECKPOINT 2.3:

1. todas as linhas existentes foram preservadas;
2. o arquivo não foi reformatado;
3. a chave não foi duplicada;
4. `MONGODB_URI` não foi alterada;
5. `authSource` não foi alterado;
6. nenhuma outra variável foi alterada;
7. permissões permaneceram em `755`;
8. o arquivo continua ignorado pelo Git;
9. como o arquivo não terminava em newline, foi adicionado exatamente um newline antes da nova linha; o arquivo agora termina em LF.

A edição foi feita por append ao final do arquivo. O hash do prefixo original, o inode, o modo e o proprietário foram verificados após a edição.

## 11. Semântica de `dbName` e `authSource`

### 11.1 Mongoose 8.24.4

O código da aplicação passa `dbName` explicitamente ao Mongoose:

- `db/connection.ts`: `mongoose.connect(MONGODB_URI, { dbName, ...MONGOOSE_CONNECTION_OPTIONS })`;
- `scripts/verify-indexes.ts`: `mongoose.connect(uri, { dbName, ...MONGOOSE_CONNECTION_OPTIONS })`.

No Mongoose 8.24.4, `options.dbName` é removido antes da construção do `MongoClient` e o database é selecionado depois com `client.db(dbName)`. Portanto, no caminho Mongoose, `dbName` não altera o `authSource` implícito.

### 11.2 Driver MongoDB 6.20.0

Se o `MongoClient` for usado diretamente com `{ dbName }` e a URI não tiver `authSource`, o driver pode usar `dbName` como `credentials.source`. Isso mudaria o banco de autenticação.

Não há script operacional no repositório usando `MongoClient` diretamente com `dbName`. O caminho previsto para a aplicação é Mongoose, que preserva o comportamento atual de `authSource`.

### 11.3 Configuração atual

- A URI permanece intacta.
- `authSource` não foi adicionado automaticamente; sua presença continua ausente na URI.
- `MONGODB_DB_NAME=save-state-dev` está presente uma única vez no `.env`.
- A resolução efetiva do database foi validada no CHECKPOINT 2.4 por `@next/env` e por `scripts/load-local-env.ts`.
- O usuário de desenvolvimento deve usar o banco de autenticação `admin` do Atlas, com roles limitadas a `save-state-dev`, quando a etapa remota for autorizada.
- Se o proprietário optar por criar o usuário dentro de `save-state-dev`, a URI precisará refletir `authSource=save-state-dev`; isso é uma decisão separada e não foi feita.
- Nenhuma permissão foi inferida a partir do `ping` administrativo da DB-LOCAL-06.

## 12. Riscos de seleção incorreta

| Risco | Situação atual | Impacto | Mitigação |
|---|---|---|---|
| Fallback silencioso para `save-state` | Resolvido: ambos os loaders retornaram `save-state-dev` | Nenhum no escopo local | Revalidar se o `.env` ou o shell mudar |
| `.env` sem newline final | Resolvido no 2.3; arquivo agora termina em LF | Nenhum | Prefixo original, inode, modo e proprietário verificados |
| Precedência divergente de `.env.local` | Next.js e scripts tratam `.env.local` de forma diferente | Duplicar a chave pode gerar valores diferentes | Manter a chave apenas no `.env` |
| Variável exportada no shell | Ausente em Bash e Fish; `shell_pre_set=false` | `process.env` pode sobrepor o `.env` | Revalidar se o ambiente do shell mudar |
| `seed-atlas.ts` sem guarda de nome | Script operacional existente | Pode semear o database errado; em dev, `connectDatabase()` pode criar índices | Não executar; adicionar guarda antes do GATE 4 |
| `migrate-lists-to-collections.ts` sem `dbName` | Script operacional existente | Sem path na URI, o driver pode usar `test`; `--live` escreve | Não executar; adicionar guarda antes de qualquer uso |
| `backfill-last-finished-at.ts` sem `dbName` | Script operacional existente | Sem path na URI, o driver pode usar `test`; `--live` escreve | Não executar; adicionar guarda antes de qualquer uso |
| `verify-indexes.ts` sem allowlist | Script operacional existente | Pode criar índices no database errado; imprime host | Não executar; adicionar allowlist/máscara antes do GATE 3 |
| Auto-provisionamento em dev | `connectDatabase()` chama `ensureIndexes()` | Primeiro uso pode criar 33 índices/coleções | Conceder role compatível ou separar runtime/provisionamento |
| Node 22 versus Node 24 | Node 24.22.2 ativo no projeto; sistema preservado; loaders executados com Node 24.22.2 | Nenhum no escopo local | Revalidar após mudanças de versão |
| `pnpm` gerenciado pelo projeto | `pnpm -v` 11.3.0 e `pnpm exec node -v` 24.22.2 | Troca de Node poderia afetar scripts | Validado; manter lockfile |
| `fnm default` global | `default` = `system`; projeto usa `.nvmrc` | Outro projeto poderia herdar Node 24 | Testado em `/tmp` e no projeto `sniper`; ambos usam Node 22 |
| Credencial ampla no Atlas | Roles reais desconhecidas | Risco de atravessar databases | Checklist manual no painel; usuário dedicado no futuro |

### 12.1 Bloqueadores para o GATE 3

Antes do provisionamento autorizado, devem estar resolvidos:

- allowlist e confirmação nominal no `verify-indexes.ts`;
- mascaramento do host nos logs;
- decisão sobre usuário de runtime versus provisionamento;
- confirmação de ausência de override de `MONGODB_DB_NAME` no ambiente usado pelo provisionamento;
- confirmação de que a URI e o `authSource` permanecem inalterados no ambiente remoto autorizado.

### 12.2 Bloqueadores para o GATE 4

- guarda de nome de database no `seed-atlas.ts`;
- proibição explícita de produção;
- confirmação de que o seed não executará `ensureIndexes()` como efeito colateral não planejado;
- dados exclusivamente sintéticos.

## 13. Estratégia de permissões

Nenhuma permissão foi consultada ou alterada. A conferência deve ser manual no painel do Atlas.

### 13.1 Checklist para o proprietário

1. O usuário de desenvolvimento existe ou precisa ser criado?
2. Qual é o banco de autenticação do usuário (`admin` ou outro)?
3. Quais roles estão atribuídas?
4. Cada role se aplica somente a `save-state-dev`?
5. Existe alguma role global de cluster ou `AnyDatabase`?
6. A credencial é reutilizada em Preview ou Produção?
7. Existe separação entre usuário de runtime e usuário de provisionamento?
8. O usuário de runtime precisa criar índices no desenvolvimento?
9. O usuário de seed tem permissão de drop? Se sim, pode ser reduzido?
10. A credencial atual é ampla e deve ser substituída por uma dedicada?

### 13.2 Estratégia recomendada

| Carga | Usuário | Banco de autenticação | Permissões |
|---|---|---|---|
| Runtime dev | `app-dev` | `admin` | `readWrite` em `save-state-dev` ou role customizada equivalente |
| Verificação B-01 | `index-verifier` | `admin` | `read`, `listCollections`, `listIndexes` em `save-state-dev` |
| Provisionamento B-01 | `index-provisioner` | `admin` | `read`, `createCollection`, `createIndex`, `listCollections`, `listIndexes` em `save-state-dev` |
| Seed sintético | `seeder-dev` | `admin` | `read`, `insert`, `update`, `remove` em `save-state-dev` |
| Produção | `app-prod` | `admin` | Role mínima no database de produção, sem gestão de índices/coleções |

Não usar `atlasAdmin`, `clusterAdmin`, `readWriteAnyDatabase`, `dbAdminAnyDatabase` ou `root` na aplicação.

Como o desenvolvimento pode criar índices automaticamente, `readWrite` é suficiente para o runtime dev, mas é amplo. Se o auto-provisionamento for removido no futuro, o runtime dev pode usar uma role sem `createIndex`.

Nenhum nome de usuário ou senha deve ser enviado no chat. Nenhuma role será criada ou modificada neste GATE 2.

## 14. Checkpoints autorizados e pendentes

| Checkpoint | Status | Observação |
|---|---|---|
| 2.1 — Inspeção | **Executado** | Somente leitura local; sem instalação; sem edição de `.env`; sem conexão MongoDB |
| 2.2 — Node.js 24 | **Executado** | `fnm 1.39.0` e Node `24.22.2` instalados e verificados; sistema preservado |
| 2.3 — Configuração MongoDB | **Executado** | `MONGODB_DB_NAME=save-state-dev` adicionado uma vez ao `.env`; demais variáveis preservadas |
| 2.4 — Validação local | **Executado** | `@next/env` e `scripts/load-local-env.ts` resolveram `save-state-dev`; sem conexão MongoDB |

Não há checkpoints locais pendentes no GATE 2. O GATE 3 permanece não iniciado e exigirá autorização própria.

## 15. Alterações efetivamente realizadas

Nesta execução:

- este documento foi criado no CHECKPOINT 2.1 e atualizado nos CHECKPOINTS 2.2 e 2.3;
- `fnm 1.39.0` foi instalado em `~/.local/bin/fnm`;
- Node.js `24.22.2` foi instalado em `~/.local/share/fnm/node-versions/v24.22.2/`;
- `~/.config/fish/conf.d/fnm.fish` foi criado;
- o `fnm default` foi definido como `system`;
- `.env` foi alterado somente no 2.3, com a inclusão de uma única linha;
- nenhum arquivo de código do projeto foi alterado;
- nenhuma credencial foi alterada;
- nenhum recurso do Atlas foi criado ou modificado;
- nenhum índice, coleção, documento, seed ou migração foi executado;
- nenhuma conexão MongoDB foi aberta;
- nenhum `pnpm install`, build, Next.js ou teste com banco foi executado;
- nenhum commit, push ou deploy foi feito;
- nenhuma alteração foi feita em `/usr/bin/node`, pnpm ou pacotes do sistema;
- a validação 2.4 foi executada com scripts temporários fora do repositório, removidos ao final;
- os processos de validação iniciados terminaram; não há processos persistentes.

`package.json` e `.nvmrc` já estavam modificados antes do 2.2, com mtimes `2026-11-11 14:48:28` e `2026-11-09 15:57:18`; não foram tocados durante a instalação. O `.nvmrc` contém `24` (com CRLF), e o `package.json` declara `engines.node` como `24.x` e `packageManager` como `pnpm@11.3.0`.

## 16. Validações efetivamente executadas

### 16.1 Inventário local inicial (2.1)

- `node -v` -> `v22.23.4`
- `pnpm -v` dentro do projeto -> `11.3.0`
- `pnpm -v` fora do projeto -> `12.17.0`
- `node -p "process.versions.openssl"` -> `3.6.5`
- `openssl version` -> `3.6.5`
- Fish -> `4.9.3`
- Nenhum gerenciador de versão Node encontrado antes do 2.2.
- Nenhum processo Node/Next/pnpm/tsx em execução.
- `mongod` local preexistente em `127.0.0.1:27017`; nenhuma conexão estabelecida.

### 16.2 Resolução de ambiente sem conexão (2.1, antes do 2.3)

Script temporário fora do repositório, removido após a execução, usando `@next/env` e apenas `resolveMongoDbName`:

| Verificação | Resultado |
|---|---|
| Arquivos carregados | `[".env"]` |
| `MONGODB_URI` presente | sim (valor não impresso) |
| `MONGODB_DB_NAME` presente | não, antes da edição do 2.3 |
| Database efetivo atual | `save-state` (fallback), antes da edição |
| Simulação com `MONGODB_DB_NAME=save-state-dev` | `save-state-dev` |
| Vercel sem nome explícito | erro esperado de `MONGODB_DB_NAME is required` |
| Conexão MongoDB | nenhuma |

Essa resolução não foi reexecutada no CHECKPOINT 2.3. A resolução efetiva após a edição foi validada no CHECKPOINT 2.4; o resultado está na seção 16.6.

### 16.3 Node.js 24 — instalação e integridade

| Verificação | Resultado |
|---|---|
| Checksum do `fnm-linux.zip` | igual ao digest oficial `sha256:7807664f...a224` |
| `fnm --version` | `1.39.0` |
| SHA-256 do binário `fnm` | `2b8810b...8966f` |
| Checksum do tarball Node 24.22.2 | igual ao `SHASUMS256.txt` oficial: `48cc0e21...af75` |
| SHA-256 do `bin/node` oficial | `904a6d34...c32a52` |
| SHA-256 do `bin/node` instalado pelo `fnm` | idêntico ao oficial: `904a6d34...c32a52` |
| Node no Save State | `v24.22.2` |
| OpenSSL no Node 24 | `3.5.9` |
| npm no Node 24 | `11.19.1` |
| npx no Node 24 | `11.19.1` |
| Node do sistema | `v22.23.4`; OpenSSL `3.6.5`; npm `12.2.2` |
| pnpm no projeto | `11.3.0` |
| pnpm fora do projeto | `12.17.0` |
| `pnpm exec node -v` | `v24.22.2` |
| `pnpm exec node -p "process.versions.openssl"` | `3.5.9` |
| `fnm current` no Save State | `v24.22.2` |
| `fnm default` | `system` |
| Fish em `/tmp` | `/usr/bin/node` `v22.23.4`; `fnm current` = `none` |
| Fish no projeto `sniper` | `/usr/bin/node` `v22.23.4` |
| Fish no Save State | `v24.22.2` via `.nvmrc` |
| Hooks `fnm env` no Fish | `1` (sem duplicação) |
| `sudo` usado | não |
| Pacotes do sistema alterados | não |

O `.nvmrc` existente foi usado sem edição. O `fnm use` sem argumento no diretório do projeto selecionou `v24.22.2`. O `fnm default system` preservou o Node do sistema fora do projeto.

### 16.4 Integridade do repositório e processos

| Verificação | Resultado |
|---|---|
| `git status --short` antes do documento | `475` linhas: `440` modificados e `35` não rastreados |
| `git status --short` após 2.2 e 2.3 | `476` linhas: `440` modificados e `36` não rastreados |
| Novo arquivo não rastreado | `docs/DB_LOCAL_07_GATE2_LINUX_CONFIGURATION.md` |
| `git diff --check` | exit `2`, `75.858` linhas preexistentes |
| `git diff --no-index --check` do novo documento | sem linhas de diagnóstico |
| `.env` | tamanho `426`, mtime `2026-11-12 11:08:14`; alterado somente no 2.3 |
| `pnpm-lock.yaml` | tamanho `245026`, mtime `2026-11-09 17:34:50`, inalterado |
| `package.json` | mtime `2026-11-11 14:48:28`, preexistente; não tocado nos 2.2/2.3 |
| `.nvmrc` | mtime `2026-11-09 15:57:18`, preexistente; não tocado nos 2.2/2.3 |
| Processos Node/Next/pnpm/tsx do projeto | nenhum |
| Multishells temporários do `fnm` | limpos; nenhum restante |
| Sockets 27017 estabelecidos | nenhum |
| Download temporário | removido de `/tmp/opencode` |

O total de `git status` permaneceu em `476` após a instalação e após a edição do `.env` (que é ignorado). As modificações em `package.json` e `.nvmrc` já existiam antes do 2.2; nenhum arquivo de código do projeto foi alterado.

### 16.5 Configuração do `.env` (2.3)

| Verificação | Resultado |
|---|---|
| Definições de `MONGODB_DB_NAME` antes | `0` |
| Definições de `MONGODB_DB_NAME` após | `1` |
| Definições após, case-insensitive | `1` |
| Valor esperado | sim, `save-state-dev` |
| Tamanho antes / depois | `394` / `426` bytes |
| Tamanho esperado após append | `426` bytes |
| Prefixo original preservado | sim, hash idêntico |
| Inode preservado | sim |
| Modo preservado | sim, `755` |
| Proprietário preservado | sim, `revi:revi` |
| `MONGODB_URI` antes / depois | `1` / `1` definição |
| `authSource` antes / depois | ausente / ausente |
| Último byte antes / depois | `0x42` / `0x0A` |
| Newlines antes / depois | `7` / `9` |
| `.env` ignorado pelo Git | sim, `.gitignore:9` |
| Segredos impressos | nenhum |
| Conexão MongoDB | nenhuma |

### 16.6 Resolução efetiva (2.4)

| Verificação | Resultado |
|---|---|
| Runtime usado | Node `v24.22.2` |
| `MONGODB_DB_NAME` no shell antes | ausente em Bash e Fish; `shell_pre_set=false` |
| `@next/env` — arquivos carregados | `[".env"]` |
| `scripts/load-local-env.ts` — arquivos | `.env`; `.env.local` ausente; `.env.development.local` ausente |
| `@next/env` + `resolveMongoDbName` | `save-state-dev` |
| `scripts/load-local-env.ts` + `resolveMongoDbName` | `save-state-dev` |
| Valor esperado em ambos | sim |
| `MONGODB_URI` presente | sim; valor não impresso |
| `authSource` na URI | ausente; valor não impresso |
| `connectDatabase` / `mongoose.connect` / `MongoClient` | não executados |
| Conexão MongoDB | nenhuma |
| Processos e sockets remanescentes | nenhum |
| Scripts temporários | removidos |

Os dois caminhos de carregamento produziram a mesma resolução. Nenhum segredo foi impresso e nenhuma conexão com o Atlas foi aberta.

## 17. Estado final

**GATE 2 CONCLUÍDO NO ESCOPO LOCAL.**

Os CHECKPOINTS 2.1, 2.2, 2.3 e 2.4 foram concluídos:

- o Node.js `24.22.2` está instalado e ativo no contexto do Save State via `fnm`;
- o Node.js `22.23.4` do sistema continua em `/usr/bin/node`;
- o `fnm 1.39.0` está em `~/.local/bin/fnm`;
- o hook do Fish está em `~/.config/fish/conf.d/fnm.fish`;
- o `fnm default` é `system`, preservando outros projetos;
- `pnpm` continua em `11.3.0` dentro do projeto e `12.17.0` fora;
- o lockfile e os arquivos de código do projeto não foram alterados;
- o `.env` recebeu uma única linha: `MONGODB_DB_NAME=save-state-dev`;
- o conteúdo anterior do `.env`, o inode, o modo e o proprietário foram preservados;
- `MONGODB_URI` e a ausência de `authSource` foram preservados;
- `@next/env` e `scripts/load-local-env.ts` resolveram `save-state-dev`;
- nenhuma conexão MongoDB foi aberta;
- nenhum recurso Atlas foi criado ou modificado;
- nenhum script de índice, seed ou migração foi executado;
- nenhum processo persistente do projeto ficou pendente.

O proprietário informou que o database `save-state-dev` foi criado no **Cluster0**. Durante os CHECKPOINTS 2.1–2.4, nenhuma conexão ao Atlas foi feita. A verificação remota autorizada posteriormente está registrada na seção 19.

## 18. Próximo passo seguro

A verificação remota read-only foi concluída. O provisionamento do GATE 3 não foi iniciado. Qualquer criação/alteração de coleções, índices, usuários ou permissões exigirá autorização específica e não deve ser executada como continuação automática deste GATE.

Nenhuma escrita, alteração de permissões, Vercel, build, teste, commit, push ou deploy foi executada.

## 19. Verificação remota autorizada (pós-GATE 2)

O proprietário autorizou a verificação da existência e da validação do database `save-state-dev` no MongoDB Atlas, Cluster0.

### 19.1 Escopo executado

- conexão remota **read-only** com a URI já existente no `.env`;
- carregamento do `.env` por `scripts/load-local-env.ts`;
- resolução por `resolveMongoDbName`, sem chamar `connectDatabase()`;
- uso de `MongoClient` da versão `6.20.0` **sem** `dbName` e **sem** path de database na URI;
- seleção explícita do database com `client.db("save-state-dev")`;
- comandos somente de leitura: `ping`, `hello`, `listDatabases`, `listCollections`, `listIndexes` e `dbStats`;
- nenhuma leitura de documentos, escrita, criação de coleção/índice, mudança de usuário/role ou operação de seed/migração.

### 19.2 Resultados

| Verificação | Resultado |
|---|---|
| Runtime | Node `v24.22.2` |
| `MONGODB_DB_NAME` no shell antes | ausente |
| URI | SRV, host Atlas contendo `cluster0`, sem `authSource` explícito, sem path de database |
| Conexão autenticada | sim |
| Database selecionado | `save-state-dev` |
| `ping` | `ok: 1` |
| `hello` | primário gravável; replica set com 3 hosts |
| `listDatabases` | autorizado; 5 databases visíveis |
| `save-state-dev` na lista | presente |
| Existência | confirmada via `listDatabases` |
| Coleções visíveis | 1: `teste` |
| Documentos em `save-state-dev` | 0 (`dbStats.objects: 0`) |
| Índices | 1: `_id_` |
| `dataSize` / `storageSize` | `0` / `4096` |
| `save-state` (fallback) | existe; não foi acessado |
| `test` (default do driver) | ausente |
| Segredos/URI impressos | nenhum |
| `.env` alterado | não |
| Escritas realizadas | nenhuma |
| Processos/sockets residuais | nenhum |
| Script temporário | removido |

### 19.3 Interpretação

- `save-state-dev` existe no Atlas e a credencial atual consegue autenticar e ler seus metadados.
- A conexão foi feita sem `authSource` explícito e sem `dbName` no `MongoClient`; o driver manteve o source implícito `admin`, e a autenticação funcionou nesse modo.
- O database está praticamente vazio: contém apenas a coleção `teste`, sem documentos, com o índice `_id_`.
- Os 33 índices da aplicação não estão presentes; isso é consistente com o provisionamento do GATE 3 ainda não iniciado.
- A coleção `teste` não foi encontrada em referências do repositório e aparenta ser um artefato de teste. Ela não foi removida.
- O database `save-state` também existe. Ele não foi acessado e não deve ser usado como destino de desenvolvimento.
- A credencial conseguiu listar databases, indicando visibilidade ampla. Usuário e roles exatos não foram auditados nesta verificação.
- Nenhuma escrita, criação, alteração ou remoção foi realizada.

A verificação confirma a existência e a acessibilidade read-only do alvo, mas **não** homologa permissões de runtime, isolamento, índices da aplicação ou prontidão para seed.

**STATUS FINAL: GATE 2 CONCLUÍDO; VERIFICAÇÃO REMOTA READ-ONLY CONCLUÍDA; PROVISIONAMENTO DO GATE 3 NÃO INICIADO.**
