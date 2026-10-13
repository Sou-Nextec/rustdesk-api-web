"""Teste ponta a ponta de Assinar-Versao.ps1 com painel falso e par de chaves descartavel.

Nao usa a chave real nem o painel real. A chave de teste e gerada em pasta temporaria.
Requer Windows PowerShell 5.1 e OpenSSL (o do Git for Windows serve).
"""
import base64
import gzip
import hashlib
import http.server
import io
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import threading
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "Assinar-Versao.ps1"
PASS = "senha-descartavel-teste"
VERSION = "9.8.7"


def _openssl():
    found = shutil.which("openssl")
    if found:
        return found
    git = Path(os.environ.get("ProgramFiles", "")) / "Git" / "usr" / "bin" / "openssl.exe"
    return str(git) if git.exists() else None


def _ar(members):
    out = b"!<arch>\n"
    for name, data in members:
        head = f"{name:<16}{0:<12}{0:<6}{0:<6}{'100644':<8}{len(data):<10}`\n".encode()
        out += head + data + (b"\n" if len(data) % 2 else b"")
    return out


def make_deb(version, arch):
    control = f"Package: nextec-connect\nVersion: {version}\nArchitecture: {arch}\nMaintainer: teste\nDescription: teste\n".encode()
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        info = tarfile.TarInfo("./control")
        info.size = len(control)
        tar.addfile(info, io.BytesIO(control))
    control_tar = gzip.compress(buf.getvalue())
    empty = io.BytesIO()
    with tarfile.open(fileobj=empty, mode="w"):
        pass
    return _ar([("debian-binary", b"2.0\n"), ("control.tar.gz", control_tar), ("data.tar.gz", gzip.compress(empty.getvalue()))])


class FakePanel:
    def __init__(self, deb, sequence=11, signed=False):
        self.deb = deb
        self.served = None
        self.sequence = sequence
        self.signed = signed
        self.posted = None
        self.seen_headers = []
        self.sign_requests = 0
        outer = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _json(self, obj, code=200):
                raw = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def _auth(self):
                outer.seen_headers.append((self.headers.get("api-token"), self.headers.get("Cookie")))
                if self.headers.get("api-token") != "tok-teste" or "CF_Authorization=cf-teste" not in (self.headers.get("Cookie") or ""):
                    self._json({"code": 403}, 403)
                    return False
                return True

            def do_GET(self):
                if self.path.startswith("/api/nextec/update/files/"):
                    raw = outer.served if outer.served is not None else outer.deb
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(raw)))
                    self.end_headers()
                    self.wfile.write(raw)
                elif self.path == "/api/admin/nextec/updates":
                    if self._auth():
                        self._json({"code": 0, "data": {"releases": [
                            {"version": "1.0.0", "signed": True}, {"version": VERSION, "signed": outer.signed}]}})
                else:
                    self._json({"code": 1}, 404)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
                if not self._auth():
                    return
                if self.path == "/api/admin/nextec/updates/sign-request":
                    outer.sign_requests += 1
                    self._json({"code": 0, "data": {
                        "produto": "nextec-connect", "formato": 1, "versao": body["version"], "sequencia": outer.sequence,
                        "linux": {"amd64": {"arquivo": f"files/nextec-acesso-{body['version']}-amd64.deb",
                                            "sha256": hashlib.sha256(outer.deb).hexdigest(), "tamanho": len(outer.deb)}}}})
                elif self.path == "/api/admin/nextec/updates/signature":
                    outer.posted = body
                    outer.signed = True
                    self._json({"code": 0, "data": None})
                else:
                    self._json({"code": 1}, 404)

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


@unittest.skipUnless(os.name == "nt" and shutil.which("powershell.exe") and _openssl(), "requer Windows PowerShell e OpenSSL")
class AssinarVersaoTest(unittest.TestCase):
    PREFIX = "nextec-test-assinar-"
    TEMP_NAME = None

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix=self.PREFIX))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        openssl = _openssl()
        self.key = self.tmp / "chave-teste.pem"
        subprocess.run([openssl, "genrsa", "-traditional", "-aes256", "-passout", f"pass:{PASS}", "-out", str(self.key), "3072"],
                       check=True, capture_output=True)
        pub = subprocess.run([openssl, "rsa", "-in", str(self.key), "-passin", f"pass:{PASS}", "-modulus", "-noout"],
                             check=True, capture_output=True, text=True).stdout.strip().split("=", 1)[1]
        self.helper = self.tmp / "assinador"
        shutil.copytree(HERE, self.helper, ignore=shutil.ignore_patterns("__pycache__", "test_*"))
        (self.helper / "chaves-publicas.json").write_text(json.dumps([{"id": "teste", "e": 65537, "n": pub.lower()}]), encoding="utf-8")
        self.deb = make_deb(VERSION, "amd64")
        self.config = self.tmp / "cfg" / "assinador.json"
        self.saida = self.tmp / "releases"
        self.local = self.tmp / "local"
        self.local.mkdir()

    def _run(self, panel, extra="", senha=PASS, sessao=True, cf="cf-teste"):
        cfg = {"chave": str(self.key), "painel": panel.url}
        self.config.parent.mkdir(parents=True, exist_ok=True)
        self.config.write_text(json.dumps(cfg), encoding="utf-8")
        prep = ""
        if sessao:
            prep = (f"Save-PainelSessao '{self.config}' (ConvertTo-SecureString 'tok-teste' -AsPlainText -Force) "
                    f"(ConvertTo-SecureString '{cf}' -AsPlainText -Force);")
        cmd = (f". '{SCRIPT.parent / 'Assinar-Versao.ps1'}' -AssinadorDir '{self.helper}' -Config '{self.config}' "
               f"-SaidaRoot '{self.saida}' -LeitorSenha {{ ConvertTo-SecureString '{senha}' -AsPlainText -Force }} {extra}; "
               f"{prep} Start-AssinarVersao | Out-Null")
        env = dict(os.environ, LOCALAPPDATA=str(self.local))
        if self.TEMP_NAME:
            temp = self.tmp / self.TEMP_NAME
            temp.mkdir(exist_ok=True)
            env["TEMP"] = env["TMP"] = str(temp)
        return subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd],
                              capture_output=True, text=True, env=env, timeout=300)

    def test_fluxo_completo_autoriza_versao(self):
        panel = FakePanel(self.deb)
        self.addCleanup(panel.close)
        r = self._run(panel)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("AUTORIZADA", r.stdout)
        self.assertEqual(panel.posted["version"], VERSION)
        manifest = json.loads(base64.b64decode(panel.posted["manifesto"]))
        self.assertEqual(manifest["produto"], "nextec-connect")
        self.assertEqual(manifest["sequencia"], 11)
        self.assertEqual(manifest["versao"], VERSION)
        self.assertTrue(panel.posted["assinatura"])
        self.assertEqual(panel.seen_headers[0], ("tok-teste", "CF_Authorization=cf-teste"))
        self.assertNotIn(PASS, r.stdout + r.stderr)

    def test_hash_diferente_e_recusado_antes_da_senha(self):
        panel = FakePanel(self.deb)
        self.addCleanup(panel.close)
        panel.served = self.deb + b"x"  # o download entrega bytes diferentes dos do pedido
        r = self._run(panel)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("nao confere", r.stdout + r.stderr)
        self.assertIsNone(panel.posted)
        self.assertFalse(self.saida.exists())

    def test_senha_errada_nao_envia_nada(self):
        panel = FakePanel(self.deb)
        self.addCleanup(panel.close)
        r = self._run(panel, senha="errada")
        self.assertNotEqual(r.returncode, 0)
        self.assertIsNone(panel.posted)
        self.assertEqual(panel.sign_requests, 1)

    def test_sessao_invalida_pede_novo_token(self):
        panel = FakePanel(self.deb)
        self.addCleanup(panel.close)
        r = self._run(panel, cf="outro")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Sessao do painel expirada", r.stdout + r.stderr)
        self.assertIsNone(panel.posted)

    def test_chave_em_texto_claro_e_recusada(self):
        panel = FakePanel(self.deb)
        self.addCleanup(panel.close)
        clear = self.tmp / "clara.pem"
        subprocess.run([_openssl(), "genrsa", "-traditional", "-out", str(clear), "3072"], check=True, capture_output=True)
        self.key = clear
        r = self._run(panel)
        self.assertNotEqual(r.returncode, 0)
        self.assertIsNone(panel.posted)


class AssinarVersaoCaminhoAcentuadoTest(AssinarVersaoTest):
    """Regressao: chave, pasta do assinador, saida e temp com acentos precisam assinar e enviar."""
    PREFIX = "nextec-Área Assinatura çã-"
    TEMP_NAME = "temp Área çã"

    def test_caminhos_realmente_tem_acento(self):
        for p in (self.key, self.helper, self.saida, self.tmp / self.TEMP_NAME):
            self.assertFalse(str(p).isascii(), str(p))


if __name__ == "__main__":
    unittest.main()
