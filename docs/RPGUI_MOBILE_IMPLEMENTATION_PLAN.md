# MOBILE-02 — Plano de implementação futura

**Status:** plano proposto; nenhuma etapa de implementação de produção iniciada.
**Princípio:** mudança pequena, isolada, reversível e validada; desktop preservado.

## 1. Objetivo e limites

Converter a arquitetura descrita em `RPGUI_MOBILE_DESIGN_SYSTEM_PROPOSAL.md` em mudanças incrementais, após aprovação do proprietário. Não alterar comportamento de domínio durante uma migração visual. Não editar CSS vendorizado, instalar dependências, mudar API/schema/banco ou transformar todo o app em Client Components.

O PDF é o contrato de produto para os 14 IDs listados em `RPGUI_MOBILE_PDF_TRACEABILITY.md`. Em caso de conflito, registrar a exceção e solicitar decisão.

## 2. Fases e critérios

### Etapa 0 — Diagnóstico funcional e navegação

**Escopo**

- Reproduzir e obter evidência de “Criar coleção não funciona” em dispositivo/contexto autorizado.
- Reproduzir falha do rascunho e registrar navegador, versão, secure context, disponibilidade/quota de IndexedDB e erro.
- Conferir menu no toque, backdrop, z-index, Escape, foco e estado fechado.
- Validar no Chrome Android se long press abre `contextmenu`; não depender disso como affordance.
- Acordar com o proprietário o desenho final para backdrop, logout e ação `…`.

**Arquivos a inspecionar/possivelmente alterar em fase autorizada**

- `features/collections/collections-manager.tsx`
- `features/reviews/review-form-section.tsx`
- `features/reviews/draft-store.ts`
- `features/navigation/app-shell.tsx`
- `features/navigation/nav-mobile.tsx`
- `features/games/context-menu.tsx`
- `features/games/game-context-menu.tsx`

**Exclusões:** alterações de API, persistência, auth, IndexedDB fallback ou nova funcionalidade sem decisão explícita.

**Testes/aceite**

- Criar coleção por Enter e toque, erro/loading/sucesso visíveis, nome preservado em erro.
- Review: criação/abertura/salvamento do rascunho em contexto compatível; falha local legível e não silenciosa.
- Menu abre/fecha pelo gatilho, backdrop, botão e Escape; foco retorna; não interage fechado.
- `…` abre menu em touch; right-click continua funcional em desktop.

### Etapa 1 — Fundação RPGUI Mobile

**Escopo**

- Definir tokens CSS em arquivo próprio do Save State, não no vendor.
- Implementar variantes aditivas de Button, Input/Select e panel.
- Introduzir escala tipográfica sem sobrescrever as preferências existentes.
- Mapear estados focus-visible/disabled/busy.
- Restringir overrides mobile ao breakpoint acordado.

**Arquivos prováveis**

- `components/RPGUI/Button.tsx`
- `components/RPGUI/Input.tsx`
- `components/RPGUI/Select.tsx` (confirmar caminho/arquivo presente)
- `app/globals.css` ou novo stylesheet app-owned carregado por ele
- testes unitários de classes/API dos primitivos

**Exclusões:** editar `styles/vendor/rpgui/rpgui.css`, remover classes existentes em massa, trocar fontes no desktop, alterar todos os consumidores.

**Testes/aceite**

- API atual continua compatível; novas props/classes são aditivas.
- Golden compacto compara alturas da placa pintada usando sprites reais centralizados, sem ornamentos laterais; alvo ≥44px, tamanho visual sujeito a aprovação.
- Input mobile 16px e alvo ≥44px.
- Testes de estado e classes passam; revisão visual de cada variante em 320/390/768/1366px.

### Etapa 2 — Shell, Home, busca e Atividade

**Escopo**

- Header e navegação sem sobreposição.
- Home search com campo flexível e lupa.
- Densidade do feed Home/Atividade; tipo e snippets de nota apenas após confirmar payload.
- Filtros progressivos da Atividade e composição de datas/segmentos/paginação.

**Arquivos prováveis**

- `app/(app)/home/page.tsx`
- `features/home/home-search-form.tsx`
- `features/activity/home-feed.tsx`
- `features/activity/activity-feed.tsx`
- `features/activity/presentation.ts`
- `features/diary/diary-view.tsx`
- navegação da Etapa 0

**Exclusões:** alterar ordenação/query contract, truncar o conteúdo original ou ocultar ações.

**Testes/aceite**

- Cenários HOME-01/02/03, MENU-01 e ACTIVITY-01 atendidos segundo traceability.
- Filtros e estado de URL continuam consistentes.
- Teste de texto longo e conteúdo sem anotação; desktop comparado a baseline.

### Etapa 3 — Backlog, coleções e Top 10

**Escopo**

- Definir card/lista mobile versus tabela rolável; não esconder informação sem affordance.
- Gatilho explícito de menu contextual.
- Compactar filtros, Coleções e Top 10 sem remover ações.

**Arquivos prováveis**

- `features/games/backlog-table-row.tsx`
- `features/games/data-table.tsx`
- `features/games/backlog-view.tsx`
- `features/games/game-card.tsx`
- `features/games/game-collection-item.tsx`
- `features/games/game-context-menu.tsx`
- `features/collections/collections-manager.tsx`
- `features/top10/top10-view.tsx`

**Exclusões:** mudar semântica de favoritos/status/listas, introduzir endpoint de busca de coleções sem verificar suporte existente, remover confirmação de ações.

**Testes/aceite**

- Jogos, Favoritos e listas de coleção usam a mesma affordance de toque.
- Todas as ações existentes preservadas; targets ≥44px.
- Top 10 mantém abrir/subir/descer/remover, ordem e estados disabled.
- Tabela desktop sem regressão; overflow horizontal mobile é intencional, indicado e testável se mantida.

### Etapa 4 — Formulários, catálogo e modais

**Escopo**

- Formulário de jogo e buscas de metadados/capa.
- Lista de plataformas com limiar de colunas validado.
- Modais/drawers com cabeçalho compacto, fechar persistente e ações responsivas.
- Revisar interação com teclado virtual/safe areas.

**Arquivos prováveis**

- `features/games/game-form.tsx`
- `features/games/game-metadata-search.tsx`
- `features/games/game-cover-search.tsx`
- `features/games/game-drawer-shell.tsx`
- `features/atp/catalog-search.tsx`
- `features/atp/catalog-drawer-content.tsx`
- `features/catalog/platforms/platforms-search.tsx`

**Exclusões:** mudança de metadados, importação ATP, contratos BFF/API, edição de dados do usuário.

**Testes/aceite**

- BACKLOG-NEW-GAME-FORM-01 e `-MODAL-01`, GAME-SEARCH-PLATFORMS-01, GAME-CATALOG-MODAL-01, BACKLOG-GAME-MODAL-01 atendidos.
- Scroll do modal não esconde fechar/ações; conteúdo longo alcançável.
- Form não é submetido por engano por botões internos.

### Etapa 5 — Homologação

**Escopo**

- Auditoria completa das páginas alteradas.
- Regressão desktop e acessibilidade por teclado/leitor de tela.
- Capturas em viewports e dispositivo real quando disponível.
- Atualizar traceability por ID com links aos testes e evidência final.

**Aceite**

- 320, 360, 390, 412, 768 e 1366 px sem overflow não intencional.
- Nenhum alvo abaixo de 44×44px; foco visível; zoom de 200% sem perda funcional.
- Todas as ações e estados anteriores mantidos.
- Testes relevantes passam; limitações reais documentadas.
- Proprietário aprova antes de qualquer publicação.

## 3. Regras de isolamento mobile/desktop

1. Sem alterar regras base do vendor; overrides ficam em CSS app-owned e escopados.
2. Classes atuais continuam válidas. Migrar consumidores por fatias, sem troca massiva.
3. Mobile: compacidade, não escala transformada; nunca escalar para baixo um alvo tocável.
4. Desktop: botão RPGUI e molduras atuais permanecem default até revisão visual aprovada.
5. Preferências `data-font-display`/`data-font-body` permanecem inalteradas; não criar “Automático” nesta fase. Definir precedência antes de promover os novos papéis tipográficos.
6. Não usar `zoom` para acomodar nav ou conteúdo.
7. Não usar apenas hover, contextmenu ou long press para ações.
8. Não introduzir CSS global genérico em `button`, `input`, `h1` sem escopo semanticamente definido.

## 4. Estratégia de testes

### Unitários/componentes

- `rpguiButtonClasses` e API compatível.
- Tokens/classe em estados default, compacto, disabled e icon-only.
- Requisitos de `aria-label` para ícone isolado.
- Serialização/filtros existentes não devem mudar.

### Integração/fluxo

- Criar, renomear e excluir coleção com feedback e confirmação existente.
- Context menu: toque explícito, click-away, Escape, right-click desktop.
- Review draft: sucesso e IndexedDB indisponível; sem banco de dados/API real para draft local.
- Modal: abrir, fechar, scroll, focus return e interação de teclado.

### Visual e viewport

- 320×568, 360×800, 390×844, 412×915, 768×1024, 1366×768.
- ScrollWidth/clientWidth; medir bounding boxes de controles.
- Texto longo: nome de usuário, nome de jogo, coleção, plataforma e anotação.
- Comparar desktop pré/pós, não apenas avaliar captura mobile.

### Acessibilidade

- Navegação completa por teclado e foco visível.
- TalkBack/VoiceOver quando dispositivo disponível.
- Contrast check de texto, estados e bordas.
- Alvo mínimo e espaçamento, landscape, zoom 200%, reduced motion.

Não iniciar E2E que exija setup de banco sem autorização e inspeção de seu comportamento destrutivo.

## 5. Riscos de regressão

| Risco | Sinal | Mitigação |
|---|---|---|
| Desktop muda junto com mobile | Botões/molduras ficam compactos em viewport largo | CSS condicionado a breakpoint; screenshot baseline |
| Preferência de fonte ignorada | `font-display` sempre vira JetBrains | Tokens semânticos respeitam `data-font-*`; aprovação para Auto |
| Ícone remove clareza | “+” executa ação ambígua | `+` apenas quando uma ação; múltiplas opções usam `…`; label acessível |
| Tabela perde informação | Colunas ocultas sem acesso | card com metadados ou tabela rolável explicitamente |
| Menu inaccessible | foco atrás do backdrop/fechado | inert, foco preso/restaurado, testes teclado |
| Rascunho parece salvo mas não está | falha local engolida | estado de erro explícito; não prometer autosave |
| “Busca de coleção” leva a nova API | UI depende de contrato ausente | verificar endpoints/limites; solicitar decisão antes de criar |
| Containers achatados demais | perda de hierarquia/identidade | manter moldura em regiões justificadas, não remover em massa |
| Layout modal cobre conteúdo | footer/header fixos sem espaço | body rolável, safe-area, teste de texto longo |

## 6. Aprovações do proprietário necessárias

1. Botão golden compacto sem extensões laterais e escolha da altura da placa após comparação (28/32/36/40px); alvo mínimo de 44px.
2. Política mobile tipográfica compatível com as preferências existentes, que não serão alteradas nesta fase.
3. Remoção/redução seletiva de molduras por página.
4. `…` explícito como gatilho de contexto; manter right-click desktop.
5. Representação de tabelas em mobile.
6. Exibição de snippet de notas no feed e regra de 100 caracteres.
7. Busca de coleções: confirmar escopo/API existente antes de adicionar.
8. Estratégia de rascunho se IndexedDB não estiver disponível.

## 7. Dependências e sequência

Etapa 0 precede mudanças funcionais; Etapa 1 precede adoção visual; Etapas 2–4 dependem dos primitivos, mas podem ser executadas separadamente. Etapa 5 fecha cada fatia antes de publicação. O plano não autoriza a execução: cada fase de implementação requer aprovação explícita do proprietário.
