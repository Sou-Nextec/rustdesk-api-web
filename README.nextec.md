# Painel Nextec (fork de rustdesk-api-web)

Camada visual da Nextec sobre o painel web do [lejianwen/rustdesk-api](https://github.com/lejianwen/rustdesk-api).
O motor (hbbs, hbbr e API) continua sendo o original. Este fork só troca o painel e acrescenta o pt-BR.

O `README.md` do upstream recebeu só uma linha de apontamento no topo para este arquivo.

## O que é nosso e onde está

Tudo que é da Nextec fica em arquivos próprios:

| Caminho | O que é |
| --- | --- |
| `src/nextec/index.js` | Ponto de entrada da personalização (1 import em `src/main.js`) |
| `src/nextec/theme.scss` | Cores, fontes, menu, cabeçalho, login e ajustes do Element Plus |
| `src/nextec/routes.js` | Agrupamento do menu e títulos de Minha conta (sem editar `src/router/index.js`) |
| `src/nextec/labels.js` | Tradução de textos fixos no upstream (colunas, rótulos, mensagens de validação do servidor) |
| `src/nextec/table-column.js` | Limita a largura da coluna Ações, que no upstream espreme as outras colunas |
| `src/nextec/button.js` | Ajusta botões do upstream: Adicionar como ação principal, Filtrar e Importar neutros, Encerrar sessão em Sessões ativas |
| `src/nextec/views/NotFound.vue` | Página de endereço não encontrado da Nextec |
| `src/nextec/required-guard.js` | Bloqueia o envio de formulários com campo obrigatório vazio (o upstream não valida) |
| `nextec/conf/hello.html` | Boas-vindas de Meus dados em pt-BR (o padrão do upstream é em chinês) |
| `src/nextec/views/Home.vue` | Tela inicial com resumo |
| `src/nextec/views/ClientAccess.vue` | Permissões por cliente: uma lista `Cliente: <nome>` por cliente, compartilhada só com as equipes e pessoas escolhidas |
| `src/nextec/views/Topbar.vue` | Topo: pesquisa global de dispositivos (Ctrl+K), + Conectar por ID e botão de ajuda da tela (chaves `NxHelp<Rota>`) |
| `src/nextec/views/MyDevices.vue` e `MySaved.vue` | Meus dispositivos e Meus acessos salvos no padrão da tela Dispositivos |
| `src/nextec/list-page.scss` | Estilos compartilhados dessas listas |
| `src/nextec/views/MyShared.vue` | Clientes liberados: dispositivos das listas compartilhadas com o técnico, com situação online (patch 0003) |
| `src/nextec/views/Clients.vue` e `AccessFields.vue` | Clientes: árvore com subgrupos, subgrupos em lote, renomear em cascata e modelos de cliente (patch 0007) |
| `src/nextec/views/Secrets.vue`, `connect.js` e `nextec/atualizacao/Agente-Senha-Nextec.ps1` | Cofre de senhas: troca automática da senha do RustDesk em servidores (regra por grupo ou máquina), "Conectar" com um clique, ver senha e auditoria (patch 0008) |
| `src/nextec/views/Support.vue`, `WaitingList.vue` e `upload.js` | Suporte avulso: app de suporte para o link público /suporte e fila Aguardando atendimento (patch 0010) |
| `src/nextec/views/Policies.vue` e `Sessions.vue` | Políticas do app por cliente ou máquina (recebidas pelo app no heartbeat) e conexões ativas com desconectar (patch 0012) |
| `src/nextec/views/Report.vue` | Relatório mensal por cliente, chamado na conexão (connect.js), CSV e impressão (patch 0013) |
| `src/nextec/id.js` | Máscara de ID (`268 304 385` na tela, `268304385` ao copiar e salvar) |
| `src/nextec/mobile-tables.js` | No celular, cada linha de tabela vira um cartão com rótulos (classe `nx-m-cards`; CSS em theme.scss) |
| `nextec/PENDENCIAS.md` | Backlog do que foi visto na revisão de telas e ainda não foi feito |
| `src/nextec/views/Updates.vue` | Atualizações do app: envio do instalador, publicação (piloto, todos, suspender, voltar versão) e acompanhamento por máquina (patch 0009) |
| `src/nextec/views/QuickAccess.vue` e `quick-access.js` | Acesso rápido (favoritos e recentes, guardados no navegador) no Início e em Dispositivos |
| `src/nextec/version.js` e `nextec/VERSION` | Versão do painel (x.y.z): o workflow soma o commit e o painel mostra em Novidades (CHANGELOG.md) |
| `src/nextec/enter-submit.js` | Enter envia os diálogos (menos em textarea e seletores) |
| `src/nextec/views/ProfilePhoto.vue` | Foto de perfil (menu do usuário): recorta, reduz e envia; o app RustDesk mostra no lugar da inicial (patch 0004) |
| `src/nextec/api.js` | Endpoints que só existem com os patches da Nextec (chave do cliente web) |
| `src/nextec/assets/` | Logo e símbolo (PNG) |
| `src/nextec/fonts/` | Fontes Visby CF (`.woff2`, não versionadas) |
| `src/utils/i18n/pt_BR.json` | Tradução do painel |
| `nextec/i18n/pt_BR.toml` | Tradução das mensagens do backend |
| `nextec/docker/Dockerfile` | Imagem Nextec |
| `public/nextec/favicon.svg` | Favicon |

Arquivos do upstream que recebem edição mínima (qualquer merge futuro só precisa conferir estes):

| Arquivo | Mudança |
| --- | --- |
| `src/main.js` | locale do Element Plus em pt-BR, `import nextec from '@/nextec'` e `app.use(nextec)` |
| `src/utils/i18n.js` | registra `pt-BR` e usa o pt-BR como reserva de chave |
| `src/store/app.js` | idioma padrão `pt-BR`, locale do Element Plus, título `Nextec` |
| `index.html` | idioma, título, favicon |
| `src/views/peer/index.vue` | correção: opção "Sem grupo" no campo Grupo (antes mostrava "0") |
| `src/views/login/login.vue` | correção: exibe o código de verificação quando o servidor passa a exigi-lo após tentativas erradas (candidata a PR no upstream) |
| `src/views/oauth/index.vue` | Login externo: segredo sempre mascarado (vazio ao editar mantém o atual) e botão que preenche o modelo Microsoft Entra ID |
| `src/layout/components/header.vue` | inclui o `Topbar.vue` da Nextec (1 import e 1 tag) |
| `src/layout/components/setting/index.vue` | menu do usuário ganha Foto de perfil, Meus dados e Meus acessos ao painel; foto ao lado do nome |
| `package.json` e `package-lock.json` | dependência `@fontsource/open-sans` |

## Permissões por cliente

Menu Acesso dos técnicos > Permissões por cliente (só admin). Para cada cliente (grupo de dispositivos), o painel:

1. cria uma lista de acessos do admin chamada `Cliente: <nome do cliente>`;
2. coloca nela todos os dispositivos daquele cliente (botão Sincronizar traz os que entraram depois);
3. compartilha a lista só com as equipes e pessoas escolhidas (ver e conectar, ou também editar a lista).

No app RustDesk, cada técnico vê em Lista de endereços apenas os clientes liberados para ele. Isso controla a **visibilidade**: o servidor aberto não bloqueia uma conexão feita por quem já sabe o ID e a senha (esse bloqueio só existe no RustDesk Server Pro). Por isso, use senha permanente forte nas máquinas e guarde a senha só nas listas.

Tudo é feito com as APIs de listas e regras de compartilhamento do upstream, sem mudança no backend. Renomear a lista fora desta tela faz ela deixar de ser reconhecida.

## Cliente web (acesso pelo navegador)

Ajustes do servidor > Acesso pelo navegador: um interruptor liga e desliga na hora, para todos. A escolha fica gravada em `/app/data/nextec-settings.json` (volume de dados) e vale também depois de reiniciar ou recriar o contêiner, por cima de `RUSTDESK_API_APP_WEB_CLIENT`. Isso vem do patch `nextec/backend/0002-chaveador-cliente-web.patch` (endpoint `POST /api/admin/nextec/web-client`). Em servidor sem o patch, a tela mostra como fazer pela variável. O cliente web é o oficial do RustDesk e não recebe a marca Nextec.

## Login com Microsoft (login externo)

Em Segurança > Login externo > Adicionar > OIDC, o botão **Preencher para Microsoft Entra ID** pede a ID do diretório e preenche emissor, escopos e PKCE. Você informa a ID do aplicativo (Client ID) e o segredo. O segredo **nunca volta ao navegador** (patch 0004): ao editar, deixar em branco mantém o atual.
URI de redirecionamento no Entra: `https://<endereço do painel>/api/oidc/callback`. Com o Cloudflare Access na frente, esse caminho fica fora das rotas protegidas (`/_admin` e `/api/admin`). Para esconder o login por senha, `RUSTDESK_API_APP_DISABLE_PWD_LOGIN=true` no compose.

## Foto de perfil

No menu do usuário, **Foto de perfil**. A API (patch 0004) envia `display_name` e `avatar` (data URI) no login do app, e o RustDesk 1.4.x/1.5 mostra a foto na janela de permissão da sessão, no lugar da inicial. A foto exibida vem da conta logada na máquina de **quem conecta**.

## O que o técnico vê

Em Minha área > Clientes liberados, o técnico vê os dispositivos dos clientes liberados para ele ou para a equipe dele, com a situação online. O Início dele mostra esses clientes e os acessos salvos com online/offline. Isso vem do patch `nextec/backend/0003-listas-compartilhadas-no-painel.patch`, que só devolve o que a pessoa já enxerga no app e nunca a senha salva.

## Subgrupos de cliente

Um subgrupo é um grupo de dispositivos com o nome `Cliente / Subgrupo` (ex.: `Nextec / Servidores`), criado em Permissões por cliente > Mais ações > Novo subgrupo. Cada subgrupo tem a própria lista e o próprio acesso; quem acessa o cliente não vê o subgrupo, a menos que esteja liberado nele também. Em Dispositivos, filtrar pelo cliente mostra também os subgrupos.

## Desenvolvimento

Requer Node 20 ou superior.

```bash
npm ci
npm run dev
```

O servidor de desenvolvimento usa `.env.development` e faz proxy de `/api/admin` para `http://127.0.0.1:21114`.
Para apontar para outra API de teste, edite `VITE_SERVER_PATH` nesse arquivo (ou crie `.env.development.local` e ajuste o `vite.config.js` localmente).
Nunca aponte para o servidor de produção.

## Identidade visual

* Cores: `#0D0035` base, `#F4F4F4` neutro, `#5C50FF` destaque, `#4901FA` apoio e branco. As cores fortes aparecem só em destaques (botão principal, item ativo, ícones de resumo).
* Fontes: Visby CF nos títulos e Open Sans no corpo.
* Logo: `src/nextec/assets/logo-dark.png` (fundo claro, usado no login), `logo-light.png` (texto branco, reservado para fundo escuro), `mark.png` (símbolo do cabeçalho) e `public/nextec/favicon.png`. Para trocar, substitua os arquivos mantendo os nomes.
* Visby CF: copie `VisbyCF-Medium.woff2`, `VisbyCF-Bold.woff2` e `VisbyCF-ExtraBold.woff2` para `src/nextec/fonts/` antes do build. Sem eles, os títulos usam Open Sans.

## Sincronizar com o upstream

```bash
git remote add upstream https://github.com/lejianwen/rustdesk-api-web.git   # só na primeira vez
git fetch upstream
git checkout nextec/branding
git merge upstream/master
```

Depois do merge:

1. Resolva conflitos só nos arquivos da tabela "edição mínima".
2. Se o upstream trouxe textos novos, rode `npm run dev` e procure chaves sem tradução (aparecem em inglês ou como o nome da chave). Acrescente-as em `src/utils/i18n/pt_BR.json`.
3. Se o upstream trouxe telas novas, elas entram automaticamente no grupo **Servidor** do menu até você mapeá-las em `src/nextec/routes.js`.
4. Se mudou o texto de erro do backend, compare `nextec/i18n/pt_BR.toml` com o `en.toml` da nova imagem (`docker run --rm --entrypoint cat lejianwen/rustdesk-server-s6 /app/resources/i18n/en.toml`).

## Gerar a imagem Docker

A imagem parte de `lejianwen/rustdesk-server-s6`, substitui `/app/resources/admin` pelo painel Nextec e adiciona `/app/resources/i18n/pt_BR.toml`.

```bash
docker build -f nextec/docker/Dockerfile -t nextec/rustdesk-server-s6:dev .
```

Para fixar a versão do motor: `--build-arg BASE_TAG=<tag>`.

No `docker-compose.yml`, troque `image:` por `nextec/rustdesk-server-s6:dev` e defina `RUSTDESK_API_LANG=pt-BR` para que as mensagens do backend e os dados criados na primeira execução (como "Grupo padrão") saiam em português. Em bancos já criados, os nomes dos grupos padrão continuam como foram gravados e podem ser renomeados no painel.

## Correção na API (aplicada na imagem)

A imagem recompila a API (v2.6.29) com `nextec/backend/0001-admin-grava-campos-vazios.patch`, o mesmo enviado ao projeto original em https://github.com/lejianwen/rustdesk-api/pull/540:

* campos esvaziados nas telas de administração passam a ser gravados (antes o servidor mantinha o valor antigo);
* a API exige o ID no cadastro de dispositivo.

O cliente RustDesk e o LDAP continuam com o comportamento original. Quando o PR for aceito e publicado na imagem base, faça o build com `--build-arg NEXTEC_API_PATCH=0` (ou remova o estágio `api` do Dockerfile). Ao atualizar a imagem base, ajuste `API_TAG` para a versão dela: o build falha se as duas não baterem.
