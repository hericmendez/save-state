# HYDRATION-01 — Relatório final de auditoria técnica

**Data:** 22 de novembro de 2026
**Veredito:** aprovado tecnicamente, com validações locais concluídas
**Publicação:** nenhuma — sem staging, commit, push ou deploy

## 1. Escopo e baseline

Auditoria da correção de mismatch de hidratação das preferências de layout,
fontes e densidade de grade. O critério foi manter SSR e leitura síncrona de
`localStorage`, aplicando as preferências antes do primeiro paint sem alterar a
raiz hidratada pelo React, suprimir avisos ou adiar estilos para `useEffect`.

O checkout começou em `main`, no commit `18ff57e36458dc1753791bf477b10e5b011838b3`,
igual a `origin/main`, com índice sem staging. Ambiente validado: Node
`v24.22.3` e pnpm `11.3.0`.

O worktree continha mudanças locais HYDRATION-01 e trabalhos paralelos. Todos
foram preservados; não foram usados credenciais, banco, APIs de escrita,
deploy ou testes E2E que limpem dados.

## 2. Implementação auditada

A abordagem CSSOM foi mantida. A auditoria não encontrou falha que justificasse
substituí-la:

- `app/layout.tsx` entrega no SSR o stylesheet vazio de preferências antes do
  script inline parser-blocking.
- `features/shared/layout-mode.ts` centraliza leitura, validação e resolução
  das preferências e grava as regras no stylesheet por CSSOM; não altera os
  atributos do `<html>`.
- `features/shared/ui-store.ts` reaplica as preferências imediatamente nas
  mudanças manuais e mantém o formato persistido `save-state-ui`.
- `app/globals.css` e `app/rpgui-mobile.css` consomem as variáveis CSS para
  geometria, fontes, grid e tipografia funcional mobile.
- Os atributos legados `data-layout-mode`, `data-font-display`,
  `data-font-display-explicit`, `data-font-body` e `data-grid-density` não são
  mais consumidores de produção em `app`.

A cobertura de unidade agora exercita defaults e valores inválidos, modo
pixel-perfect/fullscreen e breakpoint, fontes explícitas e não explícitas,
densidades 6/8/10/12, atualização do CSSOM, persistência/reload do store e
ausência de DOM/stylesheet. O caso de fonte display não explícita confirma que
o default mobile funcional não é substituído.

## 3. Diferença na contagem de testes

Os relatórios anteriores divergiam: HYDRATION-01 registrava 1543 testes e
MOBILE-03C registrava 1544. A comparação com o commit-base identificou a causa:
`tests/layout-mode.test.ts` tinha 43 casos no baseline e 42 após a conversão
para CSSOM. Seis casos antigos de escrita de atributos foram substituídos por
cinco casos CSSOM/resolução — redução líquida de um teste, não perda de
descoberta de arquivos.

A auditoria restaurou a verificação funcional que faltava no caso de fonte não
explícita e adicionou o caso de segurança do helper sem DOM, sem inflar a
contagem líquida em relação ao baseline. A suíte completa atual passou com
**1544 testes em 128 arquivos**, compatível com o total publicado no relatório
MOBILE-03C. Não foi encontrada perda líquida de cobertura em relação aos 1544
testes do baseline.

## 4. Validação executada

| Verificação | Resultado |
|---|---|
| Testes direcionados de layout, grid e navegação mobile | **52/52 passaram**, 4 arquivos |
| Vitest completo | **1544/1544 passaram**, 128 arquivos |
| Playwright Chromium real em `/login`, 390 × 844 | **Passou** |
| Playwright Chromium real em `/login`, 768 × 844 | **Passou** |
| Playwright Chromium real em `/login`, 1366 × 844 | **Passou** |
| Typecheck (`pnpm typecheck`) | Passou |
| ESLint completo (`pnpm lint`) | 0 erros; 7 avisos fora do escopo |
| ESLint dos arquivos de teste alterados | Passou sem avisos |
| Build Next.js isolado | Passou; artefato `.next/BUILD_ID` gerado |
| Instalação isolada | Offline, frozen lockfile, 622 pacotes do cache, zero downloads |
| `git diff --check` | Passou |

O lint completo manteve sete avisos fora do escopo: um em
`features/atp/catalog-search.tsx` e seis diretivas ESLint não utilizadas em
`scripts/import-platform-images.mjs`. Nenhum foi alterado ou suprimido.

O build isolado usou uma cópia temporária sem `.env`, `node_modules` ou `.next`
do checkout; dependências foram instaladas com
`pnpm install --offline --frozen-lockfile --ignore-scripts`. O teste
Playwright também usou cópia independente, sem `.env`, em servidor local
temporário. Os diretórios temporários ficam sob
`C:\Users\Heric\AppData\Local\Temp\opencode`.

### Evidência de primeira pintura e hidratação

O Playwright injeta a instrumentação antes da navegação, observa entradas de
paint, mutações de atributos em `<html>` e intercepta a instalação da regra
CSSOM no bootstrap. Nas três larguras, verificou:

- resposta `/login` HTTP 200 e markup SSR sem atributos de preferências;
- stylesheet SSR único, com texto vazio e regras CSSOM instaladas pelo
  bootstrap inline síncrono, posicionado antes do stylesheet;
- snapshot de layout/fontes instalado no bootstrap anterior ao `first-paint`,
  igual aos valores de preferência observados depois da hidratação;
- nenhuma mutação de atributos da raiz, erro de hidratação ou overflow
  horizontal;
- fonte, geometria e grade computadas; fixture CSS pixel-perfect com 12 colunas
  em larguras desktop;
- mudança dinâmica de preferências sem alteração da raiz e persistência
  correta após reload.

O teste não depende de temporização por `useEffect`; valida o bootstrap no
momento da escrita CSSOM e compara seu timestamp com o `first-paint` do
navegador.

## 5. Limitações e eventos de validação

Não foi feita inspeção visual humana em dispositivo físico. A validação visual
automatizada cobre Chromium nas três dimensões indicadas; `/login` não monta o
shell autenticado, portanto geometria e grid foram avaliados com fixture de
elementos na página e CSS real da aplicação.

Durante a auditoria, o servidor dev no checkout ficou sem responder e foi
encerrado; o teste foi repetido com sucesso em cópia isolada. A suíte completa
teve uma primeira execução encerrada pelo limite de tempo do comando e foi
repetida com sucesso integral. Uma execução Playwright intermediária revelou
diferenças legítimas de serialização de fontes computadas; as asserções foram
ajustadas para comparar o conteúdo semântico e a execução final passou. Nenhum
desses eventos exigiu alterar a implementação CSSOM.

## 6. Estado final e decisão

**A correção HYDRATION-01 está tecnicamente aceita.** A aplicação mantém SSR,
aplica preferências antes do primeiro paint, não altera a raiz React hidratada
e preserva leitura, defaults, escolhas explícitas, densidades e persistência.
Não há evidência reproduzida que justifique trocar CSSOM por outra abordagem.

As alterações continuam locais e sem staging, commit, push ou deploy.
`docs/IGDB_PERFORMANCE_RELEASE_REPORT.md` e os relatórios paralelos não
relacionados foram preservados.
