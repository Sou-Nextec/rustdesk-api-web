"""Gera os diagramas de arquitetura do Sentinela (SVG em HTML) e renderiza em PNG com Playwright."""
import pathlib
import sys
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).parent
OUT = pathlib.Path(sys.argv[1])
FONTS = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else BASE / "node_modules/@fontsource/open-sans/files"

NAVY = "#0D0035"
ACC = "#5C50FF"
GRAY = "#F4F4F4"
LINE = "#D8D6EE"
MUTED = "#55516E"

ICONS = {
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    "laptop": '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    "shield": '<path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z"/><circle cx="12" cy="10" r="2.2"/><path d="M12 12.2V16"/>',
    "server": '<rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="10" width="18" height="5" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/><path d="M7 5.5h.01M7 12.5h.01M7 19h.01"/><path d="M12 5.5h5M12 12.5h5"/>',
    "vault": '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v12c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    "lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/>',
    "bucket": '<path d="M4 6h16l-2 14H6z"/><ellipse cx="12" cy="6" rx="8" ry="2.5"/><path d="M9 11l2 2 4-4"/>',
    "backup": '<path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9"/><path d="M12 12v8M9 17l3 3 3-3"/>',
    "collector": '<rect x="3" y="9" width="18" height="10" rx="2"/><path d="M7 14h.01M11 14h.01"/><path d="M15 14h3"/><path d="M8 9V6M8 6a4 4 0 0 1 8 0M16 9V6"/>',
    "agent": '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/><path d="M8.5 10l2.5 2.5 4.5-4.5"/>',
    "firewall": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.3h18M3 14.6h18M9 4v5.3M15 4v5.3M6 9.3v5.3M12 9.3v5.3M18 9.3v5.3M9 14.6V20M15 14.6V20"/>',
    "switch": '<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M5 12h1M8 12h1M11 12h1M14 12h1"/><path d="M18 11v2"/>',
    "camera": '<path d="M3 7l13 4-2 5-12-4z"/><path d="M14 13l4 2v4"/><path d="M18 19h3"/>',
    "web": '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 8h18"/><path d="M6 6h.01M8.5 6h.01"/><path d="M7 12h10M7 15h6"/>',
}


def icon(name, x, y, size=28, color=ACC, sw=1.7):
    s = size / 24
    return (f'<g transform="translate({x},{y}) scale({s})" fill="none" stroke="{color}" '
            f'stroke-width="{sw / s * s:.2f}" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</g>')


def badge_icon(name, cx, cy, r=24):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#EFEEFF"/>'
            + icon(name, cx - 14, cy - 14, 28))


def text(x, y, s, size=15, weight=400, color=NAVY, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" '
            f'text-anchor="{anchor}">{s}</text>')


def card(x, y, w, h, ic, title, lines=(), accent=False):
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#fff" '
           f'stroke="{ACC if accent else LINE}" stroke-width="{1.6 if accent else 1.2}"/>']
    out.append(badge_icon(ic, x + 38, y + 38))
    out.append(text(x + 74, y + 34, title, 16, 700))
    for i, ln in enumerate(lines):
        out.append(text(x + 74, y + 56 + i * 20, ln, 13, 400, MUTED))
    return "".join(out)


def zone(x, y, w, h, title, sub=""):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{GRAY}"/>'
            f'<path d="M{x} {y + 12}a12 12 0 0 1 12-12h{w - 24}a12 12 0 0 1 12 12v22h-{w}z" fill="{NAVY}"/>'
            + text(x + 16, y + 23, title, 14, 700, "#fff")
            + (text(x + w - 16, y + 23, sub, 12, 400, "#C9C5FF", "end") if sub else ""))


def arrow(points, label=None, lx=None, ly=None, dashed=False, anchor="middle"):
    d = "M" + " L".join(f"{px} {py}" for px, py in points)
    dash = ' stroke-dasharray="6 5"' if dashed else ""
    out = f'<path d="{d}" fill="none" stroke="{NAVY}" stroke-width="1.8"{dash} marker-end="url(#ah)"/>'
    if label:
        w = len(label) * 6.9 + 16
        bx = lx - w / 2 if anchor == "middle" else (lx - 8 if anchor == "start" else lx - w + 8)
        out += (f'<rect x="{bx}" y="{ly - 14}" width="{w}" height="20" rx="4" fill="#fff"/>'
                + text(lx, ly + 1, label, 12.5, 600, NAVY, anchor))
    return out


DEFS = f'''<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
<path d="M0 0L10 5L0 10z" fill="{NAVY}"/></marker></defs>'''


def page(svg, w, h):
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:"Open Sans";font-weight:400;src:url("{FONTS}/open-sans-latin-400-normal.woff2")}}
@font-face{{font-family:"Open Sans";font-weight:600;src:url("{FONTS}/open-sans-latin-600-normal.woff2")}}
@font-face{{font-family:"Open Sans";font-weight:700;src:url("{FONTS}/open-sans-latin-700-normal.woff2")}}
html,body{{margin:0;background:#fff}} svg{{display:block;font-family:"Open Sans",sans-serif}}
</style></head><body><svg id="d" xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<rect width="{w}" height="{h}" fill="#fff"/>{DEFS}{svg}</svg></body></html>'''


def header(title, sub, w):
    return (f'<rect x="0" y="0" width="{w}" height="6" fill="{ACC}"/>'
            + text(40, 56, title, 26, 700) + text(40, 84, sub, 14, 400, MUTED)
            + text(w - 40, 56, "Sentinela", 16, 700, ACC, "end"))


def infra():
    W, H = 1800, 1040
    s = [header("Arquitetura de infraestrutura", "Modo básico: enxuto para uma empresa pequena, pronto para crescer", W)]
    s.append(zone(40, 130, 300, 230, "Usuários"))
    s.append(card(56, 186, 268, 150, "user", "Analista", ["fornecedor ou prestador", "navegador ou app", "MFA resistente a phishing"]))
    s.append(card(40, 410, 300, 130, "shield", "Provedor de identidade", ["OIDC ou SAML genérico", "Entra, Keycloak, Authentik"]))
    s.append(zone(420, 130, 820, 650, "Nuvem da Nextec", "Contabo"))
    s.append(card(470, 190, 300, 330, "server", "Servidor 1", ["API e painel do Sentinela", "Autorização e janela de horário", "Orquestra as conexões", "ID e relay do acesso remoto", "Auditoria (só escrita)"], accent=True))
    s.append(card(910, 190, 300, 150, "vault", "Servidor 2", ["Banco de dados e cofre", "Chave por cliente", "Sem porta pública"], accent=True))
    s.append(icon("lock", 1176, 300, 22, NAVY))
    s.append(card(470, 600, 300, 150, "bucket", "Armazenamento S3", ["Gravações de sessão", "Camada fria", "Trava contra exclusão"]))
    s.append(zone(1320, 130, 440, 200, "Outro provedor"))
    s.append(card(1336, 180, 408, 130, "backup", "Backup externo", ["Banco e cofre, cifrado, diário", "Restauração testada"]))
    s.append(zone(1320, 380, 440, 610, "Rede do cliente", "uma por cliente"))
    s.append(card(1356, 430, 368, 110, "collector", "Coletor", ["Máquina pequena dentro da rede", "Navegador isolado e rotação"], accent=True))
    s.append(f'<rect x="1356" y="620" width="368" height="200" rx="10" fill="#fff" stroke="{LINE}" stroke-width="1.2"/>')
    s.append(text(1376, 650, "Equipamentos sem agente", 15, 700))
    for i, (ic, nm) in enumerate([("firewall", "Firewall"), ("switch", "Switch"), ("camera", "Câmeras"), ("web", "Painéis web")]):
        cx = 1400 + i * 92
        s.append(badge_icon(ic, cx, 720, 26))
        s.append(text(cx, 774, nm, 12.5, 600, MUTED, "middle"))
    s.append(card(1356, 860, 368, 110, "agent", "Agente", ["Servidores e estações", "Acesso, rotação do SO, RMM"], accent=True))
    s.append(arrow([(190, 360), (190, 404)], "login", 196, 388, anchor="start"))
    s.append(arrow([(340, 470), (464, 470)], "token", 402, 462))
    s.append(arrow([(324, 262), (464, 262)], "HTTPS / sessão", 394, 254))
    s.append(arrow([(770, 262), (904, 262)], "rede privada", 837, 254))
    s.append(arrow([(620, 520), (620, 594)], "gravações", 630, 562, anchor="start"))
    s.append(arrow([(1210, 245), (1330, 245)], "backup cifrado", 1270, 237))
    s.append(arrow([(1356, 470), (776, 470)], "túnel de saída", 1060, 462))
    s.append(arrow([(1356, 915), (1280, 915), (1280, 500), (776, 500)], "conexão de saída", 1060, 492))
    s.append(arrow([(1540, 540), (1540, 614)], "API, SSH, HTTPS", 1550, 582, anchor="start"))
    # legenda
    s.append(f'<rect x="40" y="820" width="1200" height="170" rx="12" fill="#fff" stroke="{LINE}"/>')
    s.append(text(64, 852, "Regras do desenho", 15, 700))
    rules = [
        "A seta indica quem abre a conexão: coletor e agente sempre saem da rede do cliente; nada entra de fora para dentro.",
        "O cofre (servidor 2) só fala com o servidor 1, pela rede privada. A credencial nunca vai ao navegador do analista.",
        "Bloqueou no provedor de identidade, corta painel, app e sessões, e dispara a troca das senhas usadas.",
        "Cada cliente tem chave de cifragem própria. Gravações e backup ficam fora dos servidores principais.",
    ]
    for i, r in enumerate(rules):
        s.append(f'<circle cx="70" cy="{882 + i * 26}" r="4" fill="{ACC}"/>')
        s.append(text(84, 887 + i * 26, r, 13.5, 400, NAVY))
    return page("".join(s), W, H), W, H


def seq():
    W = 1800
    lanes = [("user", "Analista", "fornecedor ou prestador"), ("server", "Sentinela", "API e painel"),
             ("shield", "Provedor de identidade", "Entra, Keycloak, Authentik"), ("vault", "Cofre", "servidor 2"),
             ("collector", "Agente ou coletor", "no cliente")]
    xs = [200, 560, 920, 1260, 1600]
    steps = [
        ("Autenticação", [(0, 1, "Abre o Sentinela (navegador ou app)", False), (1, 2, "Redireciona (OIDC ou SAML)", False),
                          (0, 2, "Login com MFA resistente a phishing", False), (2, 1, "Token assinado", True),
                          (1, 1, "Confere grupo, permissões, janela de horário e motivo (chamado)", False),
                          (1, 0, "Lista só os clientes e máquinas liberados", True)]),
        ("Conexão", [(0, 1, "Clica em conectar", False), (1, 3, "Pede a credencial da conta da máquina", False),
                     (3, 1, "Credencial (nunca vai ao navegador)", True), (1, 4, "Ordem de conexão com ticket de uso único", False),
                     (4, 0, "Sessão aberta com a credencial injetada", True)]),
        ("Encerramento", [(4, 1, "Fim da sessão: gravação e eventos", False), (1, 4, "Rotaciona a senha usada", False)]),
    ]
    top, gap, bandpad = 250, 58, 22
    total = sum(len(g[1]) for g in steps)
    H = top + total * gap + len(steps) * bandpad * 2 + 120
    s = [header("Fluxo de autenticação e conexão", "Do login à troca da senha: o analista nunca vê a credencial", W)]
    y = top
    bands = []
    for name, items in steps:
        y0 = y
        y += bandpad
        rows = []
        for it in items:
            y += gap
            rows.append((y, it))
        y += bandpad
        bands.append((name, y0, y, rows))
    bottom = y + 10
    for name, y0, y1, _ in bands:
        s.append(f'<rect x="40" y="{y0 + 4}" width="{W - 80}" height="{y1 - y0 - 8}" rx="10" fill="{GRAY}"/>')
        s.append(text(56, y0 + 28, name, 13, 700, ACC))
    for (ic, t1, t2), x in zip(lanes, xs):
        s.append(f'<line x1="{x}" y1="{top - 30}" x2="{x}" y2="{bottom}" stroke="{LINE}" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>')
        s.append(f'<rect x="{x - 140}" y="118" width="280" height="96" rx="10" fill="#fff" stroke="{LINE}" stroke-width="1.2"/>')
        s.append(badge_icon(ic, x - 96, 166))
        s.append(text(x - 62, 160, t1, 15.5, 700))
        s.append(text(x - 62, 182, t2, 12.5, 400, MUTED))
    n = 0
    for _, _, _, rows in bands:
        for yy, (a, b, label, ret) in rows:
            n += 1
            xa, xb = xs[a], xs[b]
            if a == b:
                s.append(f'<path d="M{xa} {yy - 8} h60 v22 h-54" fill="none" stroke="{NAVY}" stroke-width="1.8" marker-end="url(#ah)"/>')
                s.append(text(xa + 74, yy + 7, label, 13.5, 400, NAVY))
            else:
                dirn = 1 if xb > xa else -1
                s.append(f'<line x1="{xa + dirn * 16}" y1="{yy}" x2="{xb - dirn * 6}" y2="{yy}" stroke="{NAVY}" stroke-width="1.8"'
                         + (' stroke-dasharray="6 5"' if ret else "") + ' marker-end="url(#ah)"/>')
                s.append(text((xa + xb) / 2, yy - 10, label, 13.5, 400, NAVY, "middle"))
            s.append(f'<circle cx="{xa}" cy="{yy}" r="13" fill="{ACC}"/>')
            s.append(text(xa, yy + 4.5, str(n), 12, 700, "#fff", "middle"))
    ly = bottom + 40
    s.append(f'<line x1="40" y1="{ly}" x2="90" y2="{ly}" stroke="{NAVY}" stroke-width="1.8" marker-end="url(#ah)"/>')
    s.append(text(100, ly + 5, "pedido", 13, 400, MUTED))
    s.append(f'<line x1="190" y1="{ly}" x2="240" y2="{ly}" stroke="{NAVY}" stroke-width="1.8" stroke-dasharray="6 5" marker-end="url(#ah)"/>')
    s.append(text(250, ly + 5, "resposta", 13, 400, MUTED))
    H = ly + 40
    return page("".join(s), W, H), W, H


def render(html, w, h, out):
    tmp = BASE / (out.stem + ".html")
    tmp.write_text(html, encoding="utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
        pg.goto(tmp.as_uri())
        pg.wait_for_timeout(500)
        pg.locator("#d").screenshot(path=str(out))
        b.close()


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for fn, name in ((infra, "infraestrutura.png"), (seq, "autenticacao.png")):
        html, w, h = fn()
        render(html, w, h, OUT / name)
        print("ok", name)
