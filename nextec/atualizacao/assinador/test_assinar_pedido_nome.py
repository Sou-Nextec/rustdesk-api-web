"""O nome do app é livre: o ProductName do MSI é validado contra o app_name do pedido, não contra um literal."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("assinar_pedido", HERE / "assinar-pedido-connect.py")
mod = importlib.util.module_from_spec(spec)
import sys
sys.path.insert(0, str(HERE))
spec.loader.exec_module(mod)

VERSION = "2.1.0"


def make_msi(folder):
    path = Path(folder) / "app.msi"
    path.write_bytes(bytes.fromhex("d0cf11e0a1b11ae1") + b"conteudo-de-teste")
    return path


def make_request(msi, app_name=None):
    raw = msi.read_bytes()
    body = {
        "produto": "nextec-connect", "formato": 1, "versao": VERSION, "sequencia": 4,
        "windows": {"arquivo": f"files/nextec-acesso-{VERSION}.msi", "sha256": hashlib.sha256(raw).hexdigest(), "tamanho": len(raw)},
    }
    if app_name is not None:
        body["app_name"] = app_name
    return mod.parse_request(json.dumps(body).encode())


class NomeLivre(unittest.TestCase):
    def test_product_name_confere_com_app_name_do_pedido(self):
        for name in ("XPTO", "Client-Nextec-Connect", "Nextec-Connect", "Suporte Acme 2"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as d:
                msi = make_msi(d)
                req = make_request(msi, name)
                res = mod.inspect_msi(msi, req, property_reader=lambda p, n=name: {"ProductName": n, "ProductVersion": VERSION + ".0"})
                self.assertEqual(res["tamanho"], msi.stat().st_size)

    def test_product_name_diferente_do_pedido_e_recusado(self):
        with tempfile.TemporaryDirectory() as d:
            msi = make_msi(d)
            req = make_request(msi, "XPTO")
            with self.assertRaises(ValueError):
                mod.inspect_msi(msi, req, property_reader=lambda p: {"ProductName": "Nextec-Connect", "ProductVersion": VERSION})

    def test_sem_app_name_aceita_qualquer_nome_seguro_mas_nao_vazio_nem_perigoso(self):
        with tempfile.TemporaryDirectory() as d:
            msi = make_msi(d)
            req = make_request(msi)
            ok = mod.inspect_msi(msi, req, property_reader=lambda p: {"ProductName": "XPTO", "ProductVersion": VERSION})
            self.assertTrue(ok["sha256"])
            for bad in ("", None, "a;b", "../x"):
                with self.assertRaises(ValueError):
                    mod.inspect_msi(msi, req, property_reader=lambda p, b=bad: {"ProductName": b, "ProductVersion": VERSION})

    def test_app_name_invalido_no_pedido(self):
        with tempfile.TemporaryDirectory() as d:
            msi = make_msi(d)
            for bad in ("", "a/b", 7, "x" * 80):
                with self.assertRaises(ValueError):
                    make_request(msi, bad)


if __name__ == "__main__":
    unittest.main()
