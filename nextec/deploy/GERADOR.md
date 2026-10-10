# Gerador de clientes na stack (`/gerador`)

O rdgen roda como serviço `rdgen` da stack do Portainer e responde em `https://painel-remoto.nex.tec.br/gerador`.
Ele não compila nada: dispara o build no GitHub Actions (repositório `Sou-Nextec/rdgen`, 30 a 45 min) e recebe o resultado.
O formulário já vem com servidor, chave pública, API, links, empresa, ícone e logo da Nextec (campos travados), só Windows e Linux.

A imagem é `ghcr.io/sou-nextec/rdgen-nextec`, publicada pelo repositório `Sou-Nextec/rdgen` a cada mudança no app.

## 1. Variáveis no Portainer (stack do painel > Environment variables)

| Variável | Valor |
|---|---|
| `GERADOR_GH_USER` | `Sou-Nextec` (opcional, é o padrão) |
| `GERADOR_GH_TOKEN` | o mesmo token do GitHub que o rdgen usa hoje (`GHBEARER` do compose antigo) |
| `GERADOR_ZIP_SENHA` | o mesmo `ZIP_PASSWORD` do compose antigo (tem que ser igual ao segredo `ZIP_PASSWORD` do repositório `rdgen`) |
| `GERADOR_SECRET_KEY` | opcional: deixe vazia e o gerador cria uma chave aleatória e guarda no volume |
| `GERADOR_SH_SECRET` | o mesmo `SH_SECRET` do compose antigo, ou qualquer texto longo |

Para ver os valores atuais no servidor antigo (não cole em chat nem em issue):

```bash
cd /caminho/do/rdgen && grep -E 'GHUSER|GHBEARER|ZIP_PASSWORD|SECRET_KEY|SH_SECRET' docker-compose.yml
```

Se alguma obrigatória faltar, a página `/gerador/` mostra exatamente o que falta (em vez de erro genérico).

## 2. Túnel da Cloudflare (Zero Trust > Networks > Tunnels > o túnel do painel > Public hostnames)

Adicione um hostname **acima** do que já existe para o painel:

| Campo | Valor |
|---|---|
| Subdomain / Domain | `painel-remoto` / `nex.tec.br` |
| Path | `gerador` |
| Service | `HTTP` e `rdgen:8000` |

O hostname do painel (sem path, `rustdesk:21114`) fica abaixo. A ordem importa: o mais específico vem primeiro.

## 3. Cloudflare Access

O formulário fica atrás do login (Entra), como o painel. As chamadas do GitHub Actions precisam passar sem login
(elas têm segredo próprio):

1. **Aplicação protegida:** em Access > Applications, adicione o caminho `painel-remoto.nex.tec.br/gerador` à aplicação do painel
   (ou crie outra com a mesma política do Entra).
2. **Bypass das chamadas do GitHub:** crie uma aplicação com a política **Bypass** (Everyone) para estes caminhos do mesmo hostname:
   - `painel-remoto.nex.tec.br/gerador/cleanzip`
   - `painel-remoto.nex.tec.br/gerador/save_custom_client`
   - `painel-remoto.nex.tec.br/gerador/get_png`
   - `painel-remoto.nex.tec.br/gerador/get_zip`
3. Nada de `/gerador/api/*`, `/gerador/generator`, `/gerador/download` nem `/gerador/updategh` no bypass
   (o status do build é lido da API do GitHub; o `updategh` não é usado).

### Por que o bypass é seguro o suficiente
Essas 4 rotas são chamadas pelo GitHub Actions, que não faz login no Entra. Elas se protegem sozinhas:
- `save_custom_client` exige o token do build (vem dentro do pacote cifrado, o workflow devolve em `Authorization: Bearer`) e limita o tamanho.
- `cleanzip` e `get_zip` só aceitam o nome exato `secrets_<uuid do build>.zip`.
- `get_png` exige o uuid do build e só entrega logo e ícone.
- O pacote `secrets_<uuid>.zip` é cifrado com `ZIP_PASSWORD`: use um valor longo e aleatório (64+ caracteres).
  Para conferir o tamanho no servidor antigo, sem mostrar o valor: `sudo docker exec rdgen sh -c 'printf %s "$ZIP_PASSWORD" | wc -c'`.
- Evite "senha permanente" no formulário: ela vai dentro desse pacote.

## 4. Segredo `GENURL` no GitHub

Em `Sou-Nextec/rdgen` > Settings > Secrets and variables > Actions, o segredo `GENURL` passa a ser
`https://painel-remoto.nex.tec.br/gerador`. Troque só depois de a stack estar no ar (os builds em andamento usam o
endereço antigo).

## 5. Subir

Portainer > a stack > **Pull and redeploy**. Confira:

```bash
docker logs rdgen --tail 20
```

e abra `https://painel-remoto.nex.tec.br/gerador/`. Gere um cliente de teste (Windows, nome `Teste-Nextec`).

## Depois que estiver funcionando

- Desligue o rdgen e o `frpc` do servidor antigo.
- Se o pacote `rdgen-nextec` estiver privado no GHCR, o servidor precisa de `docker login ghcr.io` com um token `read:packages`
  (o mesmo que já baixa a imagem do painel).

## Diagnóstico

| Sintoma | Causa e o que fazer |
|---|---|
| `/gerador/` mostra "O gerador ainda não está configurado" e o contêiner fica `unhealthy` | Falta variável no Portainer (o aviso lista quais). Defina e faça Pull and redeploy |
| `unhealthy` e a página dá 500 | Rode o comando de traceback do `NEXTEC.md` (repositório `rdgen`, seção "Desenvolver e testar") |
| 502 em `/gerador/` | A rota do túnel aponta para um serviço que não existe ou o `rdgen` não subiu: `docker logs rdgen --tail 50` |
| Build no GitHub termina mas o cliente não aparece | `GENURL` do repositório errado, ou `ZIP_PASSWORD` do GitHub diferente de `GERADOR_ZIP_SENHA` |
| App gerado fica "Não está pronto" | Porta do servidor de ID 21117 a 21119 (o gerador novo recusa) ou UDP 21116 bloqueado |
| Antivírus remove o instalador | Liberar por hash ou caminho; solução definitiva é assinatura digital |

O `atualizar-servidor.sh` do repositório `rdgen` serve só ao servidor antigo e some junto com ele.
