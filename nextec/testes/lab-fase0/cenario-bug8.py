"""Bug 8 no laboratório local: chave de instalação por cliente com subgrupo, pendência com prazo e resultado do convite.
Uso: python cenario-bug8.py <senha do admin> [caminho do .db para vencer a pendência]
Só fala com http://127.0.0.1:18114 (o painel do docker-compose deste diretório)."""
import json, os, subprocess, sys, sqlite3, time, urllib.request, urllib.error, uuid

BASE = 'http://127.0.0.1:18114/api'
PASS = sys.argv[1]
DBFILE = sys.argv[2] if len(sys.argv) > 2 else ''
token = None
fails = []


def call(method, path, body=None, auth=True, raw=None, headers=None):
    h = {'Content-Type': 'application/json'}
    if auth and token:
        h['api-token'] = token
    if headers:
        h.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=20)
        txt, code = r.read().decode(), r.status
    except urllib.error.HTTPError as e:
        txt, code = e.read().decode(), e.code
    try:
        return code, json.loads(txt)
    except Exception:
        return code, txt


def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if (extra and not cond) else ''))
    if not cond:
        fails.append(name)


def rows(data):
    return data['list'] if isinstance(data, dict) and 'list' in data else data


def machine(pid, u, host):
    call('POST', '/sysinfo', {'id': pid, 'uuid': u, 'hostname': host, 'os': 'windows', 'username': 'ana', 'cpu': 'x', 'memory': '8', 'version': '1.4'}, auth=False)
    call('POST', '/heartbeat', {'id': pid, 'uuid': u, 'ver': 1004000}, auth=False)


def peer(pid):
    c, r = call('GET', '/admin/peer/list?page=1&page_size=200')
    return [p for p in r['data']['list'] if p['id'] == pid][0]


def set_group(pid, gid):
    p = peer(pid)
    call('POST', '/admin/peer/update', {'row_id': p['row_id'], 'id': pid, 'hostname': p['hostname'], 'uuid': p['uuid'], 'alias': p['alias'], 'group_id': gid})


def assign(pid, gid):
    c, tk = call('GET', '/admin/nextec/install-token?group_id=%d' % gid)
    return call('POST', '/nextec/install/assign', {'id': pid, 'group': gid, 'token': tk['data']['token']}, auth=False)


def audit_actions():
    c, au = call('GET', '/admin/nextec/secrets/audit')
    return [x['action'] for x in rows(au['data'])]


c, r = call('POST', '/admin/login', {'username': 'admin', 'password': PASS, 'platform': 'web'}, auth=False)
token = r['data']['token']

# grupos: Lab8 A, Lab8 A / Filial, Lab8 B
for n in ('Lab8 A', 'Lab8 A / Filial', 'Lab8 B'):
    call('POST', '/admin/device_group/create', {'name': n})
c, r = call('GET', '/admin/device_group/list?page=1&page_size=200')
G = {g['name']: g['id'] for g in r['data']['list']}
A, F, B = G['Lab8 A'], G['Lab8 A / Filial'], G['Lab8 B']

# 1) chave do subgrupo vale; chave do pai mantém; chave de outro cliente não move e informa o cliente atual
M1 = '810000001'
machine(M1, 'u-m1', 'LAB8-M1')
c, r = assign(M1, F)
check('chave do subgrupo atribui a máquina sem cliente', c == 200 and r['state'] == 'assigned' and peer(M1)['group_id'] == F, (c, r))
c, r = assign(M1, A)
check('chave do cliente pai com a máquina no subgrupo: mantém, sem conflito', c == 200 and r['state'] == 'kept' and 'current_client' not in r and peer(M1)['group_id'] == F, (c, r))
c, r = assign(M1, B)
check('chave de outro cliente: mantém e informa o cliente atual', c == 200 and r['state'] == 'kept' and r.get('current_client') == 'Lab8 A / Filial' and peer(M1)['group_id'] == F, (c, r))

M2 = '810000002'
machine(M2, 'u-m2', 'LAB8-M2')
set_group(M2, A)
c, r = assign(M2, F)
check('máquina na raiz do cliente desce para o subgrupo da chave', c == 200 and r['state'] == 'assigned' and peer(M2)['group_id'] == F, (c, r))

# 2) pendência: a máquina ainda não se registrou; ao registrar recebe o grupo
M3 = '810000003'
c, r = assign(M3, A)
check('máquina nova fica com atribuição pendente', c == 200 and r['state'] == 'pending', (c, r))
machine(M3, 'u-m3', 'LAB8-M3')
check('ao registrar, a pendência aplica o grupo', peer(M3)['group_id'] == A, peer(M3))

# 3) pendência vencida não atribui (o prazo é conferido antes de apagar)
M4 = '810000004'
c, r = assign(M4, A)
if DBFILE:
    # o SQLite está em WAL num volume do Docker Desktop: para editar de fora, o contêiner é parado antes
    subprocess.run(['docker', 'stop', 'rdlab-fase0'], check=True, capture_output=True)
    con = sqlite3.connect(DBFILE, timeout=20)
    n = con.execute("UPDATE nextec_pending_assigns SET expires_at = ? WHERE peer_id = ?", (int(time.time()) - 60, M4)).rowcount
    con.commit()
    con.close()
    subprocess.run(['docker', 'start', 'rdlab-fase0'], check=True, capture_output=True)
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE + '/version', timeout=3)
            break
        except urllib.error.HTTPError:
            break
        except Exception:
            time.sleep(2)
    check('pendência de M4 vencida no banco', n == 1, n)
    machine(M4, 'u-m4', 'LAB8-M4')
    check('pendência vencida não atribui', peer(M4)['group_id'] == 0, peer(M4))
    acts = audit_actions()
    check('auditoria registra pendência aplicada e vencida', 'assign_pending_applied' in acts and 'assign_pending_expired' in acts, acts[:10])
else:
    print('SKIP pendência vencida (sem .db)')

# 4) convite: publica uma versão falsa, cria o convite do cliente A e usa com duas máquinas
msi = b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1' + b'\0' * 2048
bd = uuid.uuid4().hex
parts = []
for k, v in (('version', '9.9.9'), ('notes', 'lab bug 8')):
    parts.append(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (bd, k, v)).encode())
parts.append(('--%s\r\nContent-Disposition: form-data; name="file"; filename="lab.msi"\r\nContent-Type: application/octet-stream\r\n\r\n' % bd).encode() + msi + b'\r\n')
parts.append(('--%s--\r\n' % bd).encode())
c, r = call('POST', '/admin/nextec/updates/upload', raw=b''.join(parts), headers={'Content-Type': 'multipart/form-data; boundary=' + bd})
check('versão de laboratório enviada', c == 200 and r.get('code') == 0, r)
key = call('GET', '/admin/nextec/enroll-key')[1]['data']['key']
# publicar de verdade exige manifesto assinado pela Nextec; no laboratório o rollout é gravado direto na configuração
cfg = os.path.join(os.path.dirname(DBFILE or 'api/x'), 'nextec-settings.json')
st = json.load(open(cfg, encoding='utf-8')) if os.path.exists(cfg) else {}
st['app_rollout'] = json.dumps({'mode': 'all', 'version': '9.9.9', 'groups': [], 'peers': []})
json.dump(st, open(cfg, 'w', encoding='utf-8'))
c, r = call('POST', '/admin/nextec/invites', {'label': 'Lab convite', 'alias': 'Caixa', 'client_id': A, 'kind': 'server', 'auto_password': False,
                                              'interval_minutes': 0, 'mode': 'client', 'max_uses': 5, 'hours': 24})
check('convite do cliente A criado', c == 200 and r.get('code') == 0, r)
code = r['data']['code']


def enroll(pid, u):
    tok = (uuid.uuid4().hex + uuid.uuid4().hex)[:43]
    c, r = call('POST', '/nextec/agent/self-enroll', {'enroll_key': key, 'id': pid, 'uuid': u, 'proposed_token': tok}, auth=False)
    return tok, c, r


def claim(pid, tok):
    return call('POST', '/nextec/agent/invite', {'id': pid, 'token': tok, 'code': code}, auth=False)


def my_invite():
    c, r = call('GET', '/admin/nextec/invites')
    return [i for i in rows(r['data']) if i['label'] == 'Lab convite'][0]


M5, M6 = '810000005', '810000006'
machine(M5, 'u-m5', 'LAB8-M5')
machine(M6, 'u-m6', 'LAB8-M6')
set_group(M5, B)
t5, c5, r5 = enroll(M5, 'u-m5')
t6, c6, r6 = enroll(M6, 'u-m6')
check('duas máquinas inscritas', c5 == 200 and c6 == 200, (r5, r6))
c, r = claim(M5, t5)
check('convite com máquina de outro cliente: 409 com o cliente atual', c == 409 and r.get('error') == 'client_conflict' and r.get('current_client') == 'Lab8 B', (c, r))
check('máquina de outro cliente não foi movida', peer(M5)['group_id'] == B)
c, r = claim(M6, t6)
check('convite com máquina livre: vincula ao cliente A', c == 200 and peer(M6)['group_id'] == A, (c, r))
inv = my_invite()
res = {x['peer_id']: x for x in inv['results']}
check('painel lista o conflito de M5 com o cliente atual', res.get(M5, {}).get('result') == 'conflict' and 'Lab8 B' in res.get(M5, {}).get('detail', ''), res)
check('painel lista M6 vinculada a Lab8 A', res.get(M6, {}).get('result') == 'linked' and 'Lab8 A' in res.get(M6, {}).get('detail', ''), res)
check('conflito não gastou vaga do convite', inv['uses'] == 1, inv['uses'])
# o admin libera M5 e a nova tentativa vincula e troca o resultado
set_group(M5, 0)
c, r = claim(M5, t5)
check('depois de liberar a máquina, nova tentativa vincula', c == 200 and peer(M5)['group_id'] == A, (c, r))
res = {x['peer_id']: x for x in my_invite()['results']}
check('resultado de M5 passou de conflito para vinculado', res.get(M5, {}).get('result') == 'linked', res)
# convite cancelado: resultado inválido
call('POST', '/admin/nextec/invites/revoke', {'id': inv['id']})
M7 = '810000007'
machine(M7, 'u-m7', 'LAB8-M7')
t7, c7, r7 = enroll(M7, 'u-m7')
c, r = claim(M7, t7)
check('convite cancelado: 403 invite_invalid', c == 403 and r.get('error') == 'invite_invalid', (c, r))
acts = audit_actions()
check('auditoria registra convite vinculado, conflito e inválido', all(a in acts for a in ('invite_claim', 'invite_conflict', 'invite_invalid')), acts[:15])

print('\nRESULTADO:', 'TUDO OK' if not fails else 'FALHAS: %s' % fails)
sys.exit(1 if fails else 0)
