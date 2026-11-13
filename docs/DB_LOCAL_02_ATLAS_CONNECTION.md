# DB-LOCAL-02 — Diagnóstico autenticado de conexão Atlas

**Data:** 11/11/2026
**Veredito:** **FALHA DE CONEXÃO IDENTIFICADA** — o driver aceita a URI, mas falha na seleção/conexão com assinatura de erro TLS/SSL antes de confirmar handshake, autenticação ou ping. A causa subjacente específica do erro TLS permanece não determinada.

## 1. Ambiente e integridade

- Projeto: raiz do checkout `C:\Users\Heric\Desktop\save-state`; branch `main`; HEAD `9aaa952bae0bbe0bfca5674d301b0284c44bc824`.
- Windows 11; Node `v24.22.1`; pnpm `11.3.0`; Next.js `15.5.29`; Mongoose `8.24.4`; driver MongoDB `6.20.0` (resolvido pela dependência do Mongoose).
- Working tree já continha as alterações listadas antes desta fase; foram preservadas. O único arquivo novo desta fase é este relatório e a atualização resumida do relatório DB-LOCAL-01.
- Processo Next preexistente continuou em `:3000`; não foi reiniciado. MongoDB local continuou em `127.0.0.1:27017`; não foi acessado pelo protocolo Mongo nesta fase.

## 2. Origem e seleção da configuração

Foi usado o loader `@next/env` da mesma versão do Next instalado, em subprocesso diagnóstico isolado, com modo `development` e precedência Next (ambiente herdado > `.env.development.local` > `.env.local` > `.env.development` > `.env`). Os valores foram mantidos somente em memória e nunca impressos.

| Campo | Resultado seguro |
|---|---|
| `MONGODB_URI` | Presente; origem efetiva do subprocesso: `.env`; esquema `mongodb+srv`; destino remoto; credenciais presentes. |
| `MONGODB_DB_NAME` | Ausente nas fontes carregadas; a aplicação resolve o fallback local `save-state`. |
| Database path da URI | Presente; nome omitido. |
| `NODE_ENV` | O processo isolado foi configurado pelo loader em modo desenvolvimento. |
| Vercel | Não aplicável ao subprocesso local; sem valor registrado. |
| TLS/CA/proxy no ambiente do probe | `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `HTTPS_PROXY`, `HTTP_PROXY` e `ALL_PROXY` não estavam definidos no ambiente do subprocesso. |
| Runtime TLS | OpenSSL `3.5.9`; mínimo padrão Node TLS `1.2`. Relógio local no momento do probe: `2026-11-11 23:26:20 -03:00`. |

O processo Next já ativo não foi reiniciado nem teve suas variáveis inspecionadas. Não é possível provar que ele carregou a mesma configuração atual do subprocesso (pode ter herdado variáveis antigas ou iniciado antes de mudança no arquivo). O teste prova o resultado para o ambiente atual carregado em subprocesso, não para aquele processo servidor.

## 3. Probe limitado: método e resultados

Foi executado um script Node inline, fora de rotas da aplicação e sem arquivo versionado, usando `MongoClient` do driver já instalado. Não chamou `connectDatabase()`, Mongoose, modelos, verificação/provisionamento de índices ou serviços de autenticação. Opções finitas: seleção 10s, connect 10s, socket 15s, pool máximo 1, um connecting, retries de leitura/escrita desativados.

| Fase | Resultado |
|---|---|
| P1 — Parse | URI aceita pelo parser do driver; sem imprimir componentes. |
| P2 — Seleção/discovery | Falhou em `client.connect()` após aproximadamente **10.200 ms**. DNS SRV/TXT já havia resolvido no DB-LOCAL-01; TCP sem autenticação aos três alvos também passou naquela checagem. |
| P3 — TLS/handshake | A classificação sanitizada dos erros internos do driver identificou assinatura TLS/SSL. Handshake completo **não foi confirmado**; conexão falhou durante seleção/conexão. |
| P4 — Autenticação | **Não confirmada/não alcançada**: sem handshake TLS concluído não há evidência de credencial aceita ou rejeitada. |
| P5 — Ping | **Não executado**: `client.connect()` falhou antes da chamada de `client.db("admin").command({ ping: 1 })`. Nenhum retry do probe foi feito. |
| P6 — Encerramento | `client.close()` chamado no `finally`; resultado sanitizado `connectionClosed: yes`. Processo Node do probe terminou com o comando. |

O erro bruto (`message`, `stack`, `cause`, topologia/hosts) foi processado apenas em memória para classificação e não foi emitido. Categoria resultante: `TLS_HANDSHAKE_ERROR`. O resultado aponta a camada onde a tentativa atual falha, mas não revela se a origem é incompatibilidade TLS, encerramento remoto, middlebox ou outra causa específica.

## 4. Comparação com DB-LOCAL-01 e com HTTP 500

O resultado atual avança o diagnóstico: parsing passa; DNS e TCP já estavam aprovados sem autenticação; o driver falha em seleção/conexão com assinatura TLS/SSL antes de auth e ping. Portanto, senha rejeitada **não está demonstrada** e não é a primeira correção a fazer. O tempo de ~10,2s é consistente com o limite de seleção configurado, mas não é sozinho prova da subcausa.

O registro de cadastro observava aproximadamente 12,5s e o helper transforma qualquer rejeição de `mongoose.connect()` em mensagem genérica, então o erro visto pela rota não permite atribuição direta. O probe independente reproduziu uma falha de conexão agora, mas usou MongoDB Driver diretamente e não o processo Next nem Mongoose. O HTTP 500 histórico continua explicável como falha de conectividade não tratada como sucesso; não se testou cadastro e não se declara o cadastro funcional.

**Correção de evidência do relatório DB-LOCAL-01:** o relatório anterior dizia que a URI não tinha database path. A inspeção usada naquela etapa classificou incorretamente a presença do path. O probe atual confirmou que existe um path (o nome permanece omitido). A variável `MONGODB_DB_NAME` continua ausente; o código passa explicitamente o fallback `save-state` a Mongoose, que substitui o database padrão indicado na URI para seleção do database da aplicação. Isso não causou o erro TLS, que ocorre antes do acesso ao database. O URI path pode ainda influenciar a database de autenticação conforme as opções do driver; nenhuma opção `authSource` foi identificada. Não alteramos nenhum desses valores.

## 5. Hipóteses e correção mínima

**Confirmado:** falha de conexão atual na camada TLS/SSL durante tentativa do driver.
**Não confirmado:** a razão concreta do TLS, autenticação, estado do cluster Atlas, `ping`, configuração efetiva do Next já ativo e database/coleções disponíveis.

Ordem mínima recomendada, sem alterar arquivos nem elevar permissões:

1. No processo/provedor responsável pelo cluster, conferir estado/compatibilidade TLS e se há regra de rede/proxy intermediário encerrando a negociação; compartilhar apenas o diagnóstico/código sanitizado, não host ou connection string.
2. Conferir configuração TLS/certificados do Windows/Node e data/hora local com o responsável pela máquina. O probe não detectou variáveis de CA/proxy definidas no processo atual; isso não exclui software de rede externo.
3. Depois que o handshake for resolvido, repetir um único probe autorizado. Só então avaliar autenticação. Não mudar senha nem privilégios como tentativa especulativa.
4. Para a decisão já tomada de Atlas em desenvolvimento, escolher e confirmar um database exclusivo. `save-state-dev` é apenas uma proposta clara; **não está configurada nem se confirmou sua existência**. Configurar `MONGODB_DB_NAME` somente em etapa autorizada, após o proprietário aprovar o nome. Não reutilizar Production/Preview. O probe não verifica que o database tenha coleções, índices ou permissão de escrita.
5. Após sucesso do probe driver, solicitar autorização separada para probe equivalente Mongoose sem modelos/índices/dados, para avaliar diferença de driver/configuração. Não reiniciar o processo Next atual sem autorização; eventual validação do HTTP/cadastro exige outra autorização e fixture segura.

Não se recomenda alterar cadastro, aumentar `serverSelectionTimeoutMS`, desabilitar validação TLS, alterar URI/credenciais ou mudar permissões como correção. Nenhuma alteração foi aplicada.

## 6. Garantias de segurança e validação final

- Única operação MongoDB intencional: tentativa de handshake/conexão e descoberta necessária ao driver. O probe falhou antes do ping; portanto não houve comando de ping enviado nem operação de dados.
- Nenhum `find`, `insert`, `update`, `delete`, aggregate, count, list, consulta de índice, criação de índice, migração, seed ou cadastro.
- Nenhuma alteração Atlas, Vercel, rede, `.env`, `.env.example`, dependência ou lockfile; nenhum email, commit, push ou deploy.
- A conexão/client foi fechado no `finally`. Não foi iniciado servidor persistente; processos preexistentes foram preservados.
- Vitest, Playwright e build não repetidos; nenhuma alteração de código de produção.
- `git diff --check` executado após a documentação: exit code 0; warnings de conversão LF/CRLF em arquivos preexistentes. O novo relatório foi verificado sem whitespace final. O lockfile e arquivos `.env` não aparecem como modificados.

## 7. Próxima etapa

Separar duas tarefas futuras: (A) diagnóstico/resolução autorizada da camada TLS Atlas, ainda sem auth/ping confirmado; (B) configuração de database Atlas exclusivo de desenvolvimento, com nome explícito aprovado pelo proprietário. A decisão de usar Atlas para desenvolvimento não prova que database exista nem autoriza sua criação. Nenhuma homologação de AUTH-01C.2 foi realizada ou alterada.

---

## Adendo — DB-LOCAL-03: diagnóstico diferencial TLS (11/11/2026)

A DB-LOCAL-03 aprofundou a falha TLS registrada acima. Um handshake `node:tls` direto contra um alvo SRV, com SNI correto e validação de certificado habilitada, falhou em ~415 ms com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`; a validação de certificado não foi alcançada. Uma repetição única do MongoDB Driver reproduziu a mesma assinatura em ~10.136 ms, com 3/3 servidores afetados, sem autenticação e sem `ping`. Um controle neutro para host público concluiu TLS 1.3 com certificado autorizado, indicando que o runtime Node e o trust store funcionam em geral.

Interpretação: a falha está confirmada na camada TLS e **não** há evidência de certificado inválido, cadeia incompleta ou senha rejeitada. O alerta `internal_error` vem do lado remoto da conexão, mas os dados disponíveis não permitem separar endpoint/cluster Atlas de um intermediário de rede. `mongosh` não está instalado; não houve segundo cliente. O veredito permanece **INCONCLUSIVO** quanto à causa específica; a correção mínima é confirmar o estado/Network Access do Atlas e repetir o mesmo probe em outra rede/cliente, sem desabilitar TLS. Relatório completo em [`DB_LOCAL_03_TLS_DIAGNOSIS.md`](DB_LOCAL_03_TLS_DIAGNOSIS.md). Nenhuma configuração foi alterada e o estado AUTH-01C.2 permanece inalterado.
