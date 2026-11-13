# DB-LOCAL-07 — Incidente de autenticação Atlas (credencial de desenvolvimento)

## 1. Resumo executivo

As tentativas de autenticação de `MONGODB_DEV_URI` receberam repetidamente o código sanitizado `MONGO_8000`. O proprietário informou que a URI havia sido configurada com uma identidade diferente da conta de desenvolvimento criada no Atlas; também informou que a senha foi rotacionada. No R3, a comparação local confirmou que a identidade presente na URI corresponde à identidade esperada, mas a conexão ainda recebeu `MONGO_8000`. Portanto, a divergência foi identificada e corrigida na configuração, porém **não está confirmada como causa única das falhas**. A causa da falha de autenticação atual permanece em investigação.

Nenhuma senha, URI completa, hostname, IP ou identificador da conta é registrado neste documento.

## 2. Linha do tempo

Ordem cronológica; horários não foram registrados e não são inferidos.

1. O proprietário criou uma credencial Atlas exclusiva para desenvolvimento e configurou `MONGODB_DEV_URI` localmente.
2. A primeira tentativa autorizada com essa variável não pôde prosseguir porque a variável ainda não estava disponível no ambiente carregado.
3. Após a configuração local, o preflight passou e a tentativa de autenticação retornou `MONGO_8000`; não houve ping.
4. O proprietário informou que redefiniu a senha no Atlas e salvou a configuração local.
5. A revalidação AUTH-R2 retornou novamente `MONGO_8000`; não houve ping.
6. Uma reexecução R2 também retornou `MONGO_8000`; não houve ping.
7. O proprietário identificou que a identidade na URI não correspondia à conta de desenvolvimento criada. O proprietário também informou que a senha anteriormente compartilhada havia sido rotacionada.
8. No R3, o preflight confirmou localmente `username_matches_expected: true`. A única tentativa de `connect()` retornou `MONGO_8000`; o ping não foi enviado.

Os históricos DB-LOCAL-01 a DB-LOCAL-06 registram problemas TLS no Windows e, posteriormente, conexão TLS/autenticação/ping funcionando no Linux com a credencial original. Esses fatos são contexto histórico e não estabelecem a causa do incidente atual.

## 3. Causa: evidência, informação do proprietário e inferência

### Evidência observada

- As tentativas de autenticação malsucedidas registraram somente o código sanitizado `MONGO_8000`; mensagens brutas e stacks não foram persistidas.
- No R3, a comparação privada do username decodificado da URI contra a identidade esperada resultou em `true`.
- Mesmo após essa correspondência, o R3 recebeu `MONGO_8000` durante `connect()`.
- O R3 usou TLS explicitamente habilitado, com validação de certificado e hostname. Uma resposta de erro MongoDB chegou durante a conexão; não foi executada uma auditoria TLS independente.

### Informação fornecida pelo proprietário

- A URI anterior continha uma identidade diferente daquela criada para desenvolvimento.
- A senha foi redefinida/rotacionada pelo proprietário, inclusive após ter sido compartilhada durante a investigação.
- A identidade pretendida foi corrigida na configuração local antes do R3.

### Inferência técnica

A divergência de identidade é uma explicação concreta e consistente para falhas anteriores e sua correção na URI foi confirmada pelo preflight R3. Entretanto, como R3 continuou falhando após a correspondência, ela **não explica sozinha o resultado atual** e não deve ser homologada como causa raiz definitiva. Não se infere que a senha, `authSource`, estado de propagação do Atlas ou qualquer outra configuração seja a causa; esses fatores não foram testados isoladamente.

> O incidente não deve ser associado automaticamente às falhas TLS históricas do Windows. São eventos distintos; o R3 não mostrou erro TLS, mas também não fez uma verificação TLS independente além da conexão MongoDB com validação ativa.

## 4. Impacto e limites do que se sabe

- A autenticação das tentativas malsucedidas não foi concluída; nenhum ping foi executado nelas.
- Os probes não executaram operações de leitura de documentos nem escritas persistentes.
- Nenhum índice ou coleção foi provisionado; GATE 3B.2-B continua bloqueado/não autorizado.
- Essas observações descrevem somente os probes. Não afirmam ausência absoluta de atividade Atlas por outros processos ou clientes.

## 5. Medidas corretivas

Informadas ou executadas no escopo controlado:

- O proprietário identificou a divergência entre a identidade da conta de desenvolvimento e a identidade anteriormente configurada na URI.
- A identidade da URI foi corrigida; R3 confirmou correspondência sem revelar o username.
- O proprietário informou que rotacionou a senha anteriormente compartilhada.
- O R3 validou sintaxe, percent-encoding, destino esperado, ausência de path conflitante e opções TLS seguras antes de uma única tentativa.
- A revalidação foi limitada a conexão e, somente se autenticada, um ping administrativo. Como a autenticação falhou, o ping não ocorreu.

Não houve alteração automatizada de URI, senha, `authSource`, usuário/role Atlas ou configuração da aplicação.

## 6. Prevenção recomendada

1. Comparar localmente a identidade da URI com a conta esperada antes de conectar, emitindo somente um booleano sanitizado.
2. Nunca imprimir usernames, senhas, connection strings, hostname ou mensagens brutas de autenticação em logs/relatórios.
3. Usar identificadores sanitizados para conferir configurações.
4. Evitar usuários administrativos para operações de desenvolvimento.
5. Manter credenciais independentes para Development, Preview e Production.
6. Manter arquivos `.env` protegidos; o `.env` inspecionado permaneceu em modo `600`.
7. Validar autenticação antes de autorizar qualquer operação persistente.
8. Não repetir automaticamente diante de falha de autenticação.

Estas são recomendações; nenhum mecanismo novo foi implementado nesta etapa.

## 7. Estado do R3 e próximo passo

**GATE 3B.2-AUTH-R3: FALHOU** — identidade esperada presente (`username_matches_expected: true`), mas `connect()` recebeu `MONGO_8000`; autenticação não concluída e ping não executado. O proprietário deve revisar privadamente a credencial e a configuração Atlas e solicitar nova autorização antes de outra tentativa. Não testar combinações alternativas de senha ou `authSource` nesta execução.

O R3 não comprova escopo das roles, acesso ao database de desenvolvimento, permissões de escrita/criação de índices, funcionamento do Mongoose ou cadastro. **GATE 3B.2-B permanece NÃO AUTORIZADO.**
