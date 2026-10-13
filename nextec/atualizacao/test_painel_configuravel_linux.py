import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).with_name("coordenador-agente-nextec-linux.py")
SPEC = importlib.util.spec_from_file_location("nextec_coordinator_painel_test", str(SOURCE))
coordinator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(coordinator)


class PainelConfiguravelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "inscricao.json"

    def write(self, painel):
        self.path.write_text(json.dumps({"v": 1, "painel": painel, "chave": "C" * 20}), encoding="utf-8")

    def resolve(self):
        return coordinator.resolve_panel([self.path], expected_uid=None)

    def test_host_da_config_vence_o_padrao(self):
        self.write("https://novo-painel.exemplo.com.br")
        panel, source = self.resolve()
        self.assertEqual(panel, "https://novo-painel.exemplo.com.br")
        self.assertEqual(source, str(self.path))

    def test_http_recusado(self):
        self.write("http://novo-painel.exemplo.com.br")
        self.assertEqual(self.resolve(), (coordinator.DEFAULT_PANEL, "padrao"))

    def test_host_com_credencial_recusado(self):
        for ruim in ("https://user:pw@painel.exemplo.com", "https://painel.exemplo.com@evil.com",
                     "https://10.1.2.3", "https://painel.exemplo.com:8443", "https://painel.exemplo.com/x",
                     "https://localhost", "https://painel.exemplo.com?x=1"):
            self.write(ruim)
            self.assertEqual(self.resolve(), (coordinator.DEFAULT_PANEL, "padrao"), ruim)

    def test_arquivo_ausente_cai_no_padrao(self):
        panel, source = coordinator.resolve_panel([self.path], expected_uid=None)
        self.assertEqual((panel, source), (coordinator.DEFAULT_PANEL, "padrao"))

    def test_json_invalido_cai_no_padrao(self):
        self.path.write_text("{nao e json", encoding="utf-8")
        self.assertEqual(self.resolve()[1], "padrao")

    def test_main_avisa_quando_usa_padrao(self):
        import io, contextlib
        old = coordinator.PANEL_SOURCE
        coordinator.PANEL_SOURCE = "padrao"
        buf = io.StringIO()
        try:
            with contextlib.redirect_stderr(buf):
                if hasattr(os, "geteuid") and os.geteuid() == 0:
                    coordinator.main(cycle=lambda: "pending")
                else:
                    self.skipTest("main exige root")
        finally:
            coordinator.PANEL_SOURCE = old
        self.assertIn("painel padrao", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
