# Save State — Ajustes globais finais de UI (submenu + tabela)

**Data:** 15/11/2026
**Worktree:** `/home/heric/Documents/Projects/The Save State Project/AGORA_VAI/save-state-rc03-integration`
**Branch:** `integration/rc03-git-reconciliation` — HEAD `4998ec2` (igual a `origin/main`)
**Escopo:** tipografia dos submenus, layout da tabela compartilhada e remoção da coluna Ações/Detalhes.
**Não executado:** commit, push, merge, rebase, deploy, migrations, seeds, alteração de `.env`/credenciais ou da worktree principal.

---

## 1. Causa raiz de cada problema

### 1.1 Fonte pequena nos submenus

A navegação lateral (desktop e mobile) aplica `zoom: 80%` em `<nav>`. Os rótulos internos dos submenus usavam `text-sm` (14px), que renderizavam a ~11,2px efetivos. Os nomes de coleção tinham o mesmo problema, e o abridor de grupo usava `!text-xs` (12px → ~9,6px).

A regressão tipográfica RC03.1 (uso de `font-display` nos itens internos) já estava corrigida; o problema restante era puramente de **tamanho**, não de família.

### 1.2 Colunas desalinhadas na tabela

Duas causas independentes se somavam:

1. **Cromo incompatível entre cabeçalho e linhas.** Cabeçalho usa `rpgui-container framed-golden` (borda de 15px + padding de 12px) e cada linha usa `framed-grey` (borda de 7px + padding de 5px). Como cabeçalho e linhas são grids independentes, essa diferença de 20px por lado deslocava o início/fim das colunas.
2. **Tracks `auto` resolvidas por elemento.** Mesmo com a mesma largura de conteúdo, colunas `auto` são dimensionadas pelo conteúdo **de cada grid**. O cabeçalho "Favorito" (~67px) e a célula "★" (~8px) geravam distribuições diferentes das colunas `fr`, então os templates computados nunca coincidiam.

### 1.3 Conteúdo truncado / "solto"

As células de nome, plataforma e gêneros usavam `truncate` (ellipsis em uma linha). Isso impedia a quebra de linha e fazia o texto parecer truncado, contrariando o comportamento esperado de tabela.

### 1.4 Coluna Ações/Detalhes redundante

A linha inteira já abre o modal de detalhes (`DataTableRow` com `onActivate`), mas a última coluna repetia essa ação com um botão "Detalhes".

---

## 2. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `app/globals.css` | Nova regra `.rpgui-data-table-frame` normalizando borda/padding de cabeçalho e linhas |
| `features/games/data-table.tsx` | Classe de frame compartilhada; células com quebra de linha por padrão |
| `features/games/backlog-table-row.tsx` | Grid sem `auto`, coluna Ações removida, botão Detalhes removido, `truncate` removido |
| `features/atp/catalog-table-row.tsx` | Grid sem `auto`, `truncate` removido, coluna de importação com largura fixa |
| `features/navigation/nav-item.tsx` | Rótulos internos de submenu `text-sm` → `text-lg`; abridor de grupo `!text-xs` → `!text-sm` |
| `features/navigation/collection-nav-items.tsx` | Nome de coleção `text-sm` → `text-base`; botão de opções `text-lg` |
| `tests/games/data-table.test.ts` | Contratos atualizados + regressões de frame, wrap e ausência de `auto` |
| `tests/games/backlog-table-row.test.tsx` | **Novo** teste de DOM: sem Ações/Detalhes, clique/Enter/Space, grid compartilhado |
| `tests/navigation/submenu-typography.test.tsx` | Tamanhos atualizados + caso explícito de fonte maior |

Nenhum outro arquivo foi modificado. Nenhuma dependência foi instalada.

---

## 3. Estratégia adotada para submenu

- **Itens internos de submenu** (links e ação "Nova Coleção"): `text-lg` (18px). Como são renderizados dentro do `zoom: 80%`, o tamanho visual efetivo sobe de ~11,2px para ~14,4px.
- **Nomes de coleção**: `text-base` (16px), mantendo `whitespace-normal`, `[overflow-wrap:anywhere]`, `<wbr>` após `_` e quebra natural em hífens. A quebra em underscores foi preservada.
- **Contador `[n]`**: permanece `text-sm` com `font-display` e `text-white/70` — continua visualmente distinto do nome.
- **Botão de opções `⋯`**: `text-lg` com `leading-none`.
- **Abridor de grupo**: `!text-sm` (14px), mantendo o skin `.rpgui-button` e a fonte de títulos (`--font-display-name`), preservando a hierarquia título → item.
- **Fonte**: nenhum item interno recebeu `font-display`; a regressão RC03.1 não foi reintroduzida. Títulos de página e abridores de grupo continuam na fonte de títulos.

Desktop e mobile compartilham `NavItem`, então a correção vale para ambos automaticamente.

---

## 4. Estratégia adotada para tabela

1. **Frame compartilhado**: cabeçalho e linhas receberam `rpgui-data-table-frame`. A regra em `app/globals.css` usa especificidade maior que a do CSS vendorizado (importado depois) para igualar borda (7px) e padding (8px 12px) nas duas variantes, sem `!important`.
2. **Tracks sem conteúdo**: todos os `auto` foram substituídos por `minmax(0, …fr)` (backlog) e por proporções + largura fixa de `13rem` para a coluna de importação do catálogo. Assim o template é função apenas da largura do container, idêntico entre cabeçalho e linhas.
3. **Quebra de linha**: `DataTableCell`/`DataTableHeaderCell` agora aplicam `whitespace-normal` e `[overflow-wrap:anywhere]`; os `truncate` foram removidos. Palavras comuns quebram em espaços/hífens; tokens excepcionais (underscores, nomes colados) quebram quando necessário.
4. **Altura natural**: as linhas crescem com o conteúdo (`items-center` mantém alinhamento vertical coerente) e as demais células acompanham a linha mais alta.
5. **Responsividade**: `min-width` e `overflow-x-auto` preservados; mobile continua tabular (nunca vira cards).

---

## 5. Remoção da coluna "Ações"

- Removidos o cabeçalho `Ações`, a célula correspondente, o botão `Detalhes` e o import de `RPGUIButton` de `backlog-table-row.tsx`.
- Grids rebalanceados: mobile `Jogo + Status + Favorito`; md `Jogo + Plataforma + Status + Horas + Nota + Favorito`.
- A ativação da linha foi preservada: `onActivate={onDetails}`, `tabIndex=0`, clique, `Enter` e `Espaço`, com `focus-visible` e hover intactos.
- A tabela de backlog é a mesma usada por **Backlog e Coleções**, então a remoção vale para as duas telas.
- **Decisão de escopo**: a coluna final do **catálogo** é "Ação/Adicionar" (importar para o backlog), não "Ações/Detalhes". Ela não é redundante com o clique na linha e removê-la eliminaria uma funcionalidade. Portanto foi mantida e apenas rebalanceada. As ocorrências restantes de "Detalhes" no app estão em cards/listas (fora da tabela) e não foram tocadas.

---

## 6. Impacto global das mudanças

- **Submenus**: navegação lateral desktop e mobile, além do submenu de coleções do usuário, em todas as telas.
- **Tabela**: visualização em tabela compartilhada (`DataTable`) usada por Backlog, Coleções e Catálogo.
- **Não afetado**: visualização em grid, listas legadas, cards, modais, menus de contexto, autenticação, regras de negócio, API e banco.
- A identidade RPGUI foi preservada: molduras golden/grey, sprites, sombras e fontes de título continuam iguais.

---

## 7. Testes executados

| Verificação | Comando | Resultado |
|---|---|---|
| TypeScript | `pnpm typecheck` | **sucesso** (exit 0, após remover `.next` gerado pela validação visual) |
| ESLint direcionado | `eslint` nos arquivos alterados e testes | **0 erros** (apenas aviso de CSS sem config, esperado) |
| Testes direcionados | `vitest run tests/games tests/navigation tests/collections tests/atp` | **20 arquivos / 323 testes aprovados** |
| Novos testes | `vitest run tests/games/data-table.test.ts tests/games/backlog-table-row.test.tsx tests/navigation/submenu-typography.test.tsx` | **27 testes aprovados** |
| Suíte completa | `pnpm test` | **120 arquivos / 1.428 testes aprovados** |
| Build de produção | `pnpm build` | **sucesso** ("Compiled successfully in 15.7s") |

Cobertura nova/ajustada:

- ausência de `Ações`/`Detalhes` e de `<button>` no DOM da linha de backlog;
- abertura de detalhes por clique, `Enter` e `Espaço`;
- cabeçalho e linha usando o mesmo template e a mesma classe de frame;
- proibição de tracks `auto` nos templates das tabelas;
- células com `whitespace-normal`/`[overflow-wrap:anywhere]` e sem `truncate`;
- submenu em `text-lg` sem `font-display`, abridor de grupo em `!text-sm` com fonte display, coleções em `text-base` com `<wbr>`.

---

## 8. Validação visual realizada

Foi criada uma rota temporária `/ui-preview` (removida ao final) renderizando os componentes reais com dados de teste, servida por `next dev` e inspecionada com Playwright/Chrome em 1440×1100 e 420×900.

Medições no DOM computado (desktop 1440px):

| Item | Antes | Depois |
|---|---|---|
| Fonte do item de submenu | 14px (→ ~11,2px com zoom) | **18px (→ ~14,4px)** |
| Fonte do nome de coleção | 14px | **16px** |
| Abridor de grupo | 12px | **14px** |
| Template header vs. linha (backlog) | divergentes | **idênticos**: `331.422px 151.906px 151.906px 82.859px 82.844px 69.063px` |
| Template header vs. linha (catálogo) | divergentes | **idênticos**: `297.766px 99.266px 136.484px 136.484px 208px` |
| Alinhamento esquerdo header/linha | — | **mesmo `left` (468px) e mesma largura (948px)** |
| Nome longo | truncado em 1 linha | **3 linhas** (57,75px de altura, `line-height` 19,25px) |
| Texto "Ações"/"Detalhes" na tabela | presente | **ausente** |
| Clique na linha | abre detalhes | **abre detalhes** (contador 0 → 1) |
| Clique na linha do catálogo | abre detalhes | **abre detalhes** (contador 1 → 2) |

Capturas geradas durante a validação (fora do repositório):

- `/tmp/opencode/rc03/ui-preview-desktop.png`
- `/tmp/opencode/rc03/ui-preview-mobile.png`

Confirmação visual: submenu nitidamente maior na fonte de texto, abridor de grupo em fonte display, nomes de coleção quebrando em underscores sem cortar palavras comuns, colunas alinhadas, cabeçalho correspondendo às células, linhas com altura natural, coluna Ações ausente e botão "Adicionar" do catálogo legível.

Observação: o `next dev` registrou um aviso de hydration mismatch nas `data-*` de fonte/layout, causado pelo script de inicialização pré-paint já existente — não é consequência destas mudanças e não aparece como erro de build.

---

## 9. Riscos remanescentes

1. A coluna de importação do catálogo usa largura fixa `13rem` para caber o botão RPGUI (`min-width: 140px` + padding). Um rótulo localizado muito mais longo que "Adicionar"/"Importando…" pode exigir reajuste.
2. Em viewports estreitos a tabela continua rolando horizontalmente por design (`min-w`); não há conversão para cards.
3. O catálogo mantém a coluna "Ação/Adicionar" por ser uma ação funcional distinta; se o produto quiser remover também essa ação da tabela, deve ser um ajuste separado.
4. A validação visual usou uma rota temporária com dados mockados; E2E autenticado segue indisponível por falta de `E2E_MONGODB_URI`.
5. O aviso de hydration do script de fontes é pré-existente e fora do escopo.

---

## 10. Veredito final

**Confirmado:** os submenus estão claramente mais legíveis, usam a fonte padrão de texto e mantêm a hierarquia com títulos/abridores de grupo, sem reintroduzir a regressão tipográfica.

**Confirmado:** a tabela compartilhada agora alinha cabeçalho e células (mesmo template e mesmo cromo), permite quebra de linha, cresce em altura conforme o conteúdo e continua responsiva com overflow horizontal apenas quando necessário.

**Confirmado:** a coluna "Ações/Detalhes" foi removida da tabela de backlog/coleções, e clicar/teclar na linha continua abrindo os detalhes; o botão "Adicionar" do catálogo foi preservado por ser uma ação distinta.

**Confirmado:** TypeScript, ESLint, 1.428 testes e build de produção passaram, e houve validação visual real em desktop e mobile.

**Veredito:** os três ajustes estão concluídos e prontos para revisão. Nenhum commit, push, merge, rebase ou deploy foi executado; a worktree principal (HEAD `9886ca9`, 302 modificados e 4 não rastreados) permaneceu intacta.
