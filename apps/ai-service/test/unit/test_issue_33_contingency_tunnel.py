import asyncio
import os
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

from src.adapters.ollama import OllamaAdapter
from src.core.config import settings
from ollama.contingency_tunnel import (
    format_render_env_vars,
    generate_bearer_token,
    get_caddyfile_path,
    validate_caddyfile,
)


class TestIssue33ContingencyTunnel(unittest.IsolatedAsyncioTestCase):
    """Test suite for Issue #33 / Backlog E5-06: Contingency Tunnel."""

    def test_caddyfile_structure_and_bearer_auth(self):
        caddyfile_path = get_caddyfile_path()
        self.assertTrue(caddyfile_path.exists(), "Caddyfile must exist in apps/ai-service/ollama/")
        self.assertTrue(
            validate_caddyfile(caddyfile_path),
            "Caddyfile must configure :8080, Bearer header authorization, and reverse_proxy.",
        )
        content = caddyfile_path.read_text(encoding="utf-8")
        self.assertIn("@authorized header Authorization", content)
        self.assertIn("Bearer {$CONTINGENCY_BEARER_TOKEN}", content)
        self.assertIn("reverse_proxy localhost:11434", content)
        self.assertIn("401", content)

    def test_render_environment_variables_format(self):
        token = generate_bearer_token()
        self.assertGreaterEqual(len(token), 32)

        env_vars = format_render_env_vars(
            tunnel_url="https://test-subdomain.trycloudflare.com",
            token=token,
            model="umlstudio-mentor",
        )
        self.assertEqual(env_vars["OLLAMA_URL"], "https://test-subdomain.trycloudflare.com/v1")
        self.assertEqual(env_vars["OLLAMA_AUTH"], "bearer")
        self.assertEqual(env_vars["OLLAMA_API_KEY"], token)
        self.assertEqual(env_vars["OLLAMA_MODEL"], "umlstudio-mentor")

    async def test_ollama_adapter_authenticates_with_contingency_bearer_token(self):
        token = "secret-contingency-bearer-token-12345"

        mock_post = MagicMock(
            status_code=200,
            json=lambda: {
                "choices": [
                    {
                        "message": {
                            "content": "Contingency answer from laptop model.",
                            "role": "assistant",
                        }
                    }
                ]
            },
        )

        with patch.object(settings, "OLLAMA_AUTH", "bearer"), patch.object(
            settings, "OLLAMA_API_KEY", token
        ), patch("httpx.AsyncClient.post", AsyncMock(return_value=mock_post)) as mock_client_post:
            adapter = OllamaAdapter(endpoint_url="http://127.0.0.1:8080/v1")
            response = await adapter.complete_text("¿Qué es una relación de agregación?")
            self.assertEqual(response, "Contingency answer from laptop model.")
            mock_client_post.assert_called_once()
            called_headers = mock_client_post.call_args[1].get("headers", {})
            self.assertEqual(called_headers.get("Authorization"), f"Bearer {token}")


if __name__ == "__main__":
    unittest.main()
