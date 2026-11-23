# MOBILE-04A — Auditoria e ajustes de Home, busca e feed

**Data:** 22 de novembro de 2026  
**Escopo:** HOME-01, HOME-02 e investigação de HOME-03.  
**Resultado:** ajustes focados aplicados a HOME-01 e HOME-02; HOME-03 continua bloqueado por decisão de exposição/contrato de dados. Sem alteração em API, persistência, dependências ou arquitetura de hidratação.

## 1. Baseline e limites

- Repositório: `C:\Users\Heric\Documents\save-state`, branch `main`.
- `HEAD` no início: `7ed633832f05c53c77f4d48833e68129717c9b19`.
- O checkout já continha trabalho paralelo: `docs/IGDB_PERFORMANCE_RELEASE_REPORT.md` modificado e outros relatórios não rastreados. Foram preservados e não fazem parte desta alteração.
- O PDF original não está no checkout nem nos caminhos locais verificados. Para critérios, foi usada `docs/RPGUI_MOBILE_PDF_TRACEABILITY.md`; não se afirma inspeção direta do PDF.
- O servidor Next existente na porta 3000 e seu `.next` foram preservados. O endpoint `/home` redireciona para `/login` sem sessão; não havia credenciais de teste autenticadas disponíveis. Assim, não foi possível validar visualmente a Home renderizada ou testar a interação em navegador.
- A matriz de viewports solicitada (320, 360, 390, 412, 768 e 1366 px) foi considerada na revisão de composição/CSS, mas não recebe aprovação visual runtime nesta rodada.

## 2. Evidências e decisões por requisito

| ID | Evidência observada | Resultado desta rodada |
|---|---|---|
| **HOME-01** | A saudação usava título display `text-2xl`; a busca usava o botão RPGUI tradicional, de geometria larga; a seção de atividade tinha margem externa `m-5`. | Corrigido em produção: título funcional responsivo, header com `min-w-0`, busca com input flexível/compacto e botão lupa de 44×44 com nome acessível; removida a margem externa fixa do feed. Mantida a rota/semântica `/search?search=...` e Enter continua submetendo o formulário. |
| **HOME-02** | Na Home, o feed diário usava moldura externa ornamentada; grupos ganhavam outra moldura e títulos display. | Adicionada variante opt-in `home` ao renderer compartilhado: na Home, dias passam a usar separadores discretos, sem moldura; grupos ficam sem segunda moldura; título, horário e eventos usam tipografia funcional/compacta. O renderer default do diário/preview preserva sua aparência. Estados vazio/carregando/erro mantêm seus containers existentes. |
| **HOME-03** | O evento `note.created` persiste `metadata.noteId`, não o texto da anotação. O DTO de feed copia `metadata`; o conteúdo fica em `UserGameNote`, consultado com escopo do usuário para a busca do diário. A ação atual abre o jogo/notas, mas não exibe snippet no feed. | **Não implementado.** Mostrar texto exigiria nova leitura e política explícita de exposição, inclusive comportamento para anotação apagada e truncamento Unicode. Não foi ampliado payload, endpoint, serializer nem consulta. É necessária decisão do proprietário para expor trecho de até 100 caracteres no feed. |

## 3. Arquivos alterados

- `app/(app)/home/page.tsx` — título responsivo e remoção da margem rígida no bloco do feed.
- `features/home/home-search-form.tsx` — input compacto com `min-width: 0` e botão de busca icon-only de alvo mínimo 44 px, acessível por `aria-label`.
- `features/activity/home-feed.tsx` — tipografia de seção e ativação da variante específica da Home.
- `features/activity/activity-feed.tsx` — renderer compartilhado com variante opcional; layout default permanece, ajustes de densidade limitados à Home.

Nenhum contrato HTTP, schema, serviço, dado, dependência ou preferência global foi alterado. A navegação e a paginação do feed permanecem intactas.

## 4. Validação

- Node `v24.22.3` usado na execução conclusiva; pnpm `11.3.0`.
- **Suíte completa:** `pnpm test` — 128 arquivos e 1.544 testes aprovados.
- **Testes direcionados após os ajustes finais:** 4 arquivos e 48 testes aprovados (`home-feed`, `note-presentation`, `home-redesign`, `rpgui-mobile-foundation`).
- **Typecheck:** `pnpm typecheck` aprovado.
- **ESLint dos quatro arquivos alterados:** aprovado.
- **Whitespace/diff check:** aprovado considerando CRLF do checkout (`core.whitespace=cr-at-eol`).
- Uma tentativa inicial da suíte completa sob Node `v26.13.1` teve duas falhas em `game-grid-density.test.tsx`, porque o ambiente não fornecia `localStorage`. Reexecutada com Node 24 do projeto: suíte integral aprovada.
- **Navegador/viewports, interação autenticada e comparação visual desktop:** não executados, pois a rota autenticada redireciona a `/login` sem sessão de teste. O build não foi iniciado para não compartilhar ou sobrescrever o `.next` do servidor dev ativo.
- Sem inspeção de aparelho físico; sem staging, commit, push ou deploy.

## 5. Estado final e recomendação

HOME-01 e HOME-02 receberam mudanças comportamentais de layout/densidade fundamentadas no código e passaram testes, typecheck e lint; não são declarados visualmente homologados sem sessão/browser. HOME-03 permanece intencionalmente pendente até haver decisão explícita sobre a exposição do texto das anotações no feed. Próximo passo recomendado: aprovar ou rejeitar essa exposição e disponibilizar sessão de teste autenticada para validação visual nos seis viewports, incluindo desktop.
