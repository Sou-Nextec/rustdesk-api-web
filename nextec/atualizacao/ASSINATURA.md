# Assinar uma versão do Nextec Connect

Um comando, uma senha. A chave privada e a senha nunca saem do computador do operador e nunca vão ao chat, ao painel ou ao Git.

## Uso

```powershell
powershell -ExecutionPolicy Bypass -File .\nextec\atualizacao\assinador\Assinar-Versao.ps1
```

O script faz, nesta ordem:

1. Lê a configuração local em `%LOCALAPPDATA%\Nextec\assinador.json`. Na primeira execução pergunta o caminho da chave cifrada e salva.
2. Pede ao painel a versão pendente (`GET /api/admin/nextec/updates`) e o pedido de assinatura (`POST /api/admin/nextec/updates/sign-request`).
3. Baixa os pacotes da rota pública do painel e confere SHA-256, tamanho, produto, nome e versão. O assinador existente repete a conferência (MSI e DEB).
4. Pede a senha com `Read-Host -AsSecureString`, só nesta janela. Três tentativas, sem reservar nova sequência.
5. Assina com `assinar-pedido-connect.py` (RSA PKCS#1 v1.5 SHA-256, anti-replay local), verifica contra a chave pública e envia manifesto e assinatura (`POST .../updates/signature`).
6. Relê o painel e confirma que a versão aparece como autorizada.

Parâmetros úteis: `-Versao 2.0.9` (versão específica), `-SemEnviar` (só assina), `-Reconfigurar` (trocar o caminho da chave).

## Caminho da chave

A chave pública confiável (ID `8cb5b1d7f80d20cb`) confere com `C:\Users\Leonam Daris\.nextec\nextec-atualizador-publica.pem`. O par privado fica no mesmo diretório, com o nome `nextec-atualizador-privada.pem`. O caminho é só uma indicação; o script nunca lê o conteúdo para exibir e recusa chave sem senha.

## Sessão do painel

O painel fica atrás do Cloudflare Access (Entra) e a API usa o cabeçalho `api-token`. O login do painel é Entra (OIDC), sem fluxo de senha para script; a primeira execução pede dois valores da sua sessão já aberta no navegador:

- `access_token`: DevTools, aba Application, Local Storage do painel.
- `CF_Authorization`: DevTools, aba Application, Cookies do painel (vale cerca de um dia).

Eles ficam em `%LOCALAPPDATA%\Nextec\assinador-sessao.xml`, protegidos por DPAPI (só este usuário Windows neste computador). Se expirarem, o script apaga o arquivo e pede de novo.

Alternativa sem sessão: baixe o pedido no painel (Autorizar, Baixar pedido de assinatura) e rode com `-Pedido .\pedido-connect-2.0.9.json -Msi .\nextec-acesso-2.0.9.msi`. O script assina e deixa os dois arquivos em `Documentos\Nextec\Connect\Releases`.

## Por que assim

- Cloudflare Access exige identidade interativa; `cloudflared` não está instalado e uma política de service token em `/api/admin` abriria a administração a um segredo estático. Reaproveitar a sessão já autenticada do operador não cria acesso novo.
- Evolução recomendada: um botão "Assinar" no painel que chame o script por ponte local `127.0.0.1` com nonce, eliminando a cópia de valores.

## Testes

```powershell
python -I nextec\atualizacao\assinador\test_assinar_versao.py
```

Usam painel falso em `127.0.0.1`, chave RSA descartável e `.deb` sintético, em pasta temporária. Não tocam a chave real, o painel real nem o contador local.

## Proposta (não implementada): botão Assinar com ponte local

Hoje o operador roda `Assinar-Versao.ps1` no terminal. A ideia é um botão **Assinar** na tela de Atualizações do painel, sem a chave
nem a senha saírem do computador do operador.

- **Ponte local:** um pequeno serviço do assinador escutando só em `127.0.0.1` (porta fixa, ex. 47821), iniciado sob demanda pelo
  protocolo `nextec-assinar://` ou por um atalho. O painel (HTTPS) chama `http://127.0.0.1` com `fetch`; navegadores tratam
  localhost como contexto confiável, então não há bloqueio de conteúdo misto.
- **Segurança:** CORS só para a origem do painel, token aleatório de uso único gerado pela ponte e confirmado numa janela local
  (o operador digita a senha da chave nessa janela, nunca no navegador). A ponte repete as conferências do assinador (SHA-256,
  tamanho, produto, versão), mantém o anti-replay e recusa qualquer pedido que não venha do painel configurado.
- **Fluxo:** botão Assinar, o painel pede a ponte, a ponte baixa o pedido (`sign-request`), assina, envia a assinatura
  (`updates/signature`) e o painel relê a versão como autorizada.
- **Pendências antes de implementar:** decidir distribuição da ponte (instalada com o assinador), política de porta ocupada e
  revisão de segurança (DNS rebinding: validar `Host`, `Origin` e o token).
