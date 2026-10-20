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
        raw = r.read().decode()
        code = r.status
    except urllib.error.HTTPError as e:
        raw, code = e.read().decode(), e.code
    try:
        return code, json.loads(raw)
    except Exception:
        return code, raw

def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if (extra and not cond) else ''))
    if not cond:
        fails.append(name)

c, r = call('POST', '/admin/login', {'username': 'admin', 'password': PASS, 'platform': 'web'}, auth=False)
token = r['data']['token']

# 1) Fase 0: cliente + subgrupo criados "à moda antiga" (só pelo nome) ganham parent_id e path
call('POST', '/admin/device_group/create', {'name': 'Cliente Lab'})
call('POST', '/admin/device_group/create', {'name': 'Cliente Lab / Filial'})
c, r = call('GET', '/admin/device_group/list?page=1&page_size=100')
groups = {g['name']: g for g in r['data']['list']}
cli, sub = groups['Cliente Lab'], groups['Cliente Lab / Filial']
check('subgrupo criado pelo nome recebe parent_id do cliente', sub['parent_id'] == cli['id'] and cli['parent_id'] == 0, sub)
check('API devolve o caminho', sub['path'] == 'Cliente Lab / Filial' and cli['path'] == 'Cliente Lab', (sub['path'], cli['path']))
c, r = call('POST', '/admin/device_group/create', {'name': 'Loja', 'parent_id': cli['id']})
c, r = call('GET', '/admin/device_group/list?page=1&page_size=100')
loja = [g for g in r['data']['list'] if g['name'] == 'Loja'][0]
check('subgrupo criado com parent_id explícito tem caminho Cliente / Sub', loja['parent_id'] == cli['id'] and loja['path'] == 'Cliente Lab / Loja', loja)
c, r = call('POST', '/admin/device_group/update', {'id': cli['id'], 'name': 'Cliente Lab', 'parent_id': sub['id']})
check('ciclo de pai é recusado', r.get('code') != 0, r)

# 2) máquinas (como o hbbs faria)
def machine(pid, uuid, host):
    call('POST', '/sysinfo', {'id': pid, 'uuid': uuid, 'hostname': host, 'os': 'windows', 'username': 'ana', 'cpu': 'x', 'memory': '8', 'version': '1.4'}, auth=False)
    call('POST', '/heartbeat', {'id': pid, 'uuid': uuid, 'ver': 1004000}, auth=False)
P1, U1 = '100000001', 'uuid-lab-um'
P2, U2 = '100000002', 'uuid-lab-dois'
machine(P1, U1, 'PC-UM'); machine(P2, U2, 'PC-DOIS')
c, r = call('GET', '/admin/peer/list?page=1&page_size=100')
byid = {p['id']: p for p in r['data']['list']}
for pid, alias in ((P1, 'Caixa Um'), (P2, 'Caixa Dois')):
    p = byid[pid]
    c, r = call('POST', '/admin/peer/update', {'row_id': p['row_id'], 'id': pid, 'hostname': p['hostname'], 'uuid': p['uuid'], 'alias': alias, 'group_id': sub['id'] if pid == P2 else cli['id']})
    check('peer %s atualizado' % pid, r.get('code') == 0, r)

c, r = call('GET', '/admin/nextec/enroll-key')
key = r['data']['key']
def selfenroll(pid, uuid, tok):
    return call('POST', '/nextec/agent/self-enroll', {'enroll_key': key, 'id': pid, 'uuid': uuid, 'proposed_token': tok}, auth=False)
T1 = 'A' * 43; T2 = 'B' * 43; T3 = 'C' * 43
c, r = selfenroll(P1, U1, T1); check('P1 se inscreve como pendente', c == 200 and r['state'] == 'pending', (c, r))
c, r = selfenroll(P2, U2, T2); check('P2 se inscreve como pendente', c == 200 and r['state'] == 'pending', (c, r))

# 3) Bug 11: rejeitar não volta após 2 ciclos do agente (usamos 4)
c, r = call('POST', '/admin/nextec/secrets/reject', {'id': P1, 'uuid': U1, 'block': False, 'reason': 'máquina de teste do técnico'})
check('rejeitar P1', r.get('code') == 0, r)
for i in range(4):
    c, r = selfenroll(P1, U1, T1)
    check('ciclo %d do agente: 403 rejected' % (i + 1), c == 403 and r.get('error') == 'rejected', (c, r))
c, ov = call('GET', '/admin/nextec/secrets')
d = ov['data']
check('P1 não voltou para a fila de pendentes', not [x for x in d['devices'] if x['peer_id'] == P1 and x.get('state') == 'pending'])
check('lista de rejeitadas em carência traz motivo', [x for x in d['rejected'] if x['peer_id'] == P1 and x['reason'] == 'máquina de teste do técnico'], d['rejected'])

# 4) identidade nova (admin reseta o registro) abre solicitação marcada "após rejeição"
p = [x for x in call('GET', '/admin/peer/list?page=1&page_size=100')[1]['data']['list'] if x['id'] == P1][0]
call('POST', '/admin/peer/update', {'row_id': p['row_id'], 'id': P1, 'hostname': p['hostname'], 'uuid': 'uuid-lab-um-novo', 'alias': 'Caixa Um', 'group_id': cli['id']})
call('POST', '/heartbeat', {'id': P1, 'uuid': 'uuid-lab-um-novo', 'ver': 1004000}, auth=False)
c, r = selfenroll(P1, 'uuid-lab-um-novo', T3)
check('identidade nova abre solicitação', c == 200 and r['state'] == 'pending', (c, r))
c, ov = call('GET', '/admin/nextec/secrets')
row = [x for x in ov['data']['devices'] if x['peer_id'] == P1][0]
check('solicitação marcada "nova após rejeição" com o motivo anterior', row.get('after_reject') is True and row.get('reject_reason') == 'máquina de teste do técnico', row)

# 5) liberar encerra a carência de uma rejeição
c, r = call('POST', '/admin/nextec/secrets/reject', {'id': P1, 'uuid': 'uuid-lab-um-novo', 'block': False})
c, r = call('POST', '/admin/nextec/secrets/unblock', {'id': P1, 'uuid': 'uuid-lab-um-novo'})
c, r2 = selfenroll(P1, 'uuid-lab-um-novo', T3)
check('depois de liberar a carência a máquina volta', c == 200, (c, r2))

# 6) Bug 10: Senhas do servidor == listagem de Dispositivos (cliente e apelido)
c, r = call('POST', '/admin/nextec/secrets/assign', {'id': P2, 'client_id': sub['id'], 'rule': 'none', 'uuid': U2})
check('P2 atribuído ao subgrupo', r.get('code') == 0, r)
c, ov = call('GET', '/admin/nextec/secrets')
c, pl = call('GET', '/admin/peer/list?page=1&page_size=100')
peers = {p['id']: p for p in pl['data']['list']}
for x in ov['data']['devices']:
    p = peers.get(x['peer_id'])
    if p is None:
        continue
    ok = x['alias'] == p['alias'] and x['hostname'] == p['hostname'] and x['group_id'] == p['group_id']
    check('Senhas == Dispositivos para %s (apelido %s, grupo %s)' % (x['peer_id'], x['alias'], x['group_id']), ok, (x['alias'], x['hostname'], x['group_id'], p['alias'], p['hostname'], p['group_id']))
check('Senhas mostra o apelido e o subgrupo do P2', [x for x in ov['data']['devices'] if x['peer_id'] == P2 and x['alias'] == 'Caixa Dois' and x['group_id'] == sub['id']])

print('\nRESULTADO:', 'TUDO OK' if not fails else 'FALHAS: %s' % fails)
sys.exit(1 if fails else 0)
