"""Bug 4 no laboratório local: listas "Cliente: X" acompanham a máquina ao mover ou salvar.
Uso: python cenario-bug4.py <senha do admin>
Só fala com http://127.0.0.1:18114 (o painel do docker-compose deste diretório)."""
import json, sys, urllib.request, urllib.error

BASE = 'http://127.0.0.1:18114/api'
PASS = sys.argv[1]
token = None
fails = []


def call(method, path, body=None, auth=True):
    h = {'Content-Type': 'application/json'}
    if auth and token:
        h['api-token'] = token
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=20)
        txt = r.read().decode()
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
    try:
        return json.loads(txt)
    except Exception:
        return txt


def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if (extra and not cond) else ''))
    if not cond:
        fails.append(name)


r = call('POST', '/admin/login', {'username': 'admin', 'password': PASS, 'platform': 'web'}, auth=False)
token = r['data']['token']
me = [u for u in call('GET', '/admin/user/list?page=1&page_size=100')['data']['list'] if u['username'] == 'admin'][0]['id']

for n in ('Lab4 A', 'Lab4 A / Filial', 'Lab4 A / Loja', 'Lab4 B'):
    call('POST', '/admin/device_group/create', {'name': n})
G = {g['name']: g['id'] for g in call('GET', '/admin/device_group/list?page=1&page_size=200')['data']['list']}
A, F, L, B = G['Lab4 A'], G['Lab4 A / Filial'], G['Lab4 A / Loja'], G['Lab4 B']

COL = {}
for key, n in (('A', 'Lab4 A'), ('F', 'Lab4 A / Filial'), ('L', 'Lab4 A / Loja'), ('B', 'Lab4 B')):
    call('POST', '/admin/address_book_collection/create', {'user_id': me, 'name': 'Cliente: ' + n})
for c in call('GET', '/admin/address_book_collection/list?page=1&page_size=500&user_id=%d' % me)['data']['list']:
    for key, n in (('A', 'Lab4 A'), ('F', 'Lab4 A / Filial'), ('L', 'Lab4 A / Loja'), ('B', 'Lab4 B')):
        if c['name'] == 'Cliente: ' + n:
            COL[key] = c['id']


def members(key):
    r = call('GET', '/admin/address_book/list?page=1&page_size=500&collection_id=%d&user_id=%d' % (COL[key], me))
    return sorted(e['id'] for e in r['data']['list'])


def machine(pid, u, host):
    call('POST', '/sysinfo', {'id': pid, 'uuid': u, 'hostname': host, 'os': 'windows', 'username': 'ana', 'cpu': 'x', 'memory': '8', 'version': '1.4'}, auth=False)
    call('POST', '/heartbeat', {'id': pid, 'uuid': u, 'ver': 1004000}, auth=False)


def peer(pid):
    return [p for p in call('GET', '/admin/peer/list?page=1&page_size=500')['data']['list'] if p['id'] == pid][0]


def save(pid, gid):
    p = peer(pid)
    return call('POST', '/admin/peer/update', {'row_id': p['row_id'], 'id': pid, 'hostname': p['hostname'], 'uuid': p['uuid'], 'alias': p['alias'], 'group_id': gid})


def audit():
    return [x['action'] for x in call('GET', '/admin/nextec/secrets/audit')['data'] if isinstance(x, dict)] if False else \
        [x['action'] for x in (lambda d: d['list'] if isinstance(d, dict) and 'list' in d else d)(call('GET', '/admin/nextec/secrets/audit')['data'])]


P1, P2 = '840000001', '840000002'
machine(P1, 'u-b4-1', 'LAB4-M1')
machine(P2, 'u-b4-2', 'LAB4-M2')
check('listas começam vazias', all(members(k) == [] for k in COL), {k: members(k) for k in COL})

# salvar o dispositivo no subgrupo: entra na lista dele e na do cliente
check('salvar P1 na Filial', save(P1, F).get('code') == 0)
check('P1 está na lista da Filial e na do cliente A', members('F') == [P1] and members('A') == [P1] and members('L') == [] and members('B') == [], {k: members(k) for k in COL})
check('P2 na raiz do cliente A: só na lista do cliente', save(P2, A).get('code') == 0 and members('A') == [P1, P2] and members('F') == [P1], {k: members(k) for k in COL})

# trocar de subgrupo no mesmo cliente
check('P1 vai da Filial para a Loja', save(P1, L).get('code') == 0)
check('P1 saiu da Filial, entrou na Loja, continua no cliente A', members('F') == [] and members('L') == [P1] and members('A') == [P1, P2], {k: members(k) for k in COL})

# mover para outro cliente: sai de tudo do A (isolamento entre clientes)
check('P1 vai para o cliente B', save(P1, B).get('code') == 0)
check('P1 saiu do A e da Loja e entrou no B; P2 não foi tocado', members('A') == [P2] and members('L') == [] and members('B') == [P1], {k: members(k) for k in COL})

# mover em lote (o painel faz uma chamada por máquina): ambos para o B
check('lote: P2 também para o B', save(P2, B).get('code') == 0 and members('A') == [] and members('B') == [P1, P2], {k: members(k) for k in COL})

# sem cliente: sai da lista
check('P1 sem cliente sai da lista do B', save(P1, 0).get('code') == 0 and members('B') == [P2], {k: members(k) for k in COL})

# reconciliação: apaga à mão uma entrada e inclui uma intrusa; o servidor conserta
ab = call('GET', '/admin/address_book/list?page=1&page_size=500&collection_id=%d&user_id=%d' % (COL['B'], me))['data']['list']
call('POST', '/admin/address_book/delete', {'row_id': ab[0]['row_id']})
call('POST', '/admin/address_book/create', {'id': P1, 'user_id': me, 'collection_id': COL['B'], 'hostname': 'x', 'tags': []})
check('lista do B desatualizada (sem P2, com P1 intruso)', members('B') == [P1], members('B'))
r = call('POST', '/admin/nextec/client-lists/sync', {'collection_ids': [COL['B']]})
check('reconciliar devolve 1 incluída e 1 removida', r.get('code') == 0 and r['data']['results'][0]['added'] == 1 and r['data']['results'][0]['removed'] == 1, r)
check('lista do B voltou a ter só P2', members('B') == [P2], members('B'))
r = call('POST', '/admin/nextec/client-lists/sync', {'collection_ids': [999999]})
check('lista inexistente é recusada', r.get('code') != 0, r)

acts = audit()
check('auditoria registra a sincronização e a reconciliação', 'client_lists_sync' in acts and 'client_list_reconcile' in acts, acts[:10])
print('\nRESULTADO:', 'TUDO OK' if not fails else 'FALHAS: %s' % fails)
sys.exit(1 if fails else 0)
