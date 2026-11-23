# MOBILE-04A.1 — Validação independente de Home, busca e feed

**Data:** 22 de novembro de 2026  
**Veredito:** **não publicar ainda**. A matriz funcional passou, mas a captura de 768×1024 mostra o título pixelado “Estatísticas” ultrapassando seu card; a suíte E2E completa e o teste de timing HYDRATION-01 não ficaram verdes.  
**Publicação:** nenhuma — sem staging, commit, push ou deploy.

## 1. Escopo, baseline e isolamento

- Checkout `C:\Users\Heric\Documents\save-state`, branch `main`, HEAD inicial `7ed633832f05c53c77f4d48833e68129717c9b19`; índice sem staging.
- MOBILE-04A permaneceu local nos quatro arquivos registrados no relatório anterior. Não alterei a implementação durante esta validação.
- Foram preservados `.next`, `node_modules`, servidor/processos preexistentes e trabalhos paralelos. Build e testes E2E rodaram numa cópia sob `%LOCALAPPDATA%\Temp\opencode\mobile04a1-validation-20261122-231019`, sem `.env`, `.next` ou dependências do checkout.
- Node `v24.22.3`, pnpm `11.3.0`; Playwright usou o Chrome local. O Chromium empacotado pelo Playwright não estava instalado.
- O E2E autenticado usou usuário sintético, índice e banco MongoDB efêmero `save-state-e2e` em réplica local dedicada. O banco foi resetado apenas após opt-ins explícitos e salvaguardas verificadas. As credenciais de Twitch/IGDB eram placeholders fictícios; nenhuma credencial real foi usada.
- O PDF original continua indisponível nos caminhos verificados; os critérios vieram de `RPGUI_MOBILE_PDF_TRACEABILITY.md`. Não houve inspeção física Android nesta rodada.

## 2. Integridade dos cards aprovados e achado visual

Os quatro atalhos da Home mantiveram exatamente a classe `rpgui-container framed-golden block p-4`, textos, fontes pixeladas, cores, sprites e ordem. Nenhuma regra CSS, componente ou dimensão dos cards foi alterada. A inspeção visual do proprietário em Android para os cards RPGUI anteriores continua preservada; não extrapolo essa aprovação para a Home nos viewports não examinados pelo proprietário.

As capturas Chromium da matriz estão na cópia temporária, em `tests/e2e-perf/.artifacts-mobile04a1/home-{largura}x{altura}.png`. Cada caso também mediu `scrollWidth - clientWidth`, alvo da lupa e bounding boxes dos quatro atalhos:

| Viewport | Overflow horizontal | Lupa | Atalhos / observação |
|---|---:|---:|---|
| **320×568** | 0 px | 44×44 px | 1 coluna; cards com 266 px de largura. O username sintético longo quebra em linhas sem sobrepor a busca. |
| **360×800** | 0 px | 44×44 px | 1 coluna; cards com 306 px de largura. Títulos e molduras preservados. |
| **390×844** | 0 px | 44×44 px | 1 coluna; cards com 336 px de largura. Busca submetida no navegador. |
| **412×915** | 0 px | 44×44 px | 1 coluna; cards com 358 px de largura. Títulos e molduras preservados. |
| **768×1024** | 0 px | 44×44 px | 2 colunas; cards com 214 px de largura. **“Estatísticas” excede visualmente a largura interna do card e fica cortado/encosta na borda.** |
| **1366×768** | 0 px | 44×44 px | 4 colunas; cards com 237 px de largura. Captura desktop sem clipping observado nos títulos dos cards. |

As alturas medidas foram 129 px nos cards de 320–412 px, exceto textos descritivos que quebraram naturalmente em 320 px (179 e 159 px). Em 768 e 1366 px os cards mediram 179 px. O clipping de 768 px é um defeito visual identificado nesta validação, não um ajuste autorizado: compactar fonte, alterar o desenho RPGUI ou mudar a grade poderia contrariar a preservação solicitada. Requer decisão do proprietário sobre a composição nesse breakpoint antes de qualquer correção.

## 3. Busca, feed e autenticação

O teste focado `MOBILE-04A authenticated Home viewport matrix and search` passou **2/2**, incluindo a preparação da sessão sintética:

- Home autenticada real em todos os seis viewports; overflow do documento permaneceu em 0 px.
- Lupa medida em 44×44 px nos seis casos.
- Atalhos mantiveram a classe RPGUI aprovada.
- A busca foi preenchida e submetida em 390×844; a URL de destino preservou o valor `Zelda & Mario` no parâmetro `search`.
- Um jogo e mudança de estado sintéticos foram criados pela API no banco efêmero. O evento apareceu na Home autenticada; não foi usado mock de UI para o feed.
- Sem `pageerror` durante a matriz. O provedor externo não foi validado com credenciais reais; a execução registrou falha 4xx esperada para o token fictício.

Isso comprova o fluxo da Home e a apresentação do feed com fixture E2E, não uma conta real nem resultados do provedor de busca.

## 4. Testes e ferramentas

| Verificação | Resultado |
|---|---|
| Vitest completo (`--maxWorkers=1 --hookTimeout=60000`) | **1544/1544 passaram**, 128 arquivos. A primeira execução paralela teve timeouts de 10 s ao iniciar bancos em memória; a repetição sequencial passou integralmente. |
| Typecheck | `pnpm typecheck` — passou. |
| ESLint completo | `pnpm lint` — 0 erros; 7 warnings fora do escopo: 1 em `features/atp/catalog-search.tsx` e 6 diretivas não utilizadas em `scripts/import-platform-images.mjs`. |
| Build isolado | `pnpm exec next build` — passou. |
| Home autenticada, busca e matriz de seis viewports | **2/2 passaram**, com fixture sintética no Mongo efêmero. |
| Playwright E2E + mobile-matrix completos | **81 passaram, 10 falharam** (91 no total; 5,9 min). As falhas abrangeram setup/fluxos de auth, busca e dashboard, além de seletores/fluxos na matriz móvel. Não foram reproduzidas no teste focado da Home e não atribuo causalidade ao diff MOBILE-04A sem investigação adicional. A suíte completa, portanto, **não está aprovada**. |
| HYDRATION-01 — spec Playwright existente | **3 falharam** em Chrome local. Primeiro, serializações equivalentes da fonte Roboto diferiram em aspas/vírgulas; após retirar essa comparação textual apenas na cópia temporária, as três execuções não receberam a entrada `first-paint` esperada. A prova temporal original fica inconclusiva neste browser. |
| HYDRATION-01 — smoke CSSOM independente | **3/3 passaram** em 390, 768 e 1366 px: HTTP 200, um stylesheet de preferências vazio, três regras CSSOM, fontes Roboto e zoom esperado, nenhum atributo legado no `<html>`, nenhum overflow ou erro de hidratação observado. Este smoke não substitui a asserção temporal de first paint. |
| `git diff --check` | Passou com `core.whitespace=cr-at-eol`, necessário para interpretar corretamente os arquivos CRLF do checkout. Nenhuma correção cosmética foi aplicada às fontes. |

O runner Playwright oficial também não inicializou sem ajustes temporários: o global setup chama o provisionador de índices sem a confirmação explícita requerida pelo próprio script. Para executar a validação, usei runner temporário que mantém as mesmas restrições local/efêmero e fornece a confirmação; um seletor de senha ambíguo foi corrigido apenas na cópia descartável. Os arquivos de aplicação e configuração do checkout não foram alterados para contornar esses problemas.

## 5. Escopo e regressões protegidas

- **HOME-01:** composição responsiva e busca com lupa funcionaram na matriz; a busca continuou em `/search?search=...`. O alvo foi 44×44 px.
- **HOME-02:** o feed da Home recebeu evento de atividade sintético e foi renderizado; nenhuma mudança de contrato ou serviço foi necessária.
- **Cards RPGUI:** classes, títulos pixelados, molduras, sprites, cores, espaçamento e disposição não foram redesenhados nem compactados. O achado em 768 px fica registrado sem alteração unilateral.
- **HOME-03:** permanece fora do escopo e não foi implementado. Não foi alterado payload, API, schema, auth, banco de produção, serviço, fornecedor, lockfile, CSSOM ou arquitetura de hidratação.
- O renderer compartilhado mantém a variante `default`; os novos estilos são opt-in para Home. Não encontrei evidência nesta rodada de regressão visual do Diário, mas a suíte E2E completa com falhas impede declarar regressão global aprovada.

## 6. Recomendação e próximos passos

**Não recomendo publicar ainda.** Antes da publicação:

1. Obter decisão do proprietário sobre a legibilidade do título “Estatísticas” em 768×1024, sem presumir autorização para redesenhar os cards ou mudar o breakpoint.
2. Diagnosticar e fazer passar as 10 falhas da suíte E2E completa em ambiente controlado; separar falhas de fixture/provedor dos fluxos do produto.
3. Reexecutar o teste HYDRATION-01 num browser/runtime que exponha a métrica `first-paint` esperada (ou revisar sua compatibilidade sem enfraquecer a prova temporal), preservando a implementação CSSOM publicada.
4. Após qualquer ajuste autorizado, repetir a matriz e obter aprovação visual do proprietário para a Home nos viewports afetados. Não implementar HOME-03 nesta etapa.

O estado local de MOBILE-04A e todos os trabalhos paralelos foram preservados. Não houve staging, commit, push ou deploy.
