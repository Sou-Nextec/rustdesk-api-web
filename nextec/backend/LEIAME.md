# Correção na API enviada ao projeto original

PR: https://github.com/lejianwen/rustdesk-api/pull/540 (branch `fix/admin-update-empty-fields` no fork `Sou-Nextec/rustdesk-api`).
Enquanto o PR não é aceito, o patch é aplicado na imagem Nextec (estágio `api` do Dockerfile). Quando for aceito e sair numa nova versão da imagem `lejianwen/rustdesk-server-s6`, use `NEXTEC_API_PATCH=0`.

## Histórico

A imagem Nextec mantém a API original da lejianwen, como definido no projeto. Este patch fica aqui
como proposta, para decidir se vale aplicar na imagem ou enviar como PR para o upstream.

## O que corrige

`0001-admin-grava-campos-vazios.patch`, sobre `lejianwen/rustdesk-api` na tag `v2.6.29`
(a mesma versão da imagem `lejianwen/rustdesk-server-s6:latest` usada hoje).

1. **Campos esvaziados não são gravados.** As telas de administração usam `Updates(struct)` do GORM,
   que ignora valores vazios. Na prática não dá para apagar o apelido de um dispositivo, o e-mail ou a
   observação de um usuário, o emissor ou os escopos de um login externo. O patch faz os controladores
   de administração gravarem só os campos do formulário, inclusive vazios. O cliente RustDesk e o LDAP,
   que enviam dados parciais, continuam com o comportamento original.
2. **ID do dispositivo não é obrigatório na API.** O cadastro de dispositivo aceita ID vazio. O patch
   acrescenta a validação. O painel Nextec já bloqueia isso na tela (`src/nextec/required-guard.js`).

## Por que não está na imagem

Aplicar exige recompilar a API (Go com CGO, por causa do SQLite) e trocar `/app/apimain` na imagem.
Isso muda o motor, contrariando a regra de manter servidor e API originais, e o build precisa de um
`go.sum` fixado (o repositório upstream não versiona esse arquivo).

## Caminhos possíveis

* Enviar como PR para `lejianwen/rustdesk-api` (melhor opção: a correção chega a todos e o motor continua original).
* Ou aplicar na imagem Nextec com um `go.sum` fixado e revisado, aceitando manter o patch a cada atualização.

## Patch 0002: chave do cliente web

`0002-chaveador-cliente-web.patch` é exclusivo da Nextec (não vai para o upstream) e deve ser aplicado
depois do 0001, sobre a mesma tag `v2.6.29`. O `git apply /patches/*.patch` do Dockerfile já segue a
ordem dos nomes. Origem: branch `nextec/web-client-toggle` do fork `Sou-Nextec/rustdesk-api`.

1. **Rotas do cliente web sempre registradas.** `/webclient`, `/webclient2`, `/webclient-config/index.js`,
   `/api/shared-peer`, `/api/server-config` e `/api/server-config-v2` passam a existir sempre e checam
   `app.web-client` a cada requisição. Desligado, respondem 404 como uma rota inexistente. Ligado, nada muda.
2. **Endpoint para o painel.** `POST /api/admin/nextec/web-client`, somente administrador, com o corpo
   `{"enabled": true}` ou `{"enabled": false}`. Responde no formato padrão com `{"web_client": 1}` ou
   `{"web_client": 0}`. O `GET /api/admin/config/app` passa a refletir o valor atual sem reiniciar.
3. **Persistência.** A escolha fica em `/app/data/nextec-settings.json` (o volume do banco SQLite), gravada
   de forma atômica. Na inicialização esse arquivo tem prioridade sobre o `config.yaml` e sobre a variável
   `RUSTDESK_API_APP_WEB_CLIENT`. Sem o arquivo, vale a configuração original. Para voltar ao controle
   pela variável, apague o arquivo e reinicie o contêiner.

## Patch 0003: listas compartilhadas no painel

O app RustDesk já mostra ao técnico as listas compartilhadas com ele, mas o painel não tinha como ler isso. O patch acrescenta, para o usuário logado (sem exigir admin):

- `GET /api/admin/my/shared/collections`: listas compartilhadas com ele (por pessoa ou equipe), com dono, nível e quantidade.
- `GET /api/admin/my/shared/address_book/list?collection_id=`: dispositivos dessas listas, sem senha nem hash, com a última comunicação.
- `POST /api/admin/my/shared/status` com `{"ids": [...]}`: última comunicação só dos IDs que ele enxerga (listas próprias, compartilhadas ou computadores dele).

Branch `nextec/web-client-toggle` do fork da API (commit seguinte ao 0002). Não vai para o projeto original.

## Patch 0004: foto do usuário e segredo do login externo

- O login do app (`/api/login`) passa a incluir `display_name` e `avatar` do usuário.
- `POST /api/admin/my/profile/avatar` grava ou remove a foto do usuário logado (data URL png/jpeg/webp, até 150 KB).
- As respostas de listar e detalhar login externo não incluem mais o `client_secret`; ao editar, deixar o segredo vazio mantém o atual.

## Patch 0005: SQLite em modo WAL

O banco do painel abria no modo padrão do SQLite: uma escrita lenta bloqueava todas as leituras e a espera era de 5 s, gerando `database is locked` (usuário deslogado, botão do login externo sumindo, atualização de dispositivos de 57 s). Agora abre com WAL, `busy_timeout` de 30 s e transações imediatas. Para copiar o banco com o servidor ligado, copie também os arquivos `-wal` e `-shm` (ou use `sqlite3 .backup`).

## Patch 0006: foto do Microsoft 365

No login externo com Microsoft Entra ID, a API busca a foto em `graph.microsoft.com/v1.0/me/photos/96x96/$value` e grava como avatar do usuário **se ele ainda não tem foto** (a escolhida por ele no painel nunca é sobrescrita). Requer o escopo `User.Read` no provedor (o botão "Preencher para Microsoft Entra ID" já inclui). Quem não tem foto no Microsoft 365 continua com a inicial.

## Patch 0007: modelos de cliente

`GET` e `POST /api/admin/nextec/client-templates` (somente admin) guardam a lista de modelos de cliente (subgrupos e quem acessa cada um) em `data/nextec-settings.json`, junto com as demais configurações. A tela Clientes usa isso para criar um cliente já com os subgrupos e as permissões do modelo.

## Patch 0008: cofre de senhas

Troca automática da senha permanente do RustDesk nos servidores. Um agente (tarefa agendada, a cada 5 min, como SYSTEM) pergunta ao painel se é hora de trocar, gera a senha, envia como pendente, aplica com `--password` e só então confirma. Se aplicar falhar, a senha anterior continua valendo no painel.

- Regras: por grupo ou por máquina (a da máquina vale mais). Padrão 3 h, mínimo 15 min, máximo 24 h.
- Admin vê a senha (`Ver senha`, fica na auditoria). Quem enxerga a máquina conecta com um clique (`rustdesk://<id>?password=...`, registrado como `connect`).
- Senhas cifradas em AES-256-GCM. Chave: variável `NEXTEC_VAULT_KEY` ou arquivo `data/nextec-vault.key` (gerado na primeira subida). **Faça backup desse arquivo junto do `api/`**: sem ele as senhas guardadas não abrem.
- Cadastro do agente: chave gerada em Segurança > Senhas dos servidores > Cadastrar máquina; token por máquina (só o hash fica no banco). Para recadastrar, use "Remover agente".
- Rotas do agente: `/api/nextec/agent/{enroll,sync,password,confirm}` (fora do Cloudflare Access, com limite de falhas por IP).

## Patch 0009: atualização do app pelo painel

O administrador envia o instalador (`.msi` ou `.exe`, até 300 MB) em Dispositivos > Atualizações do app e escolhe quem recebe: um grupo piloto (clientes e/ou máquinas) ou todos. As máquinas, pelo `Instalar-Nextec.ps1`, consultam o painel todo dia, baixam, conferem o SHA-256 e instalam.

- Arquivos ficam em `data/nextec-updates/` do contêiner do painel (volume `api`), nomeados `nextec-acesso-<versão>.msi`. A tabela `nextec_app_releases` guarda versão, hash, tamanho e notas; `nextec_app_installs` guarda o que cada máquina informou na última checagem. A publicação atual fica em `data/nextec-settings.json` (chave `app_rollout`). **Faça backup do volume `api/` inteiro.**
- O envio valida versão (`2.0.1`), extensão, cabeçalho real do arquivo (MSI/EXE), tamanho e nunca sobrescreve uma versão existente. Rotas de admin exigem perfil admin.
- Rotas públicas, sem Cloudflare Access: `GET /api/nextec/update/versao.json?id=<ID RustDesk>&v=<versão instalada>` (mesmo formato do antigo versao.json) e `GET /api/nextec/update/files/<nome>`. Só são servidos arquivos enviados pelo admin. O instalador não tem segredo (endereço do servidor e chave pública). O envio passa pelo túnel da Cloudflare, que limita o corpo a 100 MB no plano gratuito.
- Voltar versão = publicar uma anterior (o script instala quando a versão publicada é diferente da instalada). Uma versão publicada não pode ser excluída.
- Máquinas desconhecidas do servidor (ID que nunca se registrou) não são registradas no acompanhamento.

## Patch 0010: suporte avulso

Entrega o app de suporte a quem ainda não tem nada instalado, sem o cliente precisar de conta.

- O administrador envia o `.exe` do rdgen em Dispositivos > Suporte avulso (validação de extensão e cabeçalho MZ, até 300 MB, troca atômica). Fica em `data/nextec-support/nextec-suporte.exe`; metadados em `data/nextec-settings.json` (chave `support_app`).
- Páginas públicas, sem Cloudflare Access: `GET /suporte` (instruções em pt-BR) e `GET /suporte/baixar` (entrega `Suporte-Nextec.exe`). Só entregam o arquivo enviado pelo admin; sem arquivo, a página avisa que o link está indisponível. Cabeçalhos de segurança (CSP restrita, `nosniff`, `no-store`).
- `GET /api/admin/my/support/waiting` (qualquer usuário logado) lista dispositivos novos (cadastrados nas últimas 24 h), sem cliente nem dono e vistos nos últimos 10 minutos. Quem recebe a conexão decide no app (aprovação por clique), então a lista não concede acesso.
- Rotas de admin: `GET /api/admin/nextec/support`, `POST .../support/upload`, `POST .../support/delete`.
- Rollback: o patch não altera tabelas; remover a imagem nova desativa as páginas.

## Patch 0011: instalação por cliente

Cada cliente (grupo de dispositivos) tem uma chave de instalação própria: HMAC-SHA256 do id do cliente com a chave do cofre, mais um número de "época" guardado em `data/nextec-settings.json` (`assign_epoch`). `GET /api/admin/nextec/install-token?group_id=` devolve a chave; `POST .../install-token/revoke` soma 1 à época e invalida todas as antigas. O script de instalação chama `POST /api/nextec/install/assign {id, group, token}` (público, com limite de 10 tentativas erradas por IP em 10 minutos): a máquina entra no cliente se ainda não tiver cliente; se ainda não se registrou, fica pendente (tabela `nextec_pending_assigns`, 24 h) e é atribuída quando enviar o sysinfo. Nunca move uma máquina que já tem cliente.

## Patch 0012: políticas do app e conexões ativas

O app RustDesk manda um heartbeat ao servidor da API com os IDs das conexões abertas (`conns`) e o carimbo da última política recebida (`modified_at`). A resposta passa a poder trazer `strategy.config_options` e `disconnect`. Só se atende o heartbeat de quem prova ser o dispositivo (uuid igual ao cadastrado no sysinfo).

- Política (`nextec_app_policies`): por cliente ou por máquina; a da máquina vale mais; subgrupo ("Cliente / Sub") herda a do cliente. Lista fechada de opções: `enable-keyboard`, `-clipboard`, `-file-transfer`, `-audio`, `-camera`, `-terminal`, `-tunnel`, `-remote-restart`, `-record-session`, `-block-input`, `-remote-printer` (Y ou N) e `access-mode` (`view`). A estratégia é declarativa: todas as opções gerenciadas vão a cada mudança e as não definidas voltam ao padrão, então remover a regra devolve o app ao normal. Aprovação e senha continuam com o cofre de senhas.
- Conexões ativas: o servidor guarda em memória as conexões vivas por máquina (somem em 90 s sem heartbeat). Desconectar coloca a ordem na fila e ela é entregue uma vez, no próximo heartbeat. Detalhes de quem conectou vêm da auditoria de conexões.
- Login obrigatório para conectar não é do painel: é a variável `MUST_LOGIN=Y` do servidor (hbbs) na stack. Ligue só depois de todos os técnicos entrarem na conta Nextec no app.

## Patch 0013: chamado na conexão e relatório mensal

`nextec_connect_notes` guarda o chamado informado ao clicar em Conectar no painel. O relatório `GET /api/admin/nextec/report?month=AAAA-MM&group_id=` junta a auditoria de conexões do mês (fuso America/Sao_Paulo) com a última anotação da mesma máquina feita até 5 minutos antes da conexão. Modo do pedido de chamado (`off`, `optional`, `required`) e endereço base do Jira ficam em `data/nextec-settings.json`.

## Patch 0014: quem vê a fila Aguardando atendimento

Configuração `waiting_visibility` em `data/nextec-settings.json`: `off`, `admins` (padrão quando não definida) ou `all`. `GET /api/admin/my/support/waiting` aplica a regra no servidor: sem permissão devolve `enabled:false` e lista vazia. O admin muda em `POST /api/admin/nextec/support/settings {waiting_mode}` (registrado na auditoria como `support_settings`).

## Patch 0015: textos e has_app

Ajustes pequenos: mensagens de envio sem citar o rdgen e `GET /api/admin/my/support/waiting` passa a devolver o `has_app` real
também para quem não pode ver a fila (a tela de Suporte avulso precisa saber se o link está disponível).

## Patch 0016: ID sem espaços

`NextecCleanId` remove espaços (inclusive o sem quebra) do ID ao criar ou alterar dispositivos e acessos salvos, e na sincronização
da lista de endereços do app. Na inicialização, `NextecNormalizeIds` corrige os IDs já gravados com espaço (dispositivos e acessos
salvos), pulando os que causariam conflito com um ID já existente (aviso no log). Cobertura em `service/nextec_ids_test.go`.

## Patch 0017: mensagens claras do servidor de ID e do relay

`NextecCmdErrorMessage` (`service/nextec_cmderr.go`) traduz o erro de rede ao enviar comandos para o hbbs/hbbr
(recusado, tempo esgotado, host não encontrado, conexão encerrada) em texto em português. A rota `/rustdesk/sendCmd` passa a
devolvê-lo no lugar do erro cru. O hbbs só aceita comandos de 127.0.0.1; com servidor em contêiner separado a recusa é esperada.

## Patch 0018: comandos do hbbs/hbbr por encaminhador

Com `NEXTEC_SERVER_CMD_HOST` definido (na stack: `servidor`), a rota `/rustdesk/sendCmd` envia o comando para
`host:(porta + 10)`: 21125 para o hbbs (21115) e 21127 para o hbbr (21117). Ao lado do hbbs/hbbr, no contêiner `servidor`, laços
`nc -lk -p <porta+10> -e nc 127.0.0.1 <porta>` repassam pelo loopback, único endereço de onde eles aceitam comandos. A porta de
deslocamento pode mudar com `NEXTEC_SERVER_CMD_PORT_OFFSET`. Sem a variável, o comportamento original (127.0.0.1 e ::1) continua.
A leitura da resposta ganhou prazo de 3 s: comandos de gravação não respondem nada e antes ficavam esperando o fim da conexão.

## Patch 0019: autorização e identidade

Cofre restrito ao dono real ou às listas de cliente administradas, comandos só para administradores, preservação do dono
das listas e validação do par ID/UUID no cadastro, heartbeat e vínculo de usuário. Inclui testes executados pelo Dockerfile.
Contrato e limites em [0019-LEIAME.md](0019-LEIAME.md).

## Patch 0020: protocolo do link de conexão

O RustDesk registra no sistema o protocolo com o nome do app em minúsculas: um app gerado como `Nextec-Connect` abre
`nextec-connect://`, não `rustdesk://`. `NextecConnectSchemeGet/Set` guardam o protocolo (padrão `rustdesk`, só letras minúsculas,
números, `.`, `+` e `-`). `GET/POST /nextec/connect-scheme` (admin) lê e grava; `/my/connect-settings` devolve `scheme` e
`/my/connect-link` monta o link com ele.

## Patch 0031: inscrição global de máquinas

O instalador é o mesmo para todos os clientes. A máquina se inscreve sozinha como **pendente** (sem senha, sem regra, sem
acesso) e o admin a **atribui** a um cliente no painel. Só então o cofre gira e libera a senha. O fluxo de autorização
individual de 15 minutos (patches 0028 e 0029) e o cadastro legado com `agent_key` continuam, e gravam a máquina já aprovada.

**Credencial de inscrição:** `nx1.<época>.<HMAC-SHA256(chave do cofre, "enroll:"+época)>`. Em `data/nextec-settings.json` ficam só
`enroll_epoch` e `enroll_min_epoch`. Girar soma 1 à época e sobe a mínima: credenciais de época abaixo da mínima nunca valem
(comparação em tempo constante).

**Estado** (colunas novas em `nextec_device_secrets`, `AutoMigrate`, sem migração de dados): `awaiting_approval` (padrão `false`,
então as linhas existentes seguem aprovadas), `enrolled_via` (`self`, `bootstrap`, `legacy`; vazio conta como `legacy`),
`enrolled_at`, `enrolled_ip`, `enroll_epoch`, `approved_at`, `approved_by`, `uuid`. Tabela nova `nextec_enroll_blocks` (id + uuid).

**Endpoint público** `POST /api/nextec/agent/self-enroll {enroll_key, id, uuid, proposed_token}`:

| Resposta | Corpo | Quando |
| --- | --- | --- |
| 200 | `{token, state}` (`token` é o eco de `proposed_token`; `state` é `pending` ou `assigned`) | inscrita ou repetição idempotente (mesmo hash de token) |
| 400 | `{error:"bad_request"}` | `id` fora de `^\d{6,64}$`, uuid vazio, token fora de base64url com 43 a 128 caracteres |
| 401 | `{error:"enroll_key_invalid"}` | credencial inválida, revogada ou de época abaixo da mínima |
| 403 | `{error:"blocked"}` | par id + uuid bloqueado pelo admin |
| 404 | `{error:"peer_not_registered"}` | sem Peer (sysinfo), sem uuid, ou sem heartbeat nos últimos 10 min |
| 409 | `{error:"identity_conflict"}` | uuid diferente do Peer, ou pendente com outro token |
| 409 | `{error:"already_enrolled"}` | agente já aprovado com outro token |
| 429 | `{error:"too_many_failures"}` ou `{error:"pending_limit"}` | 10 credenciais erradas em 10 min por IP; 30 inscrições/h por IP, 100/h no total, 500 pendentes |

Nunca sobrescreve token de máquina existente. Credenciais erradas contam em `nextecFailCheck`; conflitos de identidade não
contam (várias máquinas atrás do mesmo NAT não se bloqueiam).

**Agente pendente:** `/agent/sync` devolve `pending_approval:true`, `managed:false` e nenhuma `operation`. `/agent/password` e
`/agent/confirm` respondem 403 `{error:"pending_approval"}` (a condição também vai no `WHERE` das atualizações).
`NextecConnectPassword` e `Reveal` exigem agente aprovado.

**Rotas de admin** (mesmo grupo `/api/admin/nextec`, só administrador; erros usam código 101 do envelope):

- `GET /secrets` ganhou `devices[].state` (`pending` ou `assigned`), `enrolled_via`, `enrolled_at`, `last_ip`, `os`, `username`, além de
  `pending_count`, `stale_count` e `blocked`. Pendente de credencial girada continua listada (`stale_key:true`, mais `uuid`) e
  contada, e segue sujeita ao teto de 500; só a inscrição NOVA exige a credencial vigente.
- `POST /secrets/assign {id, client_id, rule:"group"|"peer"|"none", interval_minutes?, move?, uuid?}`: em transação, define
  `peer.group_id`, aprova (`approved_at`, `approved_by`) e aplica exatamente a regra (a da máquina vence a do grupo):
  `group` apaga a regra própria e exige regra do cliente ligada (senão `no group rule`, sem aprovar nem mover);
  `peer` grava regra própria com intervalo entre 15 e 1440 min (omitido usa 180; 0 e negativo são recusados);
  `none` apaga a regra própria e, se o cliente tem regra ligada, grava regra própria desligada para não herdá-la.
  `rule` é obrigatória. Recusa mover máquina que já está em outro cliente sem `move:true`. Repetir o mesmo pedido não muda
  nada (`already:true`); outra regra para a mesma máquina e cliente atualiza e audita `enroll_rule_change`.
  Chaves anteriores (`stale_key`) podem ser atribuídas normalmente.
- `POST /secrets/reject {id, block, uuid?}`: remove a pendente; com `block:true` grava o par id + uuid (e o uuid atual do Peer,
  se diferente) na tabela de bloqueios. Com `uuid` informado, recusa se a linha mudou de identidade.
- `POST /secrets/unblock {id, uuid?}`, `GET /enroll-key` (`{key, epoch, min_epoch}`) e `POST /enroll-key/rotate`.

**Identidade:** o `uuid` gravado na inscrição é comparado com o do Peer em `assign`/`reject` (admin: código 101, "identidade da
máquina mudou"), em `agentAuth` (sync, password, confirm: 409 `{error:"identity_conflict"}`), em `NextecConnectPassword` e em
`Reveal`. Linhas anteriores sem uuid não têm o que comparar e seguem como antes.

**Credencial girada:** reenviar o self-enroll com a credencial nova, mesmo id + uuid e mesmo `proposed_token`, é idempotente e
só atualiza `enroll_epoch` da linha (sem duplicar nem mexer em `enrolled_at`). Credencial revogada segue recusada (401).

Auditoria: `self_enroll`, `enroll_assign`, `enroll_rule_change`, `enroll_reject`, `enroll_block`, `enroll_unblock`,
`enroll_key_rotate`, `enroll_identity_conflict`, `agent_identity_conflict` (sem segredos nem uuid).
Testes: `service/nextec_enroll_test.go`, `service/nextec_enroll_review_test.go`, `http/controller/api/nextec_enroll_test.go`,
`http/controller/api/nextec_enroll_identity_test.go` e `http/controller/admin/nextec_enroll_test.go` (rodam no build da imagem).
Rollback: remover o patch deixa as colunas novas sem uso; pendentes ficariam com token e sem política de aprovação, então
atribua ou rejeite todas antes de voltar.

## Patch 0033: credencial de inscrição para o gerador

`GET /api/nextec/gen/enroll-key`, rota interna (grupo `/api`, fora do `/api/admin`) usada pelo rdgen a cada build.

- Cabeçalho `X-Nextec-Gen-Secret` comparado em tempo constante com `NX_RDGEN_SHARED_SECRET` (a stack já repassa o segredo à API e ao gerador).
- 503 `gen_secret_not_configured` se o segredo da API estiver vazio; 403 `internal_only` se a requisição trouxer `CF-Connecting-IP` ou `CF-Ray` (veio pelo túnel); 401 `gen_secret_invalid` se o segredo faltar ou estiver errado; 429 depois de 10 erros em 10 minutos do mesmo IP.
- 200 `{"enroll_key": "...", "epoch": N}` com `Cache-Control: no-store`. A chave não é gravada em log.
- Testes: `http/controller/api/nextec_genkey_test.go`.

## Patch 0032: atribuir liga a regra do cliente

`POST /nextec/secrets/assign` aceita `enable_group_rule:true` (com `rule:"group"`) e `group_interval_minutes` opcional (15 a 1440).
Se o cliente não tem regra de senha ligada, o servidor a cria ou religa **dentro da mesma transação** da atribuição: intervalo
informado, senão o da regra desligada existente, senão 180 min. Regra já ligada não é alterada. Qualquer recusa (identidade/UUID,
cliente de outro dono sem `move`, intervalo inválido) desfaz tudo. Auditoria `client_rule_enable` mais `enroll_assign`; a resposta
traz `group_rule_enabled`. Sem a flag o comportamento do 0031 (`ErrNextecNoGroupRule`) permanece.

## Patch 0034: endereço do painel configurável

A API emite o endereço de `NEXTEC_PANEL_URL`, depois `URL_PAINEL`; sem nenhum, deriva do domínio acessado (proxy local/privado ou TLS direto).
Só aceita `https://host` (sem porta, caminho, credencial ou IP). Valor definido porém inválido dá erro, não cai em outra fonte.

Série validada sobre `v2.6.29`: 0001..0032 + 0034 aplicam limpas em ordem, e também 0001..0032 + 0033 + 0034 (cenário em que o #82 entra
antes) e 0001..0032 + 0034 + 0033 (o #82 entra depois). O 0034 só toca `nextec_bootstrap.go` e arquivos novos em `service/` e `admin/`;
o 0033 toca `http/router/api.go` e cria arquivos novos em `api/` e `service/`, sem sobreposição. Falha anterior do CI: o arquivo do 0034
tinha fim de linha CRLF e o `git apply` do Linux o rejeitava ("patch failed ... nextec_bootstrap.go:52"); os `.patch` devem ser LF.
O workflow `Imagem Nextec` agora aplica toda a série em ordem antes do build e aponta qual patch não aplica.



## Patch 0035: estado do agente derivado de contato real

O cadastro (bootstrap ou inscrição) gravava `last_seen_at = agora` e o painel o tratava como "agente ativo". Se a instalação local
era desfeita depois (rollback do `.cmd`), o painel mostrava "Tudo pronto" sem agente nenhum e recusava uma autorização nova.

- **Coluna aditiva** `nextec_device_secrets.last_sync_at` (`AutoMigrate`, padrão 0, sem migração de dados). Só a consulta
  `POST /api/nextec/agent/sync` autenticada a preenche; `last_seen_at` continua sendo "qualquer escrita". Rollback: remover o patch
  deixa a coluna sem uso. Linha anterior à coluna: `last_sync_at = 0`, ou seja, `parado` se cadastrada, até o próximo sync.
- **Estado:** `NextecAgentStateAt` devolve `ativo` (sync há menos de `NextecAgentActiveCycles` x `NextecAgentSyncCycle` = 3 x 5 min),
  `parado` (cadastrado e sem sync recente ou sem sync nenhum), `pendente_aprovacao` ou `sem_agente`. `GET /nextec/secrets` ganhou
  `devices[].agent_state` e `devices[].last_sync_at`.
- **Autorização individual sobre agente parado:** `POST /nextec/secrets/bootstrap` e o consumo do código aceitam máquina cadastrada
  cujo agente está `parado`. O consumo troca o token (compare-and-swap por `token_hash` e `last_sync_at`, na mesma transação que gasta
  o código), mantém senhas e versões, zera `last_sync_at` e audita `agent_replaced_stale`. Agente `ativo` ou `pendente_aprovacao`
  continua recusado (409 `agent active` no emitir; no usar o código não é gasto). ID, uuid, hash, prazo de 15 minutos e https
  seguem como antes.
- **Último erro do agente:** colunas aditivas `last_error` e `last_error_at`. `POST /api/nextec/agent/sync` aceita `last_error`
  (opcional; código `^[a-z][a-z0-9_]{0,47}$`, fora disso grava `unknown_error`). Sync sem o campo, ou com ele vazio, limpa;
  a confirmação da troca também limpa. `GET /nextec/secrets` devolve `devices[].last_error` e `last_error_at`.
- **Série:** 0001..0035 aplicam limpas em ordem sobre `v2.6.29`. Toca `model/nextec_secret.go`, `service/nextec_secret.go`,
  `service/nextec_bootstrap.go`, `http/controller/admin/nextec_bootstrap.go`, `http/controller/api/nextec_agent.go` e cria
  `service/nextec_agent_state.go` (+ testes). O 0036 do PR #92 também muda a chamada do sync em `nextec_agent.go`: quem entrar
  por último precisa regenerar o patch juntando `app_name` e `last_error` na mesma chamada.
- Testes: `go test -race ./service ...` (a imagem roda a lista do Dockerfile).
