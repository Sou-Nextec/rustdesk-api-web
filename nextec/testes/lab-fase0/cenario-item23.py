"""Itens 2, 3 e 11a no laboratório local: herança global > cliente > subgrupo > máquina (senha e política do app),
origem de cada regra, aprovação automática só quando a regra efetiva pede, isolamento entre clientes e auditoria.
Uso: python cenario-item23.py <senha do admin>
Só fala com http://127.0.0.1:18114 (o painel do docker-compose deste diretório)."""
import json, sys, urllib.request, urllib.error, uuid

BASE = 'http://127.0.0.1:18114'
API = BASE + '/api'
PASS = sys.argv[1]
token = None
fails = []


def call(method, path, body=None, auth=True):
    h = {'Content-Type': 'application/json'}
    if auth and token:
        h['api-token'] = token
    data = json.dumps(body).encode() if body is not None else None
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
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra)[:300] if (extra and not cond) else ''))
    if not cond:
        fails.append(name)


def machine(pid, u, host):
    call('POST', '/sysinfo', {'id': pid, 'uuid': u, 'hostname': host, 'os': 'windows', 'username': 'ana', 'cpu': 'x', 'memory': '8', 'version': '1.4'}, auth=False)
    call('POST', '/heartbeat', {'id': pid, 'uuid': u, 'ver': 1004000}, auth=False)


def peer(pid):
    return [p for p in call('GET', '/admin/peer/list?page=1&page_size=500')[1]['data']['list'] if p['id'] == pid][0]


def move(pid, gid):
    p = peer(pid)
    return call('POST', '/admin/peer/update', {'row_id': p['row_id'], 'id': pid, 'hostname': p['hostname'], 'uuid': p['uuid'], 'alias': p['alias'], 'group_id': gid})


def secret_policy(**kw):
    return call('POST', '/admin/nextec/secrets/policy', kw)[1]


def app_policy(**kw):
    return call('POST', '/admin/nextec/policies', kw)[1]


def eff(pid):
    return call('GET', '/admin/nextec/policies/effective?peer_id=' + pid)[1]['data']


def enroll(pid, u):
    key = call('GET', '/admin/nextec/enroll-key')[1]['data']['key']
    tok = (uuid.uuid4().hex + uuid.uuid4().hex)[:43]
    c, r = call('POST', '/nextec/agent/self-enroll', {'enroll_key': key, 'id': pid, 'uuid': u, 'proposed_token': tok}, auth=False)
    return c, r


c, r = call('POST', '/admin/login', {'username': 'admin', 'password': PASS, 'platform': 'web'}, auth=False)
token = r['data']['token']

# cenário: dois clientes, um com subgrupo
for n in ('Lab23 A', 'Lab23 B'):
    call('POST', '/admin/device_group/create', {'name': n})
G = {g['name']: g['id'] for g in call('GET', '/admin/device_group/list?page=1&page_size=200')[1]['data']['list']}
A, B = G['Lab23 A'], G['Lab23 B']
call('POST', '/admin/device_group/create', {'name': 'Servidores', 'parent_id': A})
G = {(g.get('path') or g['name']): g['id'] for g in call('GET', '/admin/device_group/list?page=1&page_size=200')[1]['data']['list']}
S = G['Lab23 A / Servidores']

M_A, M_S, M_B, M_0 = '870000001', '870000002', '870000003', '870000004'
for pid in (M_A, M_S, M_B, M_0):
    machine(pid, 'u-' + pid, 'LAB23-' + pid[-1])
for pid, gid in ((M_A, A), (M_S, S), (M_B, B)):
    move(pid, gid)

# 1) sem regra nenhuma
e = eff(M_S)
check('sem regra: senha e app com origem none', e['secret']['origin'] == 'none' and e['app']['origin']['origin'] == 'none', e)
check('caminho do grupo da máquina no subgrupo', e['group_path'] == 'Lab23 A / Servidores', e)

# 2) regra global
r = secret_policy(kind='global', ref='global', enabled=True, interval_minutes=240)
check('regra global de senha salva', r.get('code') == 0, r)
r = app_policy(kind='global', ref='global', enabled=True, options={'enable-terminal': 'N'})
check('política global do app salva', r.get('code') == 0, r)
for pid in (M_A, M_S, M_B, M_0):
    e = eff(pid)
    check('global vale para ' + pid, e['secret']['origin'] == 'global' and e['secret']['interval_minutes'] == 240 and e['app']['origin']['origin'] == 'global', e)

# 3) regra do cliente A vence a global e chega ao subgrupo
r = secret_policy(kind='group', ref=str(A), enabled=True, interval_minutes=60)
check('regra do cliente A salva', r.get('code') == 0, r)
r = app_policy(kind='group', ref=str(A), enabled=True, options={'enable-file-transfer': 'N'})
check('política do app do cliente A salva', r.get('code') == 0, r)
eA, eS, eB = eff(M_A), eff(M_S), eff(M_B)
check('máquina no cliente A: regra do cliente (própria do grupo)', eA['secret']['origin'] == 'group' and eA['secret']['interval_minutes'] == 60 and eA['secret']['origin_group_id'] == A, eA)
check('máquina no subgrupo herda do cliente A', eS['secret']['origin'] == 'group' and eS['secret']['origin_group_id'] == A and eS['secret']['origin_name'] == 'Lab23 A', eS)
check('política do app também herda no subgrupo', eS['app']['origin']['origin'] == 'group' and eS['app']['options'].get('enable-file-transfer') == 'N', eS)
check('isolamento: cliente B segue a global, não a do cliente A', eB['secret']['origin'] == 'global' and eB['app']['origin']['origin'] == 'global' and 'enable-file-transfer' not in eB['app']['options'], eB)

# 4) subgrupo com regra própria vence o cliente; máquina vence o subgrupo
r = secret_policy(kind='group', ref=str(S), enabled=True, interval_minutes=30)
eS = eff(M_S)
check('regra do subgrupo vence a do cliente', eS['secret']['interval_minutes'] == 30 and eS['secret']['origin_group_id'] == S, eS)
check('o cliente A não muda com a regra do subgrupo', eff(M_A)['secret']['interval_minutes'] == 60)
r = secret_policy(kind='peer', ref=M_S, enabled=True, interval_minutes=15)
eS = eff(M_S)
check('regra da própria máquina vence a do subgrupo', eS['secret']['origin'] == 'peer' and eS['secret']['interval_minutes'] == 15, eS)
r = secret_policy(kind='peer', ref=M_S, remove=True)
check('removendo a da máquina volta ao subgrupo', eff(M_S)['secret']['origin_group_id'] == S)

# 5) lista de senhas: máquinas do subgrupo entram pela regra herdada, com origem
c, ov = call('GET', '/admin/nextec/secrets')
byid = {d['peer_id']: d for d in ov['data']['devices']}
check('painel de senhas mostra origem da regra herdada', byid.get(M_S, {}).get('rule_origin') == 'group' and byid[M_S].get('rule_origin_group') == S, byid.get(M_S))

# 6) auto_approve: não vale para máquina; vale para grupo e global
r = secret_policy(kind='peer', ref=M_S, enabled=True, interval_minutes=15, auto_approve=True)
check('aprovar sozinho recusado em regra de máquina', r.get('code') != 0, r)
secret_policy(kind='peer', ref=M_S, remove=True)

# 7) 11a: pendente só se a regra efetiva exigir aprovação
N1, N2, N3, N4 = '870000011', '870000012', '870000013', '870000014'
for pid in (N1, N2, N3, N4):
    machine(pid, 'u-' + pid, 'LAB23-' + pid[-2:])
# N1 sem cliente: sempre pendente, mesmo com global que aprova sozinho
secret_policy(kind='global', ref='global', enabled=True, interval_minutes=240, auto_approve=True)
c, r = enroll(N1, 'u-' + N1)
check('máquina sem cliente fica pendente mesmo com global aprovando', c == 200 and r.get('state') == 'pending', (c, r))
# N2 num cliente cuja regra NÃO aprova sozinho: pendente (a regra do grupo vence a global)
move(N2, A)
c, r = enroll(N2, 'u-' + N2)
check('cliente A sem aprovação automática: pendente', c == 200 and r.get('state') == 'pending', (c, r))
# N3 no cliente B (segue a global que aprova): aprovada sozinha
move(N3, B)
c, r = enroll(N3, 'u-' + N3)
check('cliente B herda a global com aprovação automática: aprovada', c == 200 and r.get('state') != 'pending', (c, r))
# N4 num subgrupo com regra própria sem aprovação automática: a regra mais próxima vence a do cliente, fica pendente
secret_policy(kind='group', ref=str(A), enabled=True, interval_minutes=60, auto_approve=True)
move(N4, S)
c, r = enroll(N4, 'u-' + N4)
check('subgrupo com regra própria sem aprovação automática: pendente (vence o cliente)', c == 200 and r.get('state') == 'pending', (c, r))
# sem a regra do subgrupo, ele herda a aprovação automática do cliente A
secret_policy(kind='group', ref=str(S), remove=True)
N5 = '870000015'
machine(N5, 'u-' + N5, 'LAB23-15')
move(N5, S)
c, r = enroll(N5, 'u-' + N5)
check('subgrupo herda a aprovação automática do cliente A: aprovada', c == 200 and r.get('state') != 'pending', (c, r))

c, ov = call('GET', '/admin/nextec/secrets')
st = {d['peer_id']: d.get('state') for d in ov['data']['devices']}
check('painel: N1, N2 e N4 pendentes; N3 e N5 fora da fila', all(st.get(x) == 'pending' for x in (N1, N2, N4)) and st.get(N3) != 'pending' and st.get(N5) != 'pending', {k: st.get(k) for k in (N1, N2, N3, N4, N5)})

# 8) visão por cliente e subgrupo
c, sc = call('GET', '/admin/nextec/policies/scopes')
rows = {(x.get('path') or x['name']): x for x in sc['data']['list']}
check('visão por cliente: subgrupo herda do cliente A e mostra a origem', rows['Lab23 A / Servidores']['own_secret'] is False and rows['Lab23 A / Servidores']['secret']['origin_group_id'] == A and rows['Lab23 A / Servidores']['secret']['origin_name'] == 'Lab23 A', rows.get('Lab23 A / Servidores'))
check('visão por cliente: B herda da global', rows['Lab23 B']['own_secret'] is False and rows['Lab23 B']['secret']['origin'] == 'global', rows.get('Lab23 B'))

# 9) auditoria
c, au = call('GET', '/admin/nextec/secrets/audit')
txt = json.dumps(au, ensure_ascii=False)
for act in ('policy_set', 'app_policy_set', 'enroll_auto_approved'):
    check('auditoria registra ' + act, act in txt)
check('auditoria guarda antes e depois', 'antes' in txt and 'depois' in txt)

# 10) remover a global devolve o cliente B a "sem regra"
secret_policy(kind='global', ref='global', remove=True)
app_policy(kind='global', ref='global', enabled=False, options={}, remove=True)
check('sem a global o cliente B fica sem regra', eff(M_B)['secret']['origin'] == 'none' and eff(M_B)['app']['origin']['origin'] == 'none', eff(M_B))
check('o cliente A mantém a própria', eff(M_A)['secret']['origin'] == 'group')

print('RESULTADO:', 'TUDO OK' if not fails else 'FALHAS: %s' % fails)
sys.exit(1 if fails else 0)
