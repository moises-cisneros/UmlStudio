"""Provider adapter tests for plain-text completion."""

import asyncio
import json
import unittest
from unittest.mock import patch

import httpx

from src.core.config import settings


class TestTextCompletionAdapters(unittest.TestCase):
    def test_ollama_requests_plain_text_without_json_response_format(self):
        from src.adapters.ollama import OllamaAdapter

        def respond(request):
            payload = json.loads(request.content)
            self.assertNotIn("response_format", payload)
            self.assertEqual(payload["messages"][-1]["content"], "Explain interfaces")
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "An interface is a contract."}}]}
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.ollama.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            answer = asyncio.run(
                OllamaAdapter(endpoint_url="http://ollama.invalid/v1").complete_text(
                    "Explain interfaces"
                )
            )
        self.assertEqual(answer, "An interface is a contract.")

    def test_gemini_requests_plain_text_without_json_response_format(self):
        from src.adapters.gemini import GeminiAdapter

        def respond(request):
            payload = json.loads(request.content)
            self.assertNotIn("response_mime_type", payload["generationConfig"])
            self.assertEqual(payload["contents"][0]["parts"][0]["text"], "Explain interfaces")
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": "An interface is a contract."}]}}
                    ]
                },
            )

        transport = httpx.MockTransport(respond)
        async_client = httpx.AsyncClient
        with patch(
            "src.adapters.gemini.httpx.AsyncClient",
            lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            answer = asyncio.run(
                GeminiAdapter(model_name="test", api_key="test-key").complete_text(
                    "Explain interfaces"
                )
            )
        self.assertEqual(answer, "An interface is a contract.")

    def test_auto_text_completion_falls_back_from_gemini_to_ollama(self):
        from src.adapters import auto
        from src.adapters.auto import AutoAdaptiveAdapter

        calls = []

        class FakeGemini:
            provider_name = "gemini"

            async def complete_text(self, prompt):
                calls.append(("gemini", prompt))
                raise RuntimeError("unavailable")

        class FakeOllama:
            provider_name = "ollama"

            async def is_available(self):
                return True

            async def complete_text(self, prompt):
                calls.append(("ollama", prompt))
                return "Local answer"

        with patch.object(settings, "GEMINI_API_KEY", "test-key"), patch.object(
            auto, "GeminiAdapter", FakeGemini
        ), patch.object(auto, "OllamaAdapter", FakeOllama):
            adapter = AutoAdaptiveAdapter(mode="auto")
            answer = asyncio.run(adapter.complete_text("Explain interfaces"))
        self.assertEqual(answer, "Local answer")
        self.assertEqual(adapter.provider_name, "ollama")
        self.assertEqual(
            calls,
            [("gemini", "Explain interfaces"), ("ollama", "Explain interfaces")],
        )


if __name__ == "__main__":
    unittest.main()
