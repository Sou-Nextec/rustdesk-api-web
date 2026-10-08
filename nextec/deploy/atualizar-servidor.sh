#!/usr/bin/env bash
# Atualiza o servidor RustDesk Nextec para a imagem mais nova (:latest), com backup e volta automática.
# Uso:  ./atualizar-servidor.sh            (atualiza só se houver imagem nova)
# Agendar (todo dia às 03:30):
#   (crontab -l 2>/dev/null; echo '30 3 * * * /opt/rustdesk-nextec/atualizar-servidor.sh >> /var/log/rustdesk-atualizacao.log 2>&1') | crontab -
# Atenção: reiniciar o contêiner derruba as sessões de acesso remoto em andamento (cerca de 30 segundos).
set -euo pipefail

PASTA="${PASTA:-/opt/rustdesk-nextec}"
SERVICO="${SERVICO:-rustdesk}"
BACKUPS="${BACKUPS:-/root/backups}"
cd "$PASTA"
data() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "$(data)  $*"; }

anterior=$(docker inspect -f '{{.Image}}' "$SERVICO" 2>/dev/null || true)
log "Verificando imagem nova..."
docker compose pull "$SERVICO" >/dev/null
imagem=$(docker compose config --images | grep -m1 rustdesk-nextec)
novo=$(docker image inspect -f '{{.Id}}' "$imagem")

if [ "$anterior" = "$novo" ]; then log "Já está na imagem mais recente."; exit 0; fi

mkdir -p "$BACKUPS"
arq="$BACKUPS/antes-da-atualizacao-$(date +%F-%H%M).tgz"
tar czf "$arq" -C "$PASTA" data api .env docker-compose.yml
find "$BACKUPS" -name 'antes-da-atualizacao-*.tgz' -mtime +14 -delete
log "Backup: $arq"

log "Atualizando $SERVICO..."
docker compose up -d "$SERVICO"

saudavel=0
for i in $(seq 1 40); do
  estado=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$SERVICO" 2>/dev/null || echo ausente)
  if [ "$estado" = "healthy" ] || [ "$estado" = "running" ]; then saudavel=1; break; fi
  sleep 3
done

if [ "$saudavel" = "1" ]; then
  log "OK: atualizado."
  docker image prune -f >/dev/null || true
  exit 0
fi

log "ERRO: o contêiner não ficou saudável. Voltando para a versão anterior."
if [ -n "$anterior" ]; then
  docker tag "$anterior" "$imagem"
  docker compose up -d "$SERVICO"
  log "Versão anterior restaurada. Veja: docker compose logs --tail 80 $SERVICO"
fi
exit 1
