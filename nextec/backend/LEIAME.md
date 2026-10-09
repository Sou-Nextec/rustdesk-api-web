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
