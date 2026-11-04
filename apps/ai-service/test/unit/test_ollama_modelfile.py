"""
Unit tests for the versioned Ollama Modelfile and umlstudio-mentor configuration.
Traceability: Ciclo 2 · Iteración I2 · CU-15 (Mentor) · RF-57 · Issue #29
"""

import asyncio
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import httpx

from src.core.config import settings
from src.adapters.ollama import OllamaAdapter


class TestOllamaModelfile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Resolve repo root and ai-service root
        cls.ai_service_dir = Path(__file__).resolve().parent.parent.parent
        cls.modelfile_path = cls.ai_service_dir / "ollama" / "Modelfile"
        cls.readme_path = cls.ai_service_dir / "ollama" / "README.md"

    def test_modelfile_exists_and_contains_expected_parameters(self):
        """Verify Modelfile exists and specifies chosen candidate model, temperature and num_ctx."""
        self.assertTrue(
            self.modelfile_path.is_file(),
            f"Modelfile not found at expected path: {self.modelfile_path}",
        )
        content = self.modelfile_path.read_text(encoding="utf-8")

        # Base model chosen from Issue #28 benchmark
        self.assertIn("FROM qwen2.5:7b-instruct", content)

        # Deterministic temperature for UML advice
        self.assertIn("PARAMETER temperature 0.2", content)

        # 8k context window to support serialized UML diagrams
        self.assertIn("PARAMETER num_ctx 8192", content)

        # Stop tokens
        self.assertIn('PARAMETER stop "<|im_start|>"', content)
        self.assertIn('PARAMETER stop "<|im_end|>"', content)

    def test_modelfile_system_prompt_domain_and_mentor_rules(self):
        """Verify SYSTEM prompt enforces OMG UML 2.5 domain and CU-15 mentor guidelines."""
        content = self.modelfile_path.read_text(encoding="utf-8")
        self.assertIn("SYSTEM", content)

        # Domain rules: OMG UML 2.5 class diagrams exclusively
        self.assertIn("OMG UML 2.5", content)
        self.assertIn("Diagramas de Clases", content)
        self.assertIn("casos de uso", content)
        self.assertIn("secuencia", content)
        self.assertIn("BPMN", content)

        # Mentor mode (CU-15 / RF-57)
        self.assertIn("CU-15", content)
        self.assertIn("RF-57", content)
        self.assertIn("español", content)
        self.assertIn("ModelDiff", content)

    def test_readme_documents_creation_command(self):
        """Verify README documents `ollama create umlstudio-mentor -f Modelfile`."""
        self.assertTrue(
            self.readme_path.is_file(),
            f"Ollama README not found at {self.readme_path}",
        )
        readme = self.readme_path.read_text(encoding="utf-8")
        self.assertIn("ollama create umlstudio-mentor -f Modelfile", readme)
        self.assertIn("ollama create umlstudio-mentor -f apps/ai-service/ollama/Modelfile", readme)
        self.assertIn("OLLAMA_MODEL=umlstudio-mentor", readme)
        self.assertIn("qwen2.5:7b-instruct", readme)

    def test_ollama_adapter_with_umlstudio_mentor_model(self):
        """Verify OllamaAdapter routes completions using umlstudio-mentor."""
        adapter = OllamaAdapter(
            endpoint_url="http://localhost:11434/v1",
            model_name="umlstudio-mentor",
        )
        self.assertEqual(adapter.provider_name, "ollama (umlstudio-mentor)")

        def respond(request):
            payload = json.loads(request.content)
            self.assertEqual(payload["model"], "umlstudio-mentor")
            self.assertEqual(payload["messages"][-1]["content"], "¿Qué es una interfaz?")
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": "Una interfaz define un contrato de operaciones sin implementación."
                            }
                        }
                    ]
                },
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.ollama.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            answer = asyncio.run(adapter.complete_text("¿Qué es una interfaz?"))

        self.assertIn("contrato de operaciones", answer)

    def test_settings_supports_umlstudio_mentor_override(self):
        """Verify settings.OLLAMA_MODEL can be configured to umlstudio-mentor."""
        with patch.object(settings, "OLLAMA_MODEL", "umlstudio-mentor"):
            adapter = OllamaAdapter(endpoint_url="http://localhost:11434/v1")
            self.assertEqual(adapter.model_name, "umlstudio-mentor")
            self.assertEqual(adapter.provider_name, "ollama (umlstudio-mentor)")


if __name__ == "__main__":
    unittest.main()
