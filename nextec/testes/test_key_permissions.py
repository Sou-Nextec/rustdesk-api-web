"""Exercise the pinned server startup twice: public readable, private restricted."""
import json
import subprocess
from pathlib import Path

stack = Path(__file__).resolve().parents[1] / 'deploy/portainer-stack.yml'
line = next(line for line in stack.read_text().splitlines() if 'entrypoint:' in line and 'user/contents.d/api;' in line)
startup = json.loads(line.split('entrypoint: ', 1)[1])[2]
preparation = startup.split('(while', 1)[0]
fixture = '''mkdir -p /data
printf test > /data/id_ed25519.pub
printf test > /data/id_ed25519
chmod 0600 /data/id_ed25519.pub
chmod 0644 /data/id_ed25519
printf '#!/bin/sh\nexit 0\n' > /usr/bin/rustdesk-utils
chmod +x /usr/bin/rustdesk-utils
'''
check = '''
for restart in 1 2; do
  sh /etc/s6-overlay/s6-rc.d/key-secret/up.real || exit 1
  test "$(stat -c %a /data/id_ed25519.pub)" = 644 || exit 1
  test "$(stat -c %a /data/id_ed25519)" = 600 || exit 1
done
echo 'OK: public key stays readable across restarts; private key stays restricted'
'''
subprocess.run(['docker', 'run', '--rm', '--entrypoint', 'sh', 'lejianwen/rustdesk-server-s6:v0.1.2', '-c', fixture + preparation + check], check=True)
