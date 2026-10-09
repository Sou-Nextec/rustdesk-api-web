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
