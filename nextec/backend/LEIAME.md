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
