"""Tests for the optional OpenAI-compatible Vertex bridge adapter."""

import asyncio
import json
import unittest
from unittest.mock import patch

import httpx

from src.models.uml import ModelDiff


class TestVertexBridgeAdapter(unittest.TestCase):
    def test_uses_openai_endpoint_tools_and_dedicated_bearer_token(self):
        from src.adapters.vertex_bridge import VertexBridgeAdapter

        def respond(request):
            self.assertEqual(request.url.path, "/v1/chat/completions")
            self.assertEqual(request.headers["authorization"], "Bearer bridge-token")
            payload = json.loads(request.content)
            self.assertEqual(payload["model"], "google/gemini-test")
            self.assertIn("tools", payload)
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": "{}"}}]},
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.vertex_bridge.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ), patch("src.adapters.vertex_bridge.parse_and_validate_diff_payload", return_value=ModelDiff()):
            result = asyncio.run(
                VertexBridgeAdapter(
                    endpoint_url="http://vertex.invalid/v1/",
                    model_name="google/gemini-test",
                    api_key="bridge-token",
                ).generate_diff("Add a class", {})
            )
        self.assertIsInstance(result, ModelDiff)

    def test_availability_probes_models(self):
        from src.adapters.vertex_bridge import VertexBridgeAdapter

        transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"data": []}))
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.vertex_bridge.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            available = asyncio.run(
                VertexBridgeAdapter(
                    endpoint_url="http://vertex.invalid/v1", model_name="google/gemini-test"
                ).is_available()
            )
        self.assertTrue(available)

    def test_provider_factory_supports_vertex_alias(self):
        from src.adapters import get_adapter
        from src.adapters.vertex_bridge import VertexBridgeAdapter

        self.assertIsInstance(get_adapter("vertex-bridge"), VertexBridgeAdapter)


if __name__ == "__main__":
    unittest.main()
