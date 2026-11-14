# UX-RPGUI-INPUTS-01 — Mostrar/ocultar senha e correção do texto borrado

Data: 14/11/2026
Escopo: componentes RPGUI e formulários de autenticação
Nenhuma operação remota, alteração de backend ou instalação de dependências.

---

## 1. Evidência original

O proprietário relatou, com capturas dos formulários de login e cadastro:

- os campos de e-mail preenchidos pelo navegador recebem fundo claro (autofill);
- o texto aparece escuro, porém com sombra/duplicação, dificultando a leitura;
- os campos de senha não oferecem controle de visibilidade.

---

## 2. Hipótese inicial

`text-shadow` herdado da RPGUI estaria criando o contorno duplicado sobre o fundo claro do autofill.

Hipótese tratada como suspeita, não como conclusão, até a inspeção do CSS.

---

## 3. Investigação CSS

Arquivos relevantes:

- `app/globals.css`
- `styles/vendor/rpgui/rpgui.css`
- `components/RPGUI/Input.tsx`

Achados:

1. `components/RPGUI/Input.tsx` aplica as classes `rpgui-container framed-grey rpgui-input`.
2. `app/globals.css:232-251` define `.rpgui-input, textarea.rpgui-input` com:
   - `color: white`
   - `text-shadow: -2px 0 black, 0 2px black, 2px 0 black, 0 -2px black`
   - `background: #4e4a4e`
3. `styles/vendor/rpgui/rpgui.css` também define sombra para `.rpgui-content input`, mas o app **não** usa ancestrais `.rpgui-content` (grep confirmou apenas definições, sem uso em TSX). Portanto essa regra não atinge os inputs atuais.
4. `app/globals.css:182-191` aplica a mesma sombra a `.font-display`, `.press-start-2p-regular` e `.rpgui-button` — deve ser preservada.
5. Não existiam regras `:-webkit-autofill`, `:autofill` ou `-webkit-text-fill-color` no projeto.
6. Não existiam `filter` nem `-webkit-text-stroke` aplicados aos inputs.

---

## 4. Causa confirmada e limitações

**Causa confirmada estaticamente:** o contorno `text-shadow` de quatro deslocamentos pretos em `.rpgui-input` é desenhado ao redor do texto. Quando o navegador troca o fundo para claro e o texto para escuro no autofill, o contorno preto ao redor de glifos escuros parece borrado/duplicado. É um problema de contraste entre o contorno e o novo par fundo/texto, não da fonte.

**Limitação:** não houve validação visual em navegador real (restrição da tarefa: não iniciar Next.js). A conclusão é sustentada pelo CSS efetivamente aplicado, mas a confirmação pixel-a-pixel deve ser feita manualmente (seção 13).

---

## 5. Solução para mostrar/ocultar senha

Novo componente: `components/RPGUI/PasswordInput.tsx`.

- `"use client"`, estado local `visible` iniciado em `false`.
- Renderiza `RPGUInput` com `type={visible ? "text" : "password"}`.
- Botão `<button type="button">` posicionado em `absolute inset-y-0 right-0`, dentro da área visual do input.
- Classe `pr-11` no input reserva espaço para o botão, sem sobrepor o texto.
- Ícones de `react-icons/fa6` (`FaEye` / `FaEyeSlash`), dependência já presente — nada foi instalado.
- O botão é `aria-hidden` nos ícones e possui `aria-label` dinâmico.
- O componente preserva a API do input (`value`, `onChange`, `autoComplete`, `required`, `readOnly`, etc.) via `InputHTMLAttributes` menos `type`.

O `aria-pressed` foi deliberadamente omitido: o rótulo dinâmico ("Mostrar senha"/"Ocultar senha") já comunica o estado, e `aria-pressed` em conjunto com rótulos mutáveis gera anúncio redundante/confuso.

---

## 6. Escopo da correção de sombras

Alteração central em `app/globals.css:232-251`:

- removido o `text-shadow` de `.rpgui-input` e `textarea.rpgui-input`;
- mantidos `color: white`, `background: #4e4a4e`, dimensões e tipografia.

Cobertura:

- todos os inputs textuais que usam `RPGUInput` (email, password, search, url, tel, number, text);
- `textarea.rpgui-input`;
- checkboxes, radios, ranges e botões não usam `.rpgui-input` e permanecem intactos;
- `.font-display`, `.press-start-2p-regular` e `.rpgui-button` mantêm a sombra original.

Nenhum override foi espalhado por páginas.

---

## 7. Tratamento de autofill

- Não existiam regras de autofill; nenhuma foi adicionada.
- A cor de fundo escolhida pelo navegador foi preservada (objetivo era remover o borrado).
- Com a sombra removida, o texto do autofill fica legível independentemente de o navegador escolher fundo claro ou escuro.
- Nenhum `!important`, nenhuma máscara e nenhuma desativação de autocomplete/password managers.

---

## 8. Acessibilidade

- Controle é `<button type="button">` — não submete o formulário.
- Nome acessível dinâmico: "Mostrar senha" / "Ocultar senha".
- Utilizável por teclado (elemento nativo).
- Foco visível via `focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`.
- Contraste: ícone branco sobre o fundo escuro do input.
- O botão fica dentro do `<label>` existente, mas os ícones são `aria-hidden` e o botão não possui texto, então o texto do label permanece "Senha" e a associação label/input não muda (confirmado pelos testes existentes de `getByLabelText`).
- Layout responsivo: `absolute` à direita + `pr-11` no input.

---

## 9. Arquivos alterados

- `components/RPGUI/PasswordInput.tsx` (novo)
- `app/globals.css`
- `features/auth/login-form.tsx`
- `features/auth/register-form.tsx`
- `features/auth/reset-password-form.tsx`
- `features/settings/password-form.tsx`
- `tests/auth/password-visibility.test.tsx` (novo)
- `tests/rpgui-input-styles.test.ts` (novo)
- `docs/UX_RPGUI_INPUTS_01.md` (este documento)

---

## 10. Testes executados

```bash
pnpm typecheck
pnpm exec eslint <arquivos tocados>
pnpm exec vitest run tests/auth/password-visibility.test.tsx tests/rpgui-input-styles.test.ts
pnpm exec vitest run tests/auth
pnpm exec vitest run
```

Cobertura nova:

- estado inicial oculto;
- clique revela, segundo clique oculta;
- valor preservado;
- campos independentes (inclusive senha vs confirmação);
- `type="button"` sem submit;
- nome acessível dinâmico;
- `autocomplete` preservado;
- CSS sem sombra no escopo textual;
- sombra mantida em títulos/botões;
- ausência de checkbox/radio/range no bloco alterado.

---

## 11. Resultados

| Verificação | Resultado |
| --- | --- |
| `pnpm typecheck` | aprovado |
| ESLint | aprovado |
| Testes novos | 9/9 |
| `tests/auth` | 141/141 em 13 arquivos |
| Suíte completa | 1405/1405 em 117 arquivos |

Na primeira execução da suíte completa houve timeouts transitórios em testes de integração sob carga (ex.: `top10`), sem relação com os arquivos alterados; a reexecução completa passou 1405/1405.

---

## 12. Limitações

- Sem validação visual real em navegador: o resultado do autofill (cores exatas por navegador/SO) precisa ser conferido manualmente.
- jsdom não simula a renderização de autofill; os testes cobrem a estrutura e o CSS, não o pixel.
- O toggle não altera o comportamento de password managers além de mudar `type`.

---

## 13. Instruções para verificação visual

1. Executar `pnpm dev` localmente (não executado nesta tarefa).
2. Abrir `/login` e `/register`.
3. Preencher e-mail e senha, permitir que o navegador salve e recarregue para disparar o autofill.
4. Confirmar que o texto do e-mail está nítido, sem duplicação, tanto em fundo claro quanto escuro.
5. Clicar no olho: o texto deve alternar sem perder o valor, sem submit e sem tirar o foco do fluxo.
6. Repetir em `/reset-password` e em Configurações → Alterar senha.
7. Testar apenas com teclado (Tab + Enter/Espaço) e verificar o foco visível do botão.
