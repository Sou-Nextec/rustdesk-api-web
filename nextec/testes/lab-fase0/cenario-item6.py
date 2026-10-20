"""Item 6 no laboratório local: download do convite com nome fixo e sugestão de cliente para a máquina pendente.
Uso: python cenario-item6.py <senha do admin> <caminho do .db>
Só fala com http://127.0.0.1:18114 (o painel do docker-compose deste diretório)."""
import json, os, sys, urllib.request, urllib.error, uuid

BASE = 'http://127.0.0.1:18114'
API = BASE + '/api'
PASS = sys.argv[1]
DBFILE = sys.argv[2] if len(sys.argv) > 2 else 'api/x'
token = None
fails = []


def call(method, path, body=None, auth=True, raw=None, headers=None):
    h = {'Content-Type': 'application/json'}
    if auth and token:
        h['api-token'] = token
    if headers:
        h.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(API + path, data=data, headers=h, method=method)
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


def download(code):
    req = urllib.request.Request(BASE + '/i/%s/baixar' % code)
    try:
        r = urllib.request.urlopen(req, timeout=20)
        return r.status, r.headers.get('Content-Disposition', ''), r.read(16)
    except urllib.error.HTTPError as e:
        return e.code, '', b''


def rows(d):
    return d['list'] if isinstance(d, dict) and 'list' in d else d


def machine(pid, u, host):
    call('POST', '/sysinfo', {'id': pid, 'uuid': u, 'hostname': host, 'os': 'windows', 'username': 'ana', 'cpu': 'x', 'memory': '8', 'version': '1.4'}, auth=False)
    call('POST', '/heartbeat', {'id': pid, 'uuid': u, 'ver': 1004000}, auth=False)


def pending_row(pid):
    c, ov = call('GET', '/admin/nextec/secrets')
    return [x for x in ov['data']['devices'] if x['peer_id'] == pid][0]


c, r = call('POST', '/admin/login', {'username': 'admin', 'password': PASS, 'platform': 'web'}, auth=False)
token = r['data']['token']
for n in ('Lab6 A', 'Lab6 B'):
    call('POST', '/admin/device_group/create', {'name': n})
G = {g['name']: g['id'] for g in call('GET', '/admin/device_group/list?page=1&page_size=200')[1]['data']['list']}
A, B = G['Lab6 A'], G['Lab6 B']

# versão de laboratório publicada para todos (o rollout vai direto na configuração; a publicação real exige manifesto assinado)
msi = b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1' + b'\0' * 2048
bd = uuid.uuid4().hex
parts = []
for k, v in (('version', '9.9.9'), ('notes', 'lab item 6')):
    parts.append(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (bd, k, v)).encode())
parts.append(('--%s\r\nContent-Disposition: form-data; name="file"; filename="lab.msi"\r\nContent-Type: application/octet-stream\r\n\r\n' % bd).encode() + msi + b'\r\n')
parts.append(('--%s--\r\n' % bd).encode())
c, r = call('POST', '/admin/nextec/updates/upload', raw=b''.join(parts), headers={'Content-Type': 'multipart/form-data; boundary=' + bd})
cfg = os.path.join(os.path.dirname(DBFILE), 'nextec-settings.json')
st = json.load(open(cfg, encoding='utf-8')) if os.path.exists(cfg) else {}
st['app_rollout'] = json.dumps({'mode': 'all', 'version': '9.9.9', 'groups': [], 'peers': []})
json.dump(st, open(cfg, 'w', encoding='utf-8'))


def invite(client, label):
    c, r = call('POST', '/admin/nextec/invites', {'label': label, 'alias': 'Caixa', 'client_id': client, 'kind': 'server', 'auto_password': False,
                                                  'interval_minutes': 0, 'mode': 'client', 'max_uses': 5, 'hours': 24})
    return r['data']['code'], r['data']['invite']['id'] if 'invite' in r['data'] else None


codeA, idA = invite(A, 'Lab6 convite A')
codeB, idB = invite(B, 'Lab6 convite B')
check('convites criados', bool(codeA) and bool(codeB))

# 1) o download tem nome fixo, sem o código
st_, cd, head = download(codeA)
check('download responde 200 e é o MSI', st_ == 200 and head.startswith(b'\xD0\xCF\x11\xE0'), (st_, head))
check('nome do arquivo é nextec-acesso-<versão>.msi', 'filename=nextec-acesso-9.9.9.msi' in cd.replace('"', ''), cd)
check('o código não aparece no nome do arquivo', codeA not in cd, cd)
check('código inexistente: 404', download('ZZZZZZZZZZZZZZZZZZZZ')[0] == 404)

# 2) máquina pendente do mesmo IP do download: sugestão do cliente A (sem código)
M1 = '860000001'
machine(M1, 'u-i6-1', 'LAB6-M1')
key = call('GET', '/admin/nextec/enroll-key')[1]['data']['key']
tok = (uuid.uuid4().hex + uuid.uuid4().hex)[:43]
c, r = call('POST', '/nextec/agent/self-enroll', {'enroll_key': key, 'id': M1, 'uuid': 'u-i6-1', 'proposed_token': tok}, auth=False)
check('máquina sem código entra como pendente', c == 200 and r['state'] == 'pending', (c, r))
row = pending_row(M1)
sug = row.get('suggested') or {}
check('painel sugere o cliente A pelo download do convite', sug.get('client_id') == A and sug.get('source') == 'download' and sug.get('invite') == 'Lab6 convite A', row)
check('a máquina continua sem cliente (é só sugestão)', row['group_id'] == 0, row)

# 3) dois clientes baixando do mesmo IP: ambíguo, sem sugestão
download(codeB)
check('IP com convites de dois clientes: sem sugestão', not pending_row(M1).get('suggested'), pending_row(M1))

# 4) convite cancelado + código apresentado pelo agente: sugere o cliente do convite
call('POST', '/admin/nextec/invites/revoke', {'id': idB})
c, r = call('POST', '/nextec/agent/invite', {'id': M1, 'token': tok, 'code': codeB}, auth=False)
check('convite cancelado: 403 invite_invalid', c == 403 and r.get('error') == 'invite_invalid', (c, r))
sug = pending_row(M1).get('suggested') or {}
check('sugere o cliente B pelo convite que o servidor recusou', sug.get('client_id') == B and sug.get('source') == 'convite', sug)

# 5) quem já tem cliente não recebe sugestão
c, r = call('POST', '/admin/nextec/secrets/assign', {'id': M1, 'client_id': A, 'rule': 'none', 'uuid': 'u-i6-1'})
check('admin atribui ao cliente A', r.get('code') == 0, r)
check('sem sugestão depois de atribuída', not pending_row(M1).get('suggested'), pending_row(M1))

print('RESULTADO:', 'TUDO OK' if not fails else 'FALHAS: %s' % fails)
sys.exit(1 if fails else 0)
