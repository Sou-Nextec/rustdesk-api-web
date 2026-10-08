# Implantar o servidor Nextec (vindo do rustdesk/rustdesk-server oficial)

A imagem Nextec roda hbbs, hbbr, a API e o painel em um contêiner só. A migração reaproveita a pasta de dados do servidor atual, então **a chave pública continua a mesma** e os apps já instalados não precisam de nenhuma mudança.

## 0. Antes

- A imagem `ghcr.io/sou-nextec/rustdesk-server` precisa estar publicada (GitHub Actions "Imagem Nextec", disparado por uma tag `v*`).
- Se o pacote no GHCR estiver privado, rode no servidor `docker login ghcr.io` com um token do GitHub com permissão `read:packages`.
- Escolha um horário de baixo uso: o acesso remoto fica fora do ar por cerca de um minuto.

## 1. Conferir o servidor atual

Na pasta do compose atual (ex.: `/opt/rustdesk`):

```bash
docker compose config
ls -la ./data
```

A pasta de dados precisa ter `id_ed25519`, `id_ed25519.pub` e `db_v2.sqlite3`. Anote o caminho dela.

## 2. Backup

```bash
cd /opt
sudo tar czf rustdesk-backup-$(date +%Y%m%d-%H%M).tgz rustdesk
```

## 3. Preparar a pasta nova

```bash
sudo mkdir -p /opt/rustdesk-nextec/api
cd /opt/rustdesk-nextec
sudo curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/Sou-Nextec/rustdesk-api-web/master/nextec/deploy/docker-compose.yml
sudo nano docker-compose.yml
```

No arquivo: troque `SEU_HOST` pelo IP ou domínio que os apps usam hoje, e aponte o volume `/data` para a pasta de dados do passo 1.

```bash
docker compose pull
```

## 4. Trocar

```bash
cd /opt/rustdesk && docker compose down
cd /opt/rustdesk-nextec && docker compose up -d
docker compose logs rustdesk | grep -i -A2 "admin"
```

O log mostra a senha inicial do usuário `admin` do painel. Troque logo no primeiro acesso.

## 5. Conferir

- Painel: `http://SEU_HOST:21114/_admin`. Em Ajustes do servidor > Dados do servidor, a chave pública tem que ser **a mesma** de antes (`cat /pasta/de/dados/id_ed25519.pub`).
- Um app RustDesk já configurado conecta normalmente.
- Para os apps aparecerem em Dispositivos e usarem as listas, configure neles o Servidor de API `http://SEU_HOST:21114`.

## 6. Voltar atrás (se precisar)

```bash
cd /opt/rustdesk-nextec && docker compose down
cd /opt/rustdesk && docker compose up -d
```

A pasta de dados não é alterada de forma incompatível; o servidor antigo volta como estava.

## Segurança

- A porta 21114 expõe o painel. O ideal é publicá-la atrás de um proxy com HTTPS (ex.: `https://acesso.seudominio`) e liberar só 21115 a 21119 direto. Com HTTPS, ajuste `RUSTDESK_API_RUSTDESK_API_SERVER` para o endereço https.
- Para usar outra chave já existente, troque os dois arquivos `id_ed25519` e `id_ed25519.pub` na pasta de dados e reinicie. Nunca só o `.pub`.
