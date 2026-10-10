# Continuar o projeto (leia isto primeiro)

Ponto de entrada para quem assume o projeto (pessoa ou IA). Resume o mapa, o estado atual, como trabalhar e o que falta.
Documentos de detalhe estão listados na seção "Onde está cada documentação". Nada aqui contém segredo: tokens, senhas e
chaves ficam no Portainer e nos segredos do GitHub, e nunca devem ser colados em chat, issue ou arquivo.

Atualizado em 10/10/2026 (painel v2.9.3).

## 1. O que é

Plataforma de acesso remoto da Nextec (MSP) baseada no RustDesk, em três peças, cada uma um fork com mudanças pequenas e
isoladas, para continuar recebendo as atualizações do projeto original:

| Peça | Repositório (GitHub) | Pasta local | Upstream | Imagem |
| --- | --- | --- | --- | --- |
| Painel (telas), stack, instalador e patches da API | `Sou-Nextec/rustdesk-api-web` | `...\RustyDesk Admin\rustdesk-api-web` | `lejianwen/rustdesk-api-web` | `ghcr.io/sou-nextec/rustdesk-nextec` |
| API em Go (onde nascem os patches) | `Sou-Nextec/rustdesk-api` | `...\RustyDesk Admin\rustdesk-api` | `lejianwen/rustdesk-api` | (compilada dentro da imagem do painel) |
| Gerador de clientes (rdgen) | `Sou-Nextec/rdgen` | `...\RustyDesk Admin\rdgen` | `bryangerlach/rdgen` | `ghcr.io/sou-nextec/rdgen-nextec` |

`...` = `C:\Users\Leonam Daris\Documents\Projetos Programacao`.

O hbbs/hbbr (servidor de ID e relay) usa a imagem oficial `lejianwen/rustdesk-server-s6:v0.1.2`, fixa de propósito.

Pastas locais fora dos repositórios, dentro de `RustyDesk Admin`: `implantacao-remoto` (material de implantação anterior),
`clientes-gerados` (executáveis gerados pelo rdgen, para teste; não versionar) e `backupsdgen-backup` (cópia do volume `exe`
do rdgen antigo; pode conter dados sensíveis, não versionar).

## 2. Onde roda

| Item | Detalhe |
| --- | --- |
| Produção | VPS **NXT-SRV-APP-03** (179.199.152.56, Ubuntu, Hostinger), pasta de dados `/opt/rustdesk-nextec`. Acesso: `ssh app03` (alias no `~/.ssh/config`, chave do agente SSH do Bitwarden, usuário `leonam_daris` com sudo, nunca root) |
| Stack | `rustdesk_nextec_prod` no Portainer (que roda em outra máquina). Fonte: `nextec/deploy/portainer-stack.yml` na `master`, referência `refs/heads/master`, autenticação desligada (repositório público) |
| Serviços da stack | `servidor` (hbbs/hbbr), `rustdesk` (painel e API), `rdgen` (gerador), `cloudflared` (túnel) |
| Endereços | Painel `https://painel-remoto.nex.tec.br`; servidor de ID/relay `remoto.nex.tec.br` (DNS sem proxy, portas 21115 a 21119); gerador `https://painel-remoto.nex.tec.br/gerador` |
| Cloudflare | Túnel por token (variável `TUNNEL_TOKEN`). Access com Entra protege `/_admin` e `/api/admin` (e `/gerador`, ver `nextec/deploy/GERADOR.md`) |
| Servidor antigo | Ainda roda o rdgen antigo (container `rdgen`, imagem `nextec/rdgen:master`, porta 8090, `frpc` quebrado). Sai de produção quando o gerador novo estiver validado |

Variáveis da stack (Portainer > stack > Environment variables): `TUNNEL_TOKEN`, `DOMINIO`, `URL_PAINEL`, `PASTA_DADOS` e as
`GERADOR_*`. A lista completa e o significado estão no cabeçalho de `nextec/deploy/portainer-stack.yml`.

## 3. Como publicar uma mudança

1. Branch a partir da `master`, mudança pequena, PR (o histórico de PRs é intencional: mantenha).
2. Painel: mexer em `src/`, `nextec/`, `CHANGELOG.md` e `nextec/VERSION` (formato `x.y.z`; `x.y.0` abre as Novidades sozinho).
3. Merge na `master` do `rustdesk-api-web` dispara o workflow **Imagem Nextec**: constrói, roda teste de fumaça, publica no GHCR e
   aciona o webhook do Portainer. Mudanças só em `nextec/deploy/**`, `nextec/atualizacao/**` ou `**.md` **não** disparam: para
   `nextec/deploy/**` é preciso clicar em **Pull and redeploy** na stack do Portainer.
4. Patch da API: desenvolver no repositório `rustdesk-api` (branch própria), `git diff HEAD~1 HEAD >
   ../rustdesk-api-web/nextec/backend/00NN-nome.patch`, documentar em `nextec/backend/LEIAME.md`. Conferir que o conjunto aplica na
   base: worktree em `v2.6.29` e `git apply nextec/backend/0*.patch` (o `--check` com vários arquivos dá falso erro).
5. Gerador: PR em `Sou-Nextec/rdgen`; o workflow **Imagem Nextec do gerador** publica `rdgen-nextec`. O servidor busca com
   **Pull and redeploy** (`pull_policy: always`).
6. Docker Hub às vezes responde 429/timeout e derruba o build: `gh run rerun <id> --failed`.

## 4. Testes

- API (Go): `docker run --rm -v <pasta rustdesk-api>:/src -w /src golang:1.23-alpine sh -c 'apk add -q gcc musl-dev; CGO_ENABLED=1 go test ./service -count=1'`.
- Gerador (Django): `docker build -t rdgen-nextec:t . && docker run --rm rdgen-nextec:t python manage.py test rdgenerator`.
- Painel: `npx vite build` e `npm run dev` para olhar as telas (largura de 390 px e 1440 px; escuro e claro).
- Regressão ponta a ponta (cofre, agente, suporte, atualizações, controle, fila, IDs): scripts PowerShell em `nextec/testes/`
  contra um contêiner local descartável (instruções em `nextec/testes/LEIAME.md`). Rode os que tocam a área alterada.

## 5. Armadilhas conhecidas

- **Windows e fim de linha:** `core.autocrlf=true`. Para commitar arquivos LF (`.sh`, workflows, Dockerfile) use
  `git -c core.autocrlf=false commit`. Cuidado com `git add -A` no repositório do painel: já entrou lixo de teste uma vez
  (`test-results/` agora é ignorado).
- **PowerShell:** `.ps1` precisa de UTF-8 com BOM e ser validado no PowerShell 5.1, senão acento quebra o parse.
  Em `Generic.List`, use `.ToArray()` em vez de `@($lista)`.
- **Push no Windows:** o gerenciador de credenciais trava; use
  `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`.
- **Porta do servidor de ID no gerador:** nunca 21117 a 21119 (o app fica "Não está pronto"). O gerador novo já recusa.
- **Nome do app:** só letras sem acento, números e hífen (`Nextec-Connect`); o instalador do RustDesk recusa o resto.
- **Comandos do hbbs (Ajustes do servidor):** o hbbs só aceita comandos de `127.0.0.1`. Na stack, o contêiner `servidor` roda um
  encaminhador (`nc`, portas internas 21125 e 21127) e o painel usa `NEXTEC_SERVER_CMD_HOST=servidor` (patch 0018). Não use
  `network_mode: service:servidor`: reiniciar o servidor deixa o painel sem rede até recriá-lo (testado).
- **Antivírus:** Acronis EDR bloqueia executáveis de acesso remoto sem assinatura (`ML:Generic.MaliciousExe`). Solução definitiva
  é assinatura digital (adiada por custo); até lá, liberar por hash, processo ou caminho.
- **Segredos:** nunca em chat. O `GERADOR_ZIP_SENHA` precisa ser igual ao segredo `ZIP_PASSWORD` do repositório `rdgen`.

## 6. Estado atual (10/10/2026)

Entregue e em produção:
- Painel v2.9.1: cofre de senhas, atualizações do app com piloto, suporte avulso, políticas e sessões, relatório mensal, fila de
  atendimento, acesso rápido, instalação por cliente, tabelas em cartões no celular, máscara de ID, avisos de erro em português.
- API com patches 0001 a 0018 (`nextec/backend/LEIAME.md`).
- Gerador: imagem publicada, rodando na stack do app03, endurecido (token por build, `cleanzip` e `get_zip` com nomes exatos),
  só Windows e Linux, padrões Nextec travados (`NX_*`), ícone e logo Nextec, `SECRET_KEY` automática, aviso de configuração.

Em andamento (falta o dono do ambiente fazer; passo a passo em `nextec/deploy/GERADOR.md`):
1. Definir `GERADOR_GH_TOKEN`, `GERADOR_ZIP_SENHA` e `GERADOR_SH_SECRET` no Portainer (valores do compose do servidor antigo)
   e fazer **Pull and redeploy**. Enquanto faltarem, `/gerador/` mostra "O gerador ainda não está configurado" e o contêiner fica
   `unhealthy` (esperado).
2. Rota `/gerador` no túnel (hostname `painel-remoto.nex.tec.br`, path `gerador`, serviço `http://rdgen:8000`, acima do hostname do painel).
3. Access: proteger `/gerador`; Bypass só de `cleanzip`, `save_custom_client`, `get_png`, `get_zip`.
4. Segredo `GENURL` do repositório `rdgen` = `https://painel-remoto.nex.tec.br/gerador` (só depois de o gerador estar no ar).
5. Gerar um cliente de teste (`Teste-Nextec`), instalar, conferir "Pronto" e a conexão; só então desligar o rdgen antigo.
6. Acesso `ssh app03`: copiar a chave para o usuário `leonam_daris` (hoje a chave só entra como root).

## 7. Próximos passos sugeridos

Em ordem (detalhes em `nextec/PENDENCIAS.md`):
1. Fechar a migração do gerador (itens acima) e remover o rdgen e o `frpc` do servidor antigo.
2. Gerador, fase 2: "modo simples" (plataforma, nome do cliente e senha; "Avançado" para o resto).
3. Gerador, fase 3: o botão "Gerar cliente" (menu Dispositivos, v2.9.3) já abre o gerador; falta publicar o resultado em Atualizações automaticamente.
4. Gerador, fase 4: opção "só MSI" e cache do Flutter/Rust nos workflows (hoje 30 a 45 min por build).
5. Backup fora da VPS (`data/`, `api/` e volumes do gerador), Docker Hub autenticado no GitHub, assinatura digital.

## 8. Onde está cada documentação

| Assunto | Arquivo |
| --- | --- |
| Visão do painel e o que é nosso por arquivo | `README.nextec.md` |
| Pendências e ideias | `nextec/PENDENCIAS.md` |
| Novidades por versão | `CHANGELOG.md` |
| Patches da API (0001 a 0017) | `nextec/backend/LEIAME.md` |
| Implantar o servidor do zero | `nextec/deploy/IMPLANTAR.md` |
| Gerador na stack, túnel, Access, diagnóstico | `nextec/deploy/GERADOR.md` |
| Fork do gerador (variáveis `NX_*`, segurança, CI) | `NEXTEC.md` no repositório `rdgen` |
| Instalador e agentes nos clientes | `nextec/atualizacao/` |
| Testes de regressão do backend | `nextec/testes/LEIAME.md` |

## 9. Preferências do dono do projeto

Respostas em português do Brasil, curtas e estruturadas; sem travessão (nem meia-risca) em chat e documentos; nunca pedir
segredos no chat; confirmar antes de ações irreversíveis ou que afetam produção; manter histórico de PRs; entregar análises e
planos no próprio chat em Markdown (não como arquivo publicado).
