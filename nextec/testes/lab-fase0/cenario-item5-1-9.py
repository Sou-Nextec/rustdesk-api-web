"""Itens 5, 1 e 9 no laboratório local: lista de dispositivos paginada no servidor com filtros e árvore, troca em lote atômica
com auditoria, acesso de equipe e pessoa a cliente, subgrupo e máquina avulsa, acesso efetivo com origem e isolamento.
Uso: python cenario-item5-1-9.py <senha do admin>
Só fala com http://127.0.0.1:18114 (o painel do docker-compose deste diretório)."""
import json, sys, urllib.request, urllib.error

BASE = 'http://127.0.0.1:18114'
API = BASE + '/api'
PASS = sys.argv[1]
fails = []


def call(method, path, body=None, token=None):
    h = {'Content-Type': 'application/json'}
    if token:
        h['api-token'] = token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, headers=h, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=30)
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


def login(user, pw):
    c, r = call('POST', '/admin/login', {'username': user, 'password': pw, 'platform': 'web'})
    return r['data']['token'] if c == 200 and isinstance(r, dict) and r.get('data') else None


T = login('admin', PASS)


def adm(method, path, body=None):
    return call(method, path, body, T)


def machine(pid, host, beat=True):
    call('POST', '/sysinfo', {'id': pid, 'uuid': 'u-' + pid, 'hostname': host, 'os': 'windows', 'username': 'x', 'cpu': 'x', 'memory': '8', 'version': '1.4'})
    if beat:
        call('POST', '/heartbeat', {'id': pid, 'uuid': 'u-' + pid, 'ver': 1004000})


def rows():
    return {p['id']: p for p in adm('GET', '/admin/peer/list?page=1&page_size=1000')[1]['data']['list']}


def devs(**kw):
    q = '&'.join(f'{k}={v}' for k, v in kw.items())
    c, r = adm('GET', '/admin/nextec/devices?' + q)
    return r['data'] if c == 200 and isinstance(r, dict) and r.get('code') == 0 else r


# ---------- cenário ----------
for n in ('Lab5 A', 'Lab5 B'):
    adm('POST', '/admin/device_group/create', {'name': n})
G = {g['name']: g['id'] for g in adm('GET', '/admin/device_group/list?page=1&page_size=500')[1]['data']['list']}
A, B = G['Lab5 A'], G['Lab5 B']
adm('POST', '/admin/device_group/create', {'name': 'Lab5 A / Filial', 'parent_id': A})
G = {(g.get('path') or g['name']): g['id'] for g in adm('GET', '/admin/device_group/list?page=1&page_size=500')[1]['data']['list']}
F = G['Lab5 A / Filial']

BASEID = 880000000
ids_a = [str(BASEID + i) for i in range(1, 46)]            # 45 no cliente A
ids_f = [str(BASEID + 100 + i) for i in range(1, 4)]       # 3 no subgrupo Filial
ids_b = [str(BASEID + 200 + i) for i in range(1, 4)]       # 3 no cliente B
ids_0 = [str(BASEID + 300 + i) for i in range(1, 3)]       # 2 sem cliente
for i, pid in enumerate(ids_a):
    machine(pid, 'CAIXA-A-%02d' % i, beat=(i % 2 == 0))
for pid in ids_f:
    machine(pid, 'FILIAL-' + pid[-2:])
for pid in ids_b:
    machine(pid, 'SRV-B-' + pid[-2:])
for pid in ids_0:
    machine(pid, 'AVULSA-' + pid[-2:], beat=False)
R = rows()
for pid in ids_a:
    adm('POST', '/admin/peer/update', {'row_id': R[pid]['row_id'], 'id': pid, 'hostname': R[pid]['hostname'], 'uuid': R[pid]['uuid'], 'alias': R[pid]['alias'], 'group_id': A})
for pid in ids_f:
    adm('POST', '/admin/peer/update', {'row_id': R[pid]['row_id'], 'id': pid, 'hostname': R[pid]['hostname'], 'uuid': R[pid]['uuid'], 'alias': R[pid]['alias'], 'group_id': F})
for pid in ids_b:
    adm('POST', '/admin/peer/update', {'row_id': R[pid]['row_id'], 'id': pid, 'hostname': R[pid]['hostname'], 'uuid': R[pid]['uuid'], 'alias': R[pid]['alias'], 'group_id': B})

# ---------- Item 5: lista paginada ----------
p1 = devs(page=1, page_size=20, client_id=A, sort='name')
check('cliente A (com subgrupo) tem 48 máquinas', p1['total'] == 48, p1)
check('página 1 traz só 20 linhas', len(p1['list']) == 20, len(p1['list']))
p3 = devs(page=3, page_size=20, client_id=A, sort='name')
check('página 3 traz o resto (8)', len(p3['list']) == 8, len(p3['list']))
seen = set()
for pg in (1, 2, 3):
    seen |= {d['id'] for d in devs(page=pg, page_size=20, client_id=A, sort='name')['list']}
check('as 3 páginas juntas cobrem as 48 sem repetir', len(seen) == 48, len(seen))
big = devs(page=1, page_size=99999, client_id=A)
check('tamanho de página maior que 200 é limitado', len(big['list']) <= 200 and big['total'] == 48, len(big['list']))
check('só as máquinas diretas do cliente (sub_id)', devs(sub_id=A)['total'] == 45)
check('só o subgrupo Filial', devs(client_id=F)['total'] == 3)
check('sem cliente inclui as 2 avulsas', set(ids_0) <= {d['id'] for d in devs(no_client=1, page_size=200)['list']})
qq = devs(q='CAIXA-A-07')
check('busca por hostname', qq['total'] == 1 and qq['list'][0]['hostname'] == 'CAIXA-A-07', qq)
check('busca por ID', devs(q=ids_b[0])['total'] == 1)
check('busca com % não vira curinga', devs(q='%25')['total'] == 0, devs(q='%25')['total'])
check('busca com _ não vira curinga', devs(q='CAIXA_A')['total'] == 0)
check('busca por parte do nome dentro do cliente', devs(q='FILIAL', client_id=A)['total'] == 3)
on = devs(client_id=A, status='online')
off = devs(client_id=A, status='offline')
check('online + offline = total do filtro', on['total'] + off['total'] == 48, (on['total'], off['total']))
check('online do filtro bate com o total online', devs(client_id=A)['online'] == on['total'])
check('as máquinas sem batimento aparecem como offline', off['total'] >= 22, off['total'])
fav = devs(ids=','.join(ids_b[:2]))
check('favoritos por ids', fav['total'] == 2, fav)
check('ids vazio (-) não traz nada', devs(ids='-')['total'] == 0)

c, tr = adm('GET', '/admin/nextec/devices/tree')
tr = tr['data']
node = {n['name']: n for n in tr['nodes']}
check('árvore: total do cliente A inclui o subgrupo', node['Lab5 A']['total'] == 48, node['Lab5 A'])
check('árvore: subgrupo Filial', node['Lab5 A / Filial']['total'] == 3 and node['Lab5 A / Filial']['parent_id'] == A, node.get('Lab5 A / Filial'))
check('árvore: cliente B', node['Lab5 B']['total'] == 3)
check('árvore: contagem de sem cliente e total', tr['no_client'] >= 2 and tr['all'] >= 53, tr)

# ---------- Item 1 (cliente) e lista de cliente para a troca em lote ----------
c, r = adm('POST', '/admin/user/create', {'username': 'lab5ana', 'nickname': 'Ana Lab5', 'group_id': 1, 'status': 1})
c, r = adm('GET', '/admin/user/list?page=1&page_size=200')
U = {u['username']: u for u in r['data']['list']}
ana, bia = U['lab5ana']['id'], None
adm('POST', '/admin/user/create', {'username': 'lab5bia', 'nickname': 'Bia Lab5', 'group_id': 1, 'status': 1})
U = {u['username']: u for u in adm('GET', '/admin/user/list?page=1&page_size=200')[1]['data']['list']}
bia = U['lab5bia']['id']
adm('POST', '/admin/user/changePwd', {'id': ana, 'password': 'Lab5-ana-1234'})
adm('POST', '/admin/user/changePwd', {'id': bia, 'password': 'Lab5-bia-1234'})
adm('POST', '/admin/group/create', {'name': 'Lab5 Suporte', 'type': 1})
TEAMS = {g['name']: g['id'] for g in adm('GET', '/admin/group/list?page=1&page_size=200')[1]['data']['list']}
team = TEAMS['Lab5 Suporte']
# Ana entra na equipe; Bia fica de fora
ana_u = U['lab5ana']
adm('POST', '/admin/user/update', {'id': ana, 'username': 'lab5ana', 'nickname': 'Ana Lab5', 'group_id': team, 'status': 1})

c, g1 = adm('POST', '/admin/nextec/access/grant', {'target_type': 2, 'target_id': team, 'scope': 'client', 'group_id': A, 'rule': 1})
check('equipe ganha o cliente A (cria a lista)', c == 200 and g1.get('code') == 0 and g1['data']['changed'] and g1['data']['name'] == 'Cliente: Lab5 A', g1)
c, g2 = adm('POST', '/admin/nextec/access/grant', {'target_type': 2, 'target_id': team, 'scope': 'client', 'group_id': A, 'rule': 1})
check('repetir a concessão não altera', g2['data']['changed'] is False, g2)
c, g3 = adm('POST', '/admin/nextec/access/grant', {'target_type': 2, 'target_id': team, 'scope': 'client', 'group_id': F, 'rule': 2})
check('equipe ganha também o subgrupo Filial', g3['data']['name'] == 'Cliente: Lab5 A / Filial', g3)
c, bad = adm('POST', '/admin/nextec/access/grant', {'target_type': 2, 'target_id': team, 'scope': 'client', 'group_id': 999999, 'rule': 1})
check('cliente inexistente é recusado', bad.get('code') != 0, bad)
c, bad = adm('POST', '/admin/nextec/access/grant', {'target_type': 2, 'target_id': team, 'scope': 'client', 'group_id': A, 'rule': 7})
check('nível inválido é recusado', bad.get('code') != 0, bad)
c, t = adm('GET', f'/admin/nextec/access/team?team_id={team}')
labels = {i['label']: i for i in t['data']['items']}
check('tela de equipes lista o que a equipe acessa', 'Lab5 A' in labels and 'Lab5 A / Filial' in labels and t['data']['members'] == 1, t)

# ---------- Item 9: acesso efetivo com origem e máquina avulsa ----------
c, ua = adm('GET', f'/admin/nextec/access/user?user_id={ana}')
it = {i['label']: i for i in ua['data']['items']}
check('Ana herda o cliente A pela equipe', it['Lab5 A']['origin'] == 'equipe' and it['Lab5 A']['rule'] == 1, it)
check('Ana herda o subgrupo com controle total', it['Lab5 A / Filial']['rule'] == 2)
check('contagem de máquinas na lista do cliente', it['Lab5 A']['machines'] >= 1, it['Lab5 A'])
c, ub = adm('GET', f'/admin/nextec/access/user?user_id={bia}')
check('isolamento: Bia (sem equipe) não vê nada', ub['data']['clients'] == 0 and not ub['data'].get('items'), ub)

target = ids_b[0]
c, m = adm('POST', '/admin/nextec/access/grant', {'target_type': 1, 'target_id': bia, 'scope': 'machine', 'peer_id': target, 'rule': 2})
check('Bia ganha só uma máquina avulsa', m['code'] == 0 and m['data']['created'] and m['data']['name'].startswith('Máquina: '), m)
c, ub = adm('GET', f'/admin/nextec/access/user?user_id={bia}')
mi = [i for i in ub['data']['items'] if i['kind'] == 'machine']
check('acesso efetivo da Bia: 1 máquina, origem direto, sem cliente', len(mi) == 1 and mi[0]['peer_id'] == target and mi[0]['origin'] == 'direto' and mi[0]['machines'] == 1 and ub['data']['clients'] == 0, ub)
c, ua = adm('GET', f'/admin/nextec/access/user?user_id={ana}')
check('isolamento: a máquina da Bia não aparece para a Ana', all(i.get('peer_id') != target for i in ua['data']['items']))
c, us = adm('GET', '/admin/nextec/access/users')
row = {u['username']: u for u in us['data']['list']}
check('resumo por pessoa', row['lab5ana']['clients'] == 2 and row['lab5bia']['machines'] == 1 and row['lab5ana']['team'] == 'Lab5 Suporte', row)

# mesma máquina também pela equipe: origem vira "direto e equipe"
adm('POST', '/admin/nextec/access/grant', {'target_type': 2, 'target_id': team, 'scope': 'machine', 'peer_id': target, 'rule': 1})
adm('POST', '/admin/nextec/access/grant', {'target_type': 1, 'target_id': ana, 'scope': 'machine', 'peer_id': target, 'rule': 2})
c, ua = adm('GET', f'/admin/nextec/access/user?user_id={ana}')
mi = [i for i in ua['data']['items'] if i['kind'] == 'machine']
check('direto e pela equipe: origem combinada, vale o maior nível', len(mi) == 1 and mi[0]['origin'] == 'direto e equipe' and mi[0]['rule'] == 2, mi)

c, rv = adm('POST', '/admin/nextec/access/grant', {'target_type': 1, 'target_id': bia, 'scope': 'machine', 'peer_id': target, 'remove': True})
c, ub = adm('GET', f'/admin/nextec/access/user?user_id={bia}')
check('tirar o acesso direto zera a Bia', rv['code'] == 0 and ub['data']['machines'] == 0, ub)

# usuário comum não chama as rotas de admin
tb = login('lab5bia', 'Lab5-bia-1234')
check('Bia consegue entrar no painel', bool(tb))
if tb:
    for path in ('/admin/nextec/devices?page=1', '/admin/nextec/devices/tree', '/admin/nextec/access/users', f'/admin/nextec/access/user?user_id={ana}'):
        c, r = call('GET', path, None, tb)
        check('não admin barrado em ' + path.split('?')[0], not (isinstance(r, dict) and r.get('code') == 0 and r.get('data')), (c, str(r)[:120]))
    c, r = call('POST', '/admin/nextec/access/grant', {'target_type': 1, 'target_id': bia, 'scope': 'machine', 'peer_id': target, 'rule': 2}, tb)
    check('não admin não concede acesso a si mesmo', not (isinstance(r, dict) and r.get('code') == 0), (c, str(r)[:120]))

# ---------- Item 5: troca em lote atômica ----------
R = rows()
ant = [R[p]['row_id'] for p in ids_a[:5]]
c, mv = adm('POST', '/admin/nextec/devices/move', {'row_ids': ant, 'group_id': F})
check('lote de 5 vai para o subgrupo em uma chamada', c == 200 and mv['code'] == 0 and mv['data']['moved'] == 5, mv)
check('contagens da árvore mudam', {n['name']: n['total'] for n in adm('GET', '/admin/nextec/devices/tree')[1]['data']['nodes']}['Lab5 A / Filial'] == 8)
check('o total do cliente A não muda (subgrupo conta)', devs(client_id=A)['total'] == 48)
check('só as diretas do cliente caem para 40', devs(sub_id=A)['total'] == 40)
c, mv2 = adm('POST', '/admin/nextec/devices/move', {'row_ids': ant, 'group_id': F})
check('repetir o lote não move de novo', mv2['data']['moved'] == 0 and mv2['data']['skipped'] == 5, mv2)
c, mv3 = adm('POST', '/admin/nextec/devices/move', {'row_ids': ant[:2] + [987654321], 'group_id': B})
R2 = rows()
check('lote com linha inexistente falha inteiro (nada move)', mv3['code'] != 0 and all(R2[p]['group_id'] == F for p in ids_a[:2]), mv3)
c, mv4 = adm('POST', '/admin/nextec/devices/move', {'row_ids': ant[:1], 'group_id': 999999})
check('grupo inexistente falha e não move', mv4['code'] != 0 and rows()[ids_a[0]]['group_id'] == F, mv4)
c, mv5 = adm('POST', '/admin/nextec/devices/move', {'row_ids': ant[:1], 'group_id': 0})
check('group_id 0 tira do cliente', mv5['code'] == 0 and mv5['data']['moved'] == 1 and rows()[ids_a[0]]['group_id'] == 0, mv5)
c, mv6 = adm('POST', '/admin/nextec/devices/move', {'row_ids': [], 'group_id': A})
check('lote vazio é recusado', mv6['code'] != 0, mv6)

# a lista "Cliente: Lab5 A" acompanha a troca em lote
c, cl = adm('GET', '/admin/address_book_collection/list?page=1&page_size=200')
lists = {x['name']: x['id'] for x in cl['data']['list']}
check('as listas de cliente existem', 'Cliente: Lab5 A' in lists and 'Cliente: Lab5 A / Filial' in lists, list(lists)[:6])
if 'Cliente: Lab5 A' in lists:
    c, ab = adm('GET', f"/admin/address_book/list?page=1&page_size=500&collection_id={lists['Cliente: Lab5 A']}")
    inlist = {x['id'] for x in ab['data']['list']}
    check('a máquina que saiu do cliente A deixou a lista dele', ids_a[0] not in inlist, len(inlist))

# ---------- auditoria ----------
c, au = adm('GET', '/admin/nextec/secrets/audit')
txt = json.dumps(au, ensure_ascii=False)
for act in ('device_move', 'access_grant', 'access_revoke'):
    check('auditoria registra ' + act, act in txt)

print('\nRESULTADO:', 'TUDO OK' if not fails else f'{len(fails)} FALHA(S): ' + '; '.join(fails))
sys.exit(1 if fails else 0)
