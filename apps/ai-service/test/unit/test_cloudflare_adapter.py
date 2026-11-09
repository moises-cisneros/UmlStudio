"""
Unit tests for CloudflareAdapter:
- complete_text
- stream_text
- generate_room_diff
- Fallback in AutoAdaptiveAdapter from Cloudflare to Ollama/Gemini
"""

import asyncio
import json
import unittest
from unittest.mock import patch

import httpx

from src.adapters.cloudflare import CloudflareAdapter
from src.adapters.auto import AutoAdaptiveAdapter
from src.core.config import settings
from src.models.uml import ModelDiff, DiffAddBlock, DiffElementAdd


class TestCloudflareAdapter(unittest.TestCase):
    def test_complete_text_success(self):
        def respond(request):
            payload = json.loads(request.content)
            self.assertEqual(payload["messages"][-1]["content"], "Explain UML classes")
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "result": {
                        "choices": [{"message": {"content": "A class represents an entity."}}]
                    },
                },
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.cloudflare.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            adapter = CloudflareAdapter(account_id="acc123", api_token="tok123")
            answer = asyncio.run(adapter.complete_text("Explain UML classes"))

        self.assertEqual(answer, "A class represents an entity.")

    def test_complete_text_legacy_response_format(self):
        def respond(request):
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "result": {
                        "response": "Legacy format answer"
                    },
                },
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.cloudflare.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            adapter = CloudflareAdapter(account_id="acc123", api_token="tok123")
            answer = asyncio.run(adapter.complete_text("Test"))

        self.assertEqual(answer, "Legacy format answer")

    def test_complete_text_empty_raises(self):
        def respond(request):
            return httpx.Response(
                200,
                json={"success": True, "result": {"response": ""}},
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.cloudflare.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            adapter = CloudflareAdapter(account_id="acc123", api_token="tok123")
            with self.assertRaises(ValueError):
                asyncio.run(adapter.complete_text("Test"))

    def test_stream_text_yields_deltas(self):
        sse_body = (
            'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":" world"}}]}\n\n'
            'data: [DONE]\n\n'
        )

        def respond(request):
            return httpx.Response(
                200,
                headers={"Content-Type": "text/event-stream"},
                content=sse_body.encode("utf-8"),
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.cloudflare.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            adapter = CloudflareAdapter(account_id="acc123", api_token="tok123")

            async def collect():
                chunks = []
                async for chunk in adapter.stream_text("Say hello"):
                    chunks.append(chunk)
                return chunks

            deltas = asyncio.run(collect())

        self.assertEqual(deltas, ["Hello", " world"])

    def test_generate_room_diff_success(self):
        diff_json = json.dumps({
            "add": {
                "elements": [{"name": "Invoice", "type": "class", "attributes": [], "methods": []}],
                "relationships": []
            }
        })

        def respond(request):
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "result": {
                        "choices": [{"message": {"content": diff_json}}]
                    },
                },
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.cloudflare.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            adapter = CloudflareAdapter(account_id="acc123", api_token="tok123")
            diff = asyncio.run(adapter.generate_room_diff("Create Invoice", {}, "sys prompt"))

        self.assertIsInstance(diff, ModelDiff)
        self.assertEqual(len(diff.add.elements), 1)
        self.assertEqual(diff.add.elements[0].name, "Invoice")

    def test_auto_text_completion_tries_cloudflare_first(self):
        calls = []

        class FakeCloudflare:
            provider_name = "cloudflare"

            async def complete_text(self, prompt):
                calls.append("cloudflare")
                return "Cloudflare answer"

        with patch.object(settings, "CLOUDFLARE_ACCOUNT_ID", "acc"), patch.object(
            settings, "CLOUDFLARE_API_TOKEN", "tok"
        ), patch("src.adapters.auto.CloudflareAdapter", FakeCloudflare):
            adapter = AutoAdaptiveAdapter(mode="auto")
            answer = asyncio.run(adapter.complete_text("Explain"))

        self.assertEqual(answer, "Cloudflare answer")
        self.assertEqual(calls, ["cloudflare"])

    def test_auto_text_completion_falls_back_from_cloudflare_to_local_ollama(self):
        calls = []

        class FailingCloudflare:
            provider_name = "cloudflare"

            async def complete_text(self, prompt):
                calls.append("cloudflare_fail")
                raise RuntimeError("Cloudflare rate limited")

        class FakeOllama:
            provider_name = "ollama"

            async def is_available(self):
                return True

            async def complete_text(self, prompt):
                calls.append("ollama_success")
                return "Local Ollama answer"

        with patch.object(settings, "CLOUDFLARE_ACCOUNT_ID", "acc"), patch.object(
            settings, "CLOUDFLARE_API_TOKEN", "tok"
        ), patch.object(settings, "GEMINI_API_KEY", ""), patch(
            "src.adapters.auto.CloudflareAdapter", FailingCloudflare
        ), patch("src.adapters.auto.OllamaAdapter", FakeOllama):
            adapter = AutoAdaptiveAdapter(mode="auto")
            answer = asyncio.run(adapter.complete_text("Explain"))

        self.assertEqual(answer, "Local Ollama answer")
        self.assertEqual(calls, ["cloudflare_fail", "ollama_success"])


if __name__ == "__main__":
    unittest.main()
