#!/usr/bin/env bash
# Backup cifrado dos dados do painel Nextec (cofre de senhas, chave do servidor de ID, banco e configurações).
#
# Por que: a chave do cofre (data/nextec-vault.key) cifra TODAS as senhas guardadas e assina as credenciais de inscrição.
# Perdida, as senhas ficam ilegíveis e todo instalador distribuído deixa de valer. Backup só na VPS não protege da VPS.
#
# Uso:
#   BACKUP_PASSFILE=/root/.nextec-backup-pass  ./backup-cofre.sh  [destino]
#   (destino: pasta local ou ponto de montagem de outro servidor/nuvem; padrão /root/backups-nextec)
#   Para mandar para fora da VPS: monte o destino (rclone mount, NFS, SMB) ou rode depois `rclone copy`/`scp` no arquivo gerado.
#
# A senha do backup vem de um ARQUIVO (BACKUP_PASSFILE, permissão 600), nunca da linha de comando nem do ambiente.
# Guarde essa senha no cofre da Nextec: sem ela o backup não abre. Agendar (todo dia às 02:30):
#   (crontab -l 2>/dev/null; echo '30 2 * * * BACKUP_PASSFILE=/root/.nextec-backup-pass /opt/rustdesk-nextec/backup-cofre.sh >> /var/log/nextec-backup.log 2>&1') | crontab -
# Restaurar: ver nextec/deploy/BACKUP.md
set -euo pipefail
umask 077

PASTA="${PASTA:-/opt/rustdesk-nextec}"
DESTINO="${1:-${DESTINO:-/root/backups-nextec}}"
MANTER="${MANTER:-14}"
SENHA_ARQ="${BACKUP_PASSFILE:-}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*"; }
falha() { log "ERRO: $*"; exit 1; }

[ -n "$SENHA_ARQ" ] && [ -f "$SENHA_ARQ" ] || falha "defina BACKUP_PASSFILE com o caminho de um arquivo com a senha do backup (permissão 600)."
modo=$(stat -c '%a' "$SENHA_ARQ" 2>/dev/null || echo 000)
[ "$modo" = "600" ] || [ "$modo" = "400" ] || falha "$SENHA_ARQ precisa ter permissão 600 (atual $modo)."
[ -s "$SENHA_ARQ" ] || falha "$SENHA_ARQ está vazio."
[ -d "$PASTA/data" ] || falha "pasta de dados não encontrada: $PASTA/data"
command -v openssl >/dev/null || falha "openssl não encontrado."
mkdir -p "$DESTINO"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
stage="$tmp/nextec-backup"; mkdir -p "$stage"

# Banco consistente: sempre pela API de backup do SQLite (sqlite3 .backup ou python3 sqlite3.backup), que copia uma
# fotografia coerente inclusive do que ainda está no WAL, com a API escrevendo ao mesmo tempo. Copiar o arquivo e o -wal
# com cp pode pegar os dois em momentos diferentes e gerar um backup corrompido: por isso não há cópia "simples".
sqlite_ferramenta() {
  if command -v sqlite3 >/dev/null; then echo sqlite3
  elif command -v python3 >/dev/null && python3 -c 'import sqlite3' 2>/dev/null; then echo python3
  else echo ''; fi
}
copiar_banco() {
  local origem="$1" destino="$stage/$(basename "$1")" ferramenta resultado
  ferramenta=$(sqlite_ferramenta)
  case "$ferramenta" in
    sqlite3) sqlite3 -cmd '.timeout 30000' "$origem" ".backup '$destino'" ;;
    python3) python3 - "$origem" "$destino" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1], timeout=30)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
PY
    ;;
    *) falha "sem sqlite3 nem python3 para copiar o banco com consistência (apt install sqlite3). Nada foi gravado." ;;
  esac
  [ -s "$destino" ] || falha "a cópia do banco $(basename "$origem") saiu vazia."
  if [ "$ferramenta" = sqlite3 ]; then
    resultado=$(sqlite3 "$destino" 'PRAGMA integrity_check;' 2>&1 | head -1)
  else
    resultado=$(python3 -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("PRAGMA integrity_check").fetchone()[0])' "$destino" 2>&1 | head -1)
  fi
  [ "$resultado" = ok ] || falha "a cópia do banco $(basename "$origem") não passou no integrity_check: $resultado"
  bancos=$((bancos + 1))
}

for f in "$PASTA"/data/id_ed25519 "$PASTA"/data/id_ed25519.pub "$PASTA"/data/nextec-vault.key "$PASTA"/data/nextec-settings.json; do
  [ -f "$f" ] && cp -p "$f" "$stage/" || true
done
bancos=0
for db in "$PASTA"/data/db_v2.sqlite3 "$PASTA"/data/*.sqlite3; do
  if [ -f "$db" ] && [ ! -f "$stage/$(basename "$db")" ]; then copiar_banco "$db"; fi
done
# sem banco o backup nao serve para restaurar o painel: falha em vez de dizer "ok"
[ "$bancos" -gt 0 ] || falha "nenhum banco (*.sqlite3) em $PASTA/data: confira PASTA. Nada foi gravado."

# arquivos de atualização publicados e configurações da API, se existirem
for d in updates conf; do [ -d "$PASTA/data/$d" ] && cp -a "$PASTA/data/$d" "$stage/" || true; done
[ -d "$PASTA/api" ] && cp -a "$PASTA/api" "$stage/api" || true
cp -p "$PASTA"/.env "$stage/" 2>/dev/null || true

# sem a chave do cofre as senhas do backup sao ilegiveis: so segue se ela vier pela variavel NEXTEC_VAULT_KEY no .env salvo
if [ ! -f "$stage/nextec-vault.key" ]; then
  if [ -f "$stage/.env" ] && grep -q '^NEXTEC_VAULT_KEY=.' "$stage/.env"; then
    log "AVISO: sem data/nextec-vault.key; a chave do cofre vai no .env (NEXTEC_VAULT_KEY)."
  else
    falha "sem data/nextec-vault.key e sem NEXTEC_VAULT_KEY no .env: o backup não abriria as senhas do cofre. Nada foi gravado."
  fi
fi
[ -n "$(ls -A "$stage")" ] || falha "nada para copiar."

nome="nextec-backup-$(date +%F-%H%M).tar.gz.enc"
tar czf "$tmp/dados.tgz" -C "$tmp" nextec-backup
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$tmp/dados.tgz" -out "$DESTINO/$nome" -pass "file:$SENHA_ARQ"
( cd "$DESTINO" && sha256sum "$nome" > "$nome.sha256" )
tamanho=$(du -h "$DESTINO/$nome" | cut -f1)

# confere que abre antes de apagar os antigos
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$DESTINO/$nome" -pass "file:$SENHA_ARQ" | tar tz >/dev/null || falha "o backup gerado não abre: mantendo os anteriores."
log "Backup ok: $DESTINO/$nome ($tamanho)"

ls -1t "$DESTINO"/nextec-backup-*.tar.gz.enc 2>/dev/null | tail -n +"$((MANTER + 1))" | while read -r antigo; do
  rm -f "$antigo" "$antigo.sha256"; log "Removido backup antigo: $(basename "$antigo")"
done
