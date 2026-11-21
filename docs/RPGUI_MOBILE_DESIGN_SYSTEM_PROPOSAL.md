# RPGUI Mobile — Proposta de design system

**Documento:** MOBILE-02 / arquitetura de design system
**Natureza:** proposta técnica e visual, sem alteração de componentes de produção.
**Referência visual autoritativa:** `save-state-mobile-fixes.pdf` (8 páginas; 7 com conteúdo e a última em branco).
**Protótipos:** `docs/prototypes/rpgui-mobile/` (HTML/CSS estáticos, isolados).
**Commit de referência:** `8e421fd` (`fix(mobile): use dynamic viewport height for app shell`).
**Data:** 20 de novembro de 2026.

---

## 1. Resumo executivo

O problema mobile do Save State não é apenas “faltam media queries”. A auditoria estática encontrou três causas estruturais que atravessam páginas diferentes:

1. **Geometria vendorizada inadequada.** `.rpgui-button` tem `min-width: 140px`, `height: 60px` e `35px` de padding lateral; `.rpgui-container.framed` e `.framed-golden` usam `15px` de borda mais `12px` de padding. Em um viewport de 320 px, a área útil dentro de uma moldura cai para **266 px**, e um botão padrão isolado ocupa mais da metade disso.
2. **Hierarquia visual invertida.** Controles, filtros e ações recebem a mesma moldura ornamentada do conteúdo principal. Em telas pequenas, a soma de bordas, paddings e sprites reduz o espaço de leitura e faz o botão parecer maior do que o campo que ele acompanha.
3. **Interação dependente de mouse.** O menu de contexto é aberto apenas por `onContextMenu`; não existe botão explícito de ações nem tratamento de toque. Em navegadores móveis, o clique longo não é um contrato confiável.

A proposta separa **identidade** de **leitura**, **alvo de toque** de **placa pintada** e **conteúdo** de **ornamento**. O desktop continua com a experiência RPGUI completa; o mobile preserva a mesma linguagem visual, mas com menos molduras, tipografia mais legível e ações explícitas.

**Regra central:** nenhum controle mobile pode ter alvo de toque menor que 44 × 44 px, mesmo quando o desenho visível for menor.

---

## 2. Problema e objetivo

### 2.1 Problema observado

O PDF do proprietário registra, entre outros:

- título de boas-vindas truncado e grande demais;
- barra de busca curta com botão longo cobrindo conteúdo;
- molduras ocupando espaço excessivo no feed;
- botões de filtro e de ação grandes e desalinhados;
- botões “Adicionar” gigantes na coluna da tabela;
- formulário e modais com bordas que desperdiçam largura;
- review que não cria rascunho no celular;
- botão “Criar” de coleções que não responde;
- Top 10 com fontes, ícones e containers grandes demais;
- menu mobile sem backdrop, com botão “Fechar” abaixo de outros elementos e sem título/logout.

### 2.2 Objetivo

Definir um conjunto pequeno e explícito de decisões que permita corrigir esses problemas sem:

- redesenhar o produto;
- substituir o RPGUI;
- alterar o comportamento de domínio;
- aumentar o escopo da migração;
- criar um “tema mobile” paralelo e divergente.

### 2.3 Resultado esperado

- Uma única escala tipográfica com papéis claros.
- Uma família de botões com tamanho visual e alvo de toque independentes.
- Uma hierarquia de containers com no máximo um nível de moldura por região.
- Ações de contexto acessíveis por toque.
- Componentes e páginas capazes de operar em 320 px sem overflow horizontal não intencional.

---

## 3. Escopo e não-objetivos

### 3.1 Dentro do escopo

- Tokens de tipografia, espaço, cor, raio, sombra e camadas.
- Variantes de botão, container, campo, lista e tabela.
- Regras de composição para Home, Atividade, Busca Geral, Backlog, Coleções, Top 10, formulários e modais.
- Acessibilidade de toque, foco, contraste e zoom.
- Estratégia de adoção incremental e critérios de aceitação.

### 3.2 Fora do escopo

- Alterar `app/globals.css` ou `styles/vendor/rpgui/rpgui.css` nesta entrega.
- Alterar páginas, componentes, rotas, API, schema, banco ou autenticação.
- Substituir Press Start 2P globalmente.
- Redesenhar o RPGUI ou modernizar seus sprites.
- Implementar funcionalidades novas (favoritos, recomendações, novos status).
- Criar um tema claro.
- Publicar, commitar ou instalar dependências.

### 3.3 Limite dos protótipos

Os arquivos em `docs/prototypes/rpgui-mobile/` são documentação executável. Eles não são importados pelo aplicativo, não usam `"use client"`, não criam rotas e não alteram os sprites vendorizados. Qualquer promoção para produção exige uma fase de implementação separada.

---

## 4. Princípios de design

1. **Conteúdo antes de ornamento.** Em mobile, a moldura não pode competir com o texto. Moldura é hierarquia, não decoração padrão.
2. **Identidade não é corpo de texto.** Press Start 2P assina a marca; JetBrains Mono carrega a leitura.
3. **Alvo de toque é contrato.** O mínimo é 44 × 44 px, independentemente do tamanho pintado.
4. **Uma ação, um caminho explícito.** Nenhuma ação essencial pode depender de clique longo, hover ou botão direito.
5. **Densidade sem compressão ilegível.** Reduzir padding e moldura, nunca a fonte de input abaixo de 16 px no mobile.
6. **Desktop não é penalizado.** As variantes mobile são condicionais; a geometria desktop permanece.
7. **Progressividade.** Filtros e detalhes avançados podem ficar em disclosure; a ação primária e o estado atual ficam visíveis.
8. **Consistência entre páginas.** A mesma ação usa o mesmo componente, ícone e rótulo acessível em Home, Backlog e Catálogo.

---

## 5. Arquitetura de tokens

Os tokens abaixo são a proposta conceitual. Os valores já estão materializados em `docs/prototypes/rpgui-mobile/mobile.css` e foram medidos nos seis viewports de teste.

### 5.1 Tipografia

| Token | Valor | Uso |
|---|---|---|
| `--ss-font-body` | JetBrains Mono, monospace | corpo, labels, inputs, metadados, botões |
| `--ss-font-title` | JetBrains Mono, bold | títulos de seção, nomes de jogo, cabeçalhos |
| `--ss-font-pixel` | Press Start 2P, monospace | marca, logo, eyebrow, título decorativo curto |
| `--ss-text-body` | `0.875rem` (14 px) | texto corrido |
| `--ss-text-small` | `0.75rem` (12 px) | metadados e legendas |
| `--ss-title-h1` | `clamp(1.15rem, 5.5vw, 1.5rem)` | título de página |
| `--ss-title-h2` | `clamp(1rem, 4.4vw, 1.25rem)` | título de seção |
| `--ss-title-h3` | `clamp(0.9375rem, 4vw, 1.0625rem)` | subtítulo |
| input mobile | `16px` fixo | evita zoom automático no iOS |

### 5.2 Espaço e alvo

| Token | Valor | Uso |
|---|---|---|
| `--ss-space-1` | 4 px | separação interna mínima |
| `--ss-space-2` | 8 px | gap entre controles |
| `--ss-space-3` | 12 px | padding de painel compacto |
| `--ss-space-4` | 16 px | padding padrão |
| `--ss-space-5` | 24 px | separação entre seções |
| `--ss-touch` | 44 px | alvo mínimo de toque |
| `--ss-radius` | 4 px | raio de painel/chip |

### 5.3 Cor e superfície

| Token | Valor | Uso |
|---|---|---|
| `--ss-bg` | `#0e0f11` | fundo da aplicação |
| `--ss-bg-2` | `#15171a` | fundo secundário |
| `--ss-surface` | `#1e2022` | painel padrão |
| `--ss-surface-2` | `#26282b` | painel elevado |
| `--ss-line` | `rgba(255,255,255,.14)` | divisor e borda sutil |
| `--ss-line-strong` | `rgba(255,255,255,.28)` | borda de botão secundário |
| `--ss-text` | `#f4efe4` | texto principal |
| `--ss-text-2` | `#cfc7b8` | texto secundário |
| `--ss-text-3` | `#9f988c` | metadado |
| `--ss-gold` | `#e3b341` | destaque e link |
| `--ss-gold-strong` | `#fbbf24` | foco e estado ativo |
| `--ss-danger` | `#e36b6b` | ação destrutiva |

Contraste: texto principal e secundário sobre `--ss-surface` permanecem acima de 4.5:1; metadados em `--ss-text-3` são usados apenas para informação auxiliar, nunca para a única indicação de estado.

### 5.4 Camadas

| Camada | Uso |
|---|---|
| conteúdo | fluxo normal |
| sticky header | cabeçalho de página/tabela |
| `z-20` | painel de navegação mobile |
| `z-30` | conteúdo interno do painel |
| backdrop | imediatamente abaixo do painel |
| botão fechar | acima do painel e do backdrop |
| menu de contexto / modal | acima de tudo, com foco preso |

A regra é explícita: **o botão “Fechar” do menu não pode compartilhar a mesma camada dos botões de navegação**.

---

## 6. Tipografia

### 6.1 Papéis

O aplicativo já expõe preferências de fonte (`data-font-display`, `data-font-body`) com valores como `press-start-2p`, `jetbrains-mono` e `roboto`. A proposta **não substitui** essas preferências em silêncio.

São propostos três papéis semânticos:

| Papel | Fonte | Onde |
|---|---|---|
| Identidade | Press Start 2P | logo “SAVE STATE”, eyebrow, título de menu principal, no máximo 1–3 palavras |
| Título | JetBrains Mono bold | `h1`–`h3`, nome de página, nome de jogo, cabeçalho de seção |
| Corpo | JetBrains Mono regular | parágrafos, labels, metadados, botões, inputs |

### 6.2 Regras

- Press Start 2P **nunca** é usada em parágrafo, label, botão de formulário ou tabela.
- Press Start 2P em mobile fica em `10px`–`12px`, com `line-height` ≥ 1.6 e `letter-spacing` discreto.
- Título de página que contenha nome de usuário usa JetBrains Mono, no máximo 2 linhas, com quebra por palavra e `overflow-wrap: anywhere`.
- Títulos de seção não usam `text-2xl` fixo em mobile; usam o clamp de `h1`/`h2`.
- Metadados usam 12 px e não recebem `text-shadow` pesado.
- Nenhum texto essencial é truncado com `text-overflow: ellipsis` sem `title` ou linha alternativa acessível.

### 6.3 Preferências existentes e limite desta fase

Não criar a preferência **Automático** nesta fase. Não alterar os valores atualmente suportados por `fontDisplay` e `fontBody`, seus valores persistidos, nem a forma como as configurações são aplicadas.

O protótipo apresenta estilos como alternativas visuais estáticas; não simula nem substitui as preferências persistidas. Na futura integração, a regra exata de precedência entre papel tipográfico mobile e preferência explícita deve ser aprovada antes de implementar tokens que possam deixar a preferência inoperante.

### 6.4 Evidência nos protótipos

`typography.html` compara:

- Press Start 2P em título longo (problema);
- JetBrains Mono no mesmo título (proposta);
- escala completa de `h1`–`h3`, corpo, metadado e input;
- comportamento em 320, 360, 390, 412, 768 e 1366 px.

---

## 7. Sistema de botões

### 7.1 Família

| Variante | Aparência | Uso |
|---|---|---|
| `golden` | placa dourada, sem ornamentos laterais no mobile | ação primária |
| `secondary` | fundo translúcido, borda 1 px | ação secundária densa |
| `ghost` | sem fundo, texto secundário | ação terciária, “Limpar” |
| `danger` | texto/ação destrutiva | excluir, remover |
| `icon` | 44 × 44 px, sem rótulo visual | ação compacta com `aria-label` |

### 7.2 Tamanhos

O sistema separa quatro grandezas que o CSS atual confunde:

| Grandeza | Token/valor | Regra |
|---|---|---|
| alvo de toque | `--ss-touch: 44px` | nunca reduzir |
| placa pintada | comparar 28/32/36/40 px | experimental; não é requisito final |
| padding decorativo | 16 px horizontal | não define o alvo |
| fonte do rótulo | 13 px | legível, não decorativa |
| ícone | 17 px | centralizado, `aria-hidden` quando decorativo |

Um botão `icon` tem 44 × 44 px de alvo; um botão textual tem no mínimo 44 px de altura e padding horizontal de 16 px. O texto pode ser substituído por ícone somente quando houver `aria-label` e `title`.

### 7.3 Estados

- **hover:** troca o sprite dourado ou clareia o secundário; nunca desloca o layout.
- **active:** deslocamento de 1 px no máximo.
- **focus-visible:** contorno de 2 px em `--ss-gold-strong`, offset de 2 px.
- **disabled:** opacidade 0.5, dessaturação, `cursor: not-allowed`; não remove o alvo do fluxo.
- **busy:** mantém a largura, troca o rótulo por “Salvando…”/“Criando…” e usa `aria-busy`.

### 7.4 Regra de não regressão

O botão desktop continua usando `.rpgui-button` com `140 × 60` e ornamentos. As variantes compactas são opt-in por classe ou por breakpoint, não uma reescrita global do vendor.

---

## 8. Botão golden compacto

Esta é a decisão mais sensível do PDF e precisa ser registrada sem ambiguidade.

### 8.1 Requisito

Reutilizar os assets existentes (`button-golden.png`, `button-golden-hover.png`, `button-golden-down.png`) e reduzir o botão sem:

- perder a identidade dourada;
- reduzir o alvo de toque;
- esmagar o texto;
- criar um novo sprite;
- manter os ornamentos laterais que empurram o layout.

### 8.2 Especificação

| Propriedade | Valor |
|---|---|
| alvo | 44 px de altura; largura mínima de 44 px para ícone |
| placa | `button-golden.png` centralizado; comparar `background-size` vertical de 28/32/36/40 px |
| padding horizontal | 16 px (12 px em contexto muito denso) |
| fonte | 13 px JetBrains Mono bold |
| ícone | 17 px |
| ornamentos | removidos no mobile; `::before`/`::after` não são usados |
| hover/active | `button-golden-hover.png` / `button-golden-down.png` |
| cantos | a própria imagem; sem borda CSS adicional |

As amostras de 28/32/36/40 px **pintados** permanecem dentro de um alvo de pelo menos 44 px **tocáveis**. Os tamanhos são exploratórios: escolher a placa após comparação de legibilidade, proporção, pixel density e aprovação visual. Nenhum tamanho pintado é requisito definitivo nesta fase.

### 8.3 Comparação com o legado

O legado usa:

- `min-width: 140px`;
- `height: 60px`;
- `padding: 5px 35px`;
- ornamentos de 34 × 110% em `left: -46px` e `right: -46px`.

Em 320 px, o botão legado ocupa 140 px e os ornamentos pintam 46 px para fora de cada lado, o que explica overflow e sobreposição. O protótipo `buttons.html` reproduz o legado apenas para comparação e demonstra a versão compacta no mesmo viewport.

### 8.4 O que não fazer

- Não usar `button-golden-left/right` no mobile.
- Não reduzir a fonte para 10 px.
- Não usar `transform: scale()` para encolher o botão; isso reduz o alvo e borra o sprite.
- Não substituir a placa por um gradiente CSS.
- Não usar `width: 100%` em toda ação; isso transforma cada linha em um bloco e destrói a hierarquia.

---

## 9. Containers e hierarquia de superfícies

### 9.1 Níveis

| Nível | Aparência | Exemplo |
|---|---|---|
| 0 — página | fundo da aplicação, sem moldura | `main` |
| 1 — região | `framed`/`framed-golden` somente quando delimita uma região principal | cabeçalho de página, shell |
| 2 — painel | fundo sutil + borda de 1 px | filtros, formulários, feed |
| 3 — item | separador, sem moldura | linha de lista, card de jogo |
| 4 — controle | botão/campo | ação |

**Regra prática:** não aninhar dois níveis 1 ou 2. Se um painel já está dentro de uma região, ele usa separador ou borda de 1 px.

### 9.2 Geometria mobile

| Container | Desktop (vendor) | Mobile proposto |
|---|---|---|
| `framed` / `framed-golden` | 15 px borda + 12 px padding | 8 px borda + 12 px padding |
| `framed-grey` | 7 px borda + 5 px padding | 5 px borda + 8 px padding |
| painel plano | — | 1 px borda + 12 px padding |
| painel compacto | — | 1 px borda + 8 px padding |

Em uma região de 320 px, a área útil passa de **266 px** (moldura atual 15 + 12) para **280 px** com moldura de 8 + 12. Molduras menores ainda recuperam mais espaço: `framed-grey` de 5 + 8 resulta em 294 px; painel plano de 1 + 12, 294 px; sem painel, 320 px. A recomendação é remover molduras em feeds, filtros e itens quando elas não acrescentarem hierarquia — não reduzir todas as bordas de forma indiscriminada.

### 9.3 Onde remover moldura

Segundo o PDF:

- feed de Atividade: remover o quadro grande; usar separadores entre eventos;
- cards de estatística: remover `framed-grey` quando o card já está em uma grade;
- Top 10: trocar `framed` por `framed-grey` ou painel plano;
- Coleções: lista com separador, não um card por coleção;
- formulários: moldura apenas no formulário inteiro, não em cada campo;
- modais: moldura no modal, conteúdo interno plano.

### 9.4 Onde manter

- shell/nav: moldura é identidade e separa navegação de conteúdo;
- cabeçalho de página: uma moldura é aceitável, desde que o título não seja gigante;
- modal: a moldura ajuda a recortar o overlay;
- vazio/erro: um painel é suficiente; não é necessário ouro.

---

## 10. Formulários

### 10.1 Campos

- altura mínima de 44 px;
- fonte de 16 px no mobile;
- label sempre visível, não apenas placeholder;
- `aria-describedby` para erro/ajuda;
- `inputmode` correto (`numeric` para ano, `url` para capa);
- largura total, `min-width: 0`, `max-width: 100%`;
- foco visível de 2 px.

### 10.2 Composição de busca

PDF HOME-01: “barra de input muito curta, botão muito longo; trocar botão por ícone de pesquisa”.

Proposta:

```text
[ campo flexível ........................ ] [ 🔍 44×44 ]
```

- O campo usa `flex: 1 1 auto; min-width: 0`.
- O botão usa 44 × 44 px, `aria-label="Buscar"`, `title="Buscar"`.
- Em ≥ 480 px, o mesmo componente pode exibir o rótulo “Buscar”.
- O botão nunca tem `min-width: 140px` no mobile.

### 10.3 Formulário longo

- Agrupar em seções com `fieldset`/`legend` visuais.
- Não colocar `framed-grey` em cada input.
- Ações primárias no fim do formulário; em modais, barra de ações sticky.
- Evitar `hr` decorativo entre cada campo; usar espaço.
- Erro do formulário no topo, com foco programático e `role="alert"`.

### 10.4 Teclado e zoom

- `font-size: 16px` em inputs evita o zoom automático do iOS.
- `scroll-margin-top` para campos focados sob header sticky.
- `enterkeyhint`/`inputmode` quando aplicável.
- Não usar `user-scalable=no`.

---

## 11. Listas, cards e tabelas

### 11.1 Estratégia

| Largura | Estratégia |
|---|---|
| < 768 px | lista/card; uma linha por jogo; metadados em 2 linhas; ações explícitas |
| ≥ 768 px | tabela completa com todas as colunas |

O PDF afirma explicitamente que os campos da tabela “não acompanham a largura da página” e que o card não é necessário. A proposta não é “fazer a tabela caber” com fonte minúscula; é usar a representação correta por viewport.

### 11.2 Tabela mobile (se mantida)

Quando uma tabela for inevitável:

- região com `overflow-x: auto` e `-webkit-overflow-scrolling: touch`;
- primeira coluna sticky;
- indicador visual de rolagem;
- `min-width` documentado (340 px no Backlog, 600 px no Catálogo);
- nunca esconder a ação primária fora da área visível sem affordance.

### 11.3 Linha de lista

```text
Título do jogo (até 2 linhas)
Status · Plataforma · Nota            [ … ]
```

- Título com `-webkit-line-clamp: 2`.
- Metadados com `flex-wrap`.
- Ação `…` de 44 × 44 px.
- Toque no título abre detalhes; toque em `…` abre menu de contexto.

### 11.4 Top 10

- Posição `#1` em 32 px.
- Título em até 2 linhas.
- Ações em barra separada quando < 480 px, para não esmagar o nome.
- Quatro ações preservadas: abrir, subir, descer, remover.
- Cada ação com 44 × 44 px e `aria-label`.
- Container: painel `framed-grey` ou plano, não `framed` + `framed-grey` aninhados.

---

## 12. Navegação, shell e overlays

### 12.1 Menu mobile

Problemas do PDF MENU-01:

- título/saudação/logout ausentes;
- fonte sem `font-display` pequena demais nos botões;
- clicar fora não fecha;
- botão “Fechar” abaixo de alguns botões (z-index).

Proposta:

1. **Backdrop** cobrindo o restante da tela, com clique para fechar.
2. **Painel** com `aria-hidden`/`inert` quando fechado; foco preso quando aberto.
3. **Botão fechar** em camada acima do painel, 48 × 48 px, no canto superior direito.
4. **Escape** fecha; foco retorna ao gatilho.
5. **Scroll do body** bloqueado enquanto aberto.
6. **Título** “Menu” ou saudação curta + logout no rodapé do painel.
7. **Fonte dos itens** em JetBrains Mono 14 px; não usar `zoom: 80%` para “caber”.
8. **Item ativo** com `aria-current="page"` e marcador dourado discreto.

### 12.2 Header

- Título de página com clamp e no máximo 2 linhas.
- Ações do header com 44 px.
- Não sobrepor o título com o botão de menu; reservar área ou usar layout em duas linhas.
- `padding-top` compatível com `env(safe-area-inset-top)`.

### 12.3 Menu de contexto

- Gatilho explícito `…` em cada item.
- O menu abre ancorado ao botão, não apenas em `clientX/clientY`.
- Fechar por toque fora, `Escape`, scroll e mudança de rota.
- Foco inicial no primeiro item; setas navegam; `Tab` sai e fecha.
- Desktop mantém `onContextMenu`.
- O menu não pode ser cortado pelo `overflow` do container; usar portal ou posicionamento fixo.

---

## 13. Feedback e estados

- **Vazio:** uma frase curta + ação primária; sem moldura dourada.
- **Erro:** `role="alert"`, texto específico, ação de recuperação; não apenas “erro”.
- **Sucesso:** confirmação inline e/ou toast; não depender de mudança silenciosa.
- **Busy:** `aria-busy`, botão desabilitado com rótulo “Criando…”, sem salto de layout.
- **Rascunho indisponível:** explicar que o armazenamento local não está disponível e oferecer caminho alternativo; não prometer salvamento que não existe.
- **Falha de criação:** manter o texto digitado, manter o foco no formulário, exibir erro próximo ao campo.

---

## 14. Acessibilidade e toque

| Requisito | Regra |
|---|---|
| alvo mínimo | 44 × 44 px (WCAG 2.2 AA / Apple HIG) |
| espaçamento | ≥ 8 px entre alvos |
| foco | `:focus-visible` de 2 px, offset 2 px |
| contraste | 4.5:1 para texto; 3:1 para UI |
| zoom | suportar 200% sem perda de função |
| orientação | não bloquear landscape |
| movimento | respeitar `prefers-reduced-motion` |
| leitor de tela | `aria-label`, `aria-current`, `aria-expanded`, `aria-controls` |
| teclado | ordem lógica, `Escape` fecha overlays |
| toque | `touch-action: manipulation`; sem `user-scalable=no` |

Ações destrutivas exigem confirmação explícita, com foco inicial no botão seguro e `aria-describedby` apontando para o nome do item.

---

## 15. Composições de referência

`compositions.html` demonstra seis composições:

1. **Cabeçalho compacto** — título em 2 linhas, sem fonte pixelada.
2. **Busca com botão compacto** — campo flexível + ícone 44 × 44.
3. **Filtros progressivos** — resumo de filtros ativos + disclosure + “Limpar” sempre visível.
4. **Item de lista com ações explícitas** — título + metadados + `…`.
5. **Top 10 compacto** — posição, título, quatro ações em barra própria.
6. **Modal com fechamento acessível** — header com `…`/X, corpo rolável, ações sticky.

Cada composição é reproduzida em 320, 360, 390, 412, 768 e 1366 px. O teste automatizado verifica `scrollWidth <= clientWidth`, alvos < 44 px e carregamento das fontes.

---

## 16. API de componentes e nomes de classes

### 16.1 Proposta de API

```tsx
<Button variant="golden" size="compact" icon={<FaSearch />} aria-label="Buscar">
  Buscar
</Button>
```

- `variant`: `golden | secondary | ghost | danger`
- `size`: `default | compact`
- `iconOnly`: quando verdadeiro, exige `aria-label`
- `busy`: mantém largura e troca o rótulo
- `as`: `button | link | a` (preservar API atual)

`RPGUIButton` atual continuaria funcionando; a nova API é aditiva.

### 16.2 Classes CSS propostas

- `ss-btn`, `ss-btn--golden`, `ss-btn--secondary`, `ss-btn--ghost`, `ss-btn--danger`, `ss-btn--icon`.
- `ss-panel`, `ss-panel--framed`, `ss-panel--framed-golden`, `ss-panel--framed-grey`, `ss-panel--compact`.
- `ss-field`, `ss-label`, `ss-input`, `ss-select`.
- `ss-list-row`, `ss-list-row__meta`, `ss-action-menu`, `ss-rank`, `ss-rank__actions`.
- `ss-details`, `ss-chip`, `ss-segmented`.

### 16.3 Compatibilidade

- Não renomear classes vendorizadas.
- Não remover `.rpgui-button` de usos existentes sem migração explícita.
- Novas classes são escopadas e opt-in.
- `app/globals.css` pode receber overrides mobile; `styles/vendor/rpgui/rpgui.css` não deve ser editado.

---

## 17. Regras de adoção e compatibilidade

1. **Mobile primeiro na correção, desktop preservado na verificação.**
2. Cada página migrada deve ser comparada em 320, 390, 768 e 1366 px.
3. Nenhuma correção mobile pode alterar o DOM semântico de forma destrutiva.
4. Ações existentes não podem desaparecer; podem mudar de forma (texto → ícone com `aria-label`).
5. O mesmo componente deve ser usado em páginas semelhantes (Busca Geral e Backlog).
6. Frames são removidos por decisão de hierarquia, não por “ficar mais bonito”.
7. Toda exceção deve ser documentada no relatório da fase.

### 17.1 Ordem de adoção recomendada

1. Tokens e tipografia.
2. Botão compacto e campo de busca.
3. Containers e cabeçalhos.
4. Listas/tabelas e ações explícitas.
5. Menu mobile e overlays.
6. Formulários e modais.
7. Top 10, Coleções e casos específicos.
8. Revisão de acessibilidade e regressão desktop.

---

## 18. Conteúdo e microcopy

- Título de página: “Bem-vindo, {nome}.” — não usar o nome completo se ele quebrar; preferir primeiro nome ou `overflow-wrap`.
- Busca: “Buscar no catálogo geral…” / botão “Buscar”.
- Criar: “Criar” / “Criando…”.
- Review indisponível: “Não foi possível criar o rascunho neste dispositivo. Verifique o armazenamento do navegador.”
- Contexto: “Mais ações”.
- Top 10: “Mover para cima”, “Mover para baixo”, “Remover do Top 10”.
- Vazio: “Nenhuma coleção ainda. Crie a primeira acima.”

Regras:

- evitar instruções que dependam de clique longo;
- não usar “clique” em mobile; usar “toque” quando necessário;
- manter português consistente com o restante do produto;
- não inventar jargão novo.

---

## 19. Performance e custo

- A proposta não adiciona dependências de runtime.
- Usa os sprites existentes; o custo é o mesmo das imagens já carregadas.
- Fontes: os protótipos usam WOFF2 locais; a produção já carrega JetBrains Mono e Press Start 2P.
- Overrides mobile são CSS; não há JavaScript adicional para layout.
- Evitar `backdrop-filter` em grandes áreas; usar overlay sólido com opacidade.
- Evitar animações de `width`/`height`; usar `transform` e `opacity`.
- `content-visibility: auto` pode ser avaliado em listas longas, mas não é requisito desta fase.
- O impacto esperado é redução de repaint e de área decorativa, não aumento de bundle.

---

## 20. Critérios de aceitação, riscos e decisões pendentes

### 20.1 Critérios de aceitação

- Nenhum overflow horizontal não intencional em 320, 360, 390, 412, 768 e 1366 px.
- Nenhum alvo interativo abaixo de 44 × 44 px nas páginas migradas.
- Fontes carregadas e sem fallback visual inesperado.
- Título de página sem truncamento em 320 px.
- Botão golden compacto preserva sprite e identificação.
- Menu mobile fecha por backdrop, `Escape` e botão; foco retorna ao gatilho.
- Ações de contexto disponíveis por toque.
- Nenhuma ação existente removida.
- Desktop permanece visualmente equivalente ao estado atual.

### 20.2 Riscos

| Risco | Mitigação |
|---|---|
| Press Start 2P continuar em títulos longos | papel semântico + revisão visual por página |
| Botão compacto ficar pequeno demais | alvo 44 px + teste automatizado |
| Perda de identidade ao remover molduras | manter uma moldura por região e o ouro nas ações primárias |
| Regressão desktop | breakpoints e comparação em 1366 px |
| Preferências de fonte sobrescritas | não alterar `data-font-*` sem aprovação |
| Menus cortados por overflow | portal/posicionamento fixo |
| Rascunho local indisponível | estado explícito + investigação runtime |

### 20.3 Decisões pendentes do proprietário

1. Definir a precedência entre preferências tipográficas existentes e os papéis mobile, sem adicionar “Automático”.
2. Aprovar a remoção de molduras em feed, cards de estatística, Coleções e Top 10.
3. Aprovar o botão golden compacto sem ornamentos laterais e escolher altura visual após comparar as amostras.
4. Aprovar ícone `…` como affordance padrão de contexto.
5. Definir se listas mobile substituem tabelas ou convivem com tabela rolável.
6. Definir o comportamento de rascunho quando IndexedDB não está disponível.

Nenhuma dessas decisões foi implementada nesta entrega.
