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
| `package.json` e `package-lock.json` | dependência `@fontsource/open-sans` |

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
