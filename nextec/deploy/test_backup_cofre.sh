#!/usr/bin/env bash
# Regressao do backup-cofre.sh: sucesso so com tudo copiado; qualquer falha aborta sem gravar nem rotacionar.
set -uo pipefail
script="$(cd "$(dirname "$0")" && pwd)/backup-cofre.sh"
base=$(mktemp -d); trap 'rm -rf "$base"' EXIT
umask 077
echo "senha-de-teste-longa" > "$base/pass"
falhas=0
ok() { echo "PASS $1"; }
erro() { echo "FAIL $1"; falhas=$((falhas + 1)); }

montar() {
  P="$base/p$1"; mkdir -p "$P/data" "$P/api"
  echo -n segredo > "$P/data/nextec-vault.key"; echo priv > "$P/data/id_ed25519"; echo pub > "$P/data/id_ed25519.pub"
  echo '{}' > "$P/data/nextec-settings.json"; echo cfg > "$P/api/x.yml"
  sqlite3 "$P/data/db_v2.sqlite3" "PRAGMA journal_mode=WAL; create table t(x); insert into t values(1);" >/dev/null
}
rodar() { BACKUP_PASSFILE="$base/pass" PASTA="$P" PATH="${FAKEPATH:-}$PATH" "$script" "$1" >"$base/out" 2>&1; }
encs() { ls "$1"/*.enc 2>/dev/null | wc -l; }

# 1) caminho feliz: todos os arquivos dentro do pacote
montar 1; rodar "$base/d1"
if [ $? -eq 0 ] && [ "$(encs "$base/d1")" = 1 ]; then
  f=$(ls "$base/d1"/*.enc); mkdir "$base/r1"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$f" -pass "file:$base/pass" | tar xz -C "$base/r1"
  for x in id_ed25519 id_ed25519.pub nextec-vault.key nextec-settings.json db_v2.sqlite3 api/x.yml; do
    [ -e "$base/r1/nextec-backup/$x" ] || erro "faltou $x no backup"
  done
  ok "backup completo"
else erro "backup completo: $(tail -1 "$base/out")"; fi

# 2) cp falha num arquivo critico presente (id_ed25519): exit != 0 e nenhum arquivo gravado
montar 2; mkdir -p "$base/fake"
cat > "$base/fake/cp" <<'SH'
#!/usr/bin/env bash
for a in "$@"; do case "$a" in */id_ed25519) echo "cp: falha simulada" >&2; exit 1;; esac; done
exec /bin/cp "$@"
SH
chmod +x "$base/fake/cp"
FAKEPATH="$base/fake:" rodar "$base/d2"; rc=$?
if [ $rc -ne 0 ] && [ "$(encs "$base/d2")" = 0 ] && ! grep -q "Backup ok" "$base/out"; then ok "falha de cp em id_ed25519 aborta"; else erro "falha de cp em id_ed25519 (rc=$rc): $(tail -1 "$base/out")"; fi

# 3) cp falha numa pasta presente (api): aborta e nao rotaciona os backups anteriores
montar 3; rodar "$base/d3" >/dev/null; antes=$(encs "$base/d3")
cat > "$base/fake/cp" <<'SH'
#!/usr/bin/env bash
for a in "$@"; do case "$a" in */api) echo "cp: falha simulada" >&2; exit 1;; esac; done
exec /bin/cp "$@"
SH
FAKEPATH="$base/fake:" MANTER=0 rodar "$base/d3"; rc=$?
if [ $rc -ne 0 ] && [ "$(encs "$base/d3")" = "$antes" ]; then ok "falha de cp em pasta aborta sem rotacionar"; else erro "falha de cp em pasta (rc=$rc)"; fi

# 4) sem a chave do servidor de ID: falha
montar 4; rm "$P/data/id_ed25519"; rodar "$base/d4"; rc=$?
if [ $rc -ne 0 ] && [ "$(encs "$base/d4")" = 0 ]; then ok "sem id_ed25519 falha"; else erro "sem id_ed25519 (rc=$rc)"; fi

# 5) opcional ausente (nextec-settings.json, api) nao impede o backup
montar 5; rm "$P/data/nextec-settings.json"; rm -rf "$P/api"; rodar "$base/d5"; rc=$?
if [ $rc -eq 0 ] && [ "$(encs "$base/d5")" = 1 ]; then ok "opcional ausente nao impede"; else erro "opcional ausente (rc=$rc): $(tail -1 "$base/out")"; fi

# 6) sem banco: falha
montar 6; rm "$P/data/db_v2.sqlite3"*; rodar "$base/d6"; rc=$?
if [ $rc -ne 0 ] && [ "$(encs "$base/d6")" = 0 ]; then ok "sem banco falha"; else erro "sem banco (rc=$rc)"; fi

[ $falhas -eq 0 ] && echo "backup-cofre: todos os testes passaram" || { echo "backup-cofre: $falhas falha(s)"; exit 1; }
