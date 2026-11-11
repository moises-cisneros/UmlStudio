"""
Unit tests for Issue #16:
- CORS origin restriction and env-based configurability.
- Configurable auth headers for the Ollama adapter.
- Configurable provider order for the room via ROOM_PROVIDER_ORDER (defaults to ollama,gemini).
- Stronger default local model (qwen2.5:7b-instruct).
"""

import asyncio
import json
import os
import unittest
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient
import httpx

from src.adapters.auto import AutoAdaptiveAdapter
from src.adapters.ollama import OllamaAdapter
from src.adapters.gemini import GeminiAdapter
from src.core.config import settings
from src.main import app
from src.models.uml import ModelDiff, DiffAddBlock, DiffElementAdd


class TestCorsOriginRestriction(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_default_cors_allows_localhost_5173(self):
        with patch.object(settings, "CORS_ORIGIN", "http://localhost:5173"):
            response = self.client.get("/health", headers={"Origin": "http://localhost:5173"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")

    def test_disallowed_origin_does_not_receive_cors_header(self):
        with patch.object(settings, "CORS_ORIGIN", "http://localhost:5173"):
            response = self.client.get("/health", headers={"Origin": "https://malicious.site"})
            self.assertEqual(response.status_code, 200)
            self.assertIsNone(response.headers.get("access-control-allow-origin"))

    def test_preflight_for_disallowed_origin_is_rejected(self):
        with patch.object(settings, "CORS_ORIGIN", "http://localhost:5173"):
            preflight = self.client.options(
                "/health",
                headers={
                    "Origin": "https://malicious.site",
                    "Access-Control-Request-Method": "GET",
                },
            )
            self.assertEqual(preflight.status_code, 400)
            self.assertIsNone(preflight.headers.get("access-control-allow-origin"))

    def test_preflight_for_allowed_origin_is_accepted(self):
        with patch.object(settings, "CORS_ORIGIN", "http://localhost:5173"):
            preflight = self.client.options(
                "/health",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )
            self.assertEqual(preflight.status_code, 200)
            self.assertEqual(preflight.headers.get("access-control-allow-origin"), "http://localhost:5173")

    def test_changing_cors_origin_via_env_var(self):
        with patch.object(settings, "CORS_ORIGIN", "https://umlstudio.com"):
            response = self.client.get("/health", headers={"Origin": "https://umlstudio.com"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers.get("access-control-allow-origin"), "https://umlstudio.com")

            old_origin_resp = self.client.get("/health", headers={"Origin": "http://localhost:5173"})
            self.assertEqual(old_origin_resp.status_code, 200)
            self.assertIsNone(old_origin_resp.headers.get("access-control-allow-origin"))

    def test_multiple_comma_separated_origins(self):
        with patch.object(settings, "CORS_ORIGIN", "http://localhost:5173,https://umlstudio.app"):
            r1 = self.client.get("/health", headers={"Origin": "http://localhost:5173"})
            self.assertEqual(r1.headers.get("access-control-allow-origin"), "http://localhost:5173")

            r2 = self.client.get("/health", headers={"Origin": "https://umlstudio.app"})
            self.assertEqual(r2.headers.get("access-control-allow-origin"), "https://umlstudio.app")

            r3 = self.client.get("/health", headers={"Origin": "http://other.domain"})
            self.assertIsNone(r3.headers.get("access-control-allow-origin"))

    def test_default_cors_allows_pages_dev_and_preview_subdomains(self):
        with patch.object(settings, "CORS_ORIGIN", ""):
            r1 = self.client.get("/health", headers={"Origin": "https://umlstudio.pages.dev"})
            self.assertEqual(r1.headers.get("access-control-allow-origin"), "https://umlstudio.pages.dev")

            r2 = self.client.get("/health", headers={"Origin": "https://preview-123.umlstudio.pages.dev"})
            self.assertEqual(r2.headers.get("access-control-allow-origin"), "https://preview-123.umlstudio.pages.dev")

    def test_default_cors_allows_loopback_and_alternate_ports(self):
        with patch.object(settings, "CORS_ORIGIN", ""):
            r1 = self.client.get("/health", headers={"Origin": "http://127.0.0.1:5173"})
            self.assertEqual(r1.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173")

            r2 = self.client.get("/health", headers={"Origin": "http://localhost:5174"})
            self.assertEqual(r2.headers.get("access-control-allow-origin"), "http://localhost:5174")


class TestOllamaAuthConfig(unittest.TestCase):
    def test_default_ollama_has_no_auth_headers_when_unset(self):
        with patch.object(settings, "OLLAMA_API_KEY", ""), patch.object(settings, "OLLAMA_AUTH_HEADER", ""):
            headers = settings.get_ollama_headers()
            self.assertEqual(headers, {})

    def test_ollama_api_key_sets_bearer_auth(self):
        with patch.object(settings, "OLLAMA_API_KEY", "tunnel-secret-123"), patch.object(settings, "OLLAMA_AUTH_HEADER", ""):
            headers = settings.get_ollama_headers()
            self.assertEqual(headers, {"Authorization": "Bearer tunnel-secret-123"})

    def test_ollama_api_key_keeps_existing_bearer_prefix(self):
        with patch.object(settings, "OLLAMA_API_KEY", "Bearer custom-token"), patch.object(settings, "OLLAMA_AUTH_HEADER", ""):
            headers = settings.get_ollama_headers()
            self.assertEqual(headers, {"Authorization": "Bearer custom-token"})

    def test_ollama_auth_header_custom_name_value(self):
        with patch.object(settings, "OLLAMA_API_KEY", ""), patch.object(settings, "OLLAMA_AUTH_HEADER", "X-Custom-Token: secret-val"):
            headers = settings.get_ollama_headers()
            self.assertEqual(headers, {"X-Custom-Token": "secret-val"})

    def test_ollama_auth_header_bearer_format(self):
        with patch.object(settings, "OLLAMA_API_KEY", ""), patch.object(settings, "OLLAMA_AUTH_HEADER", "Bearer my-token"):
            headers = settings.get_ollama_headers()
            self.assertEqual(headers, {"Authorization": "Bearer my-token"})

    def test_adapter_sends_auth_headers_in_all_requests(self):
        sent_requests = []

        def handler(request: httpx.Request):
            sent_requests.append({
                "url": str(request.url),
                "auth": request.headers.get("authorization"),
                "method": request.method,
            })
            if request.url.path.endswith("/models"):
                return httpx.Response(200, json={"models": []})
            if request.url.path.endswith("/chat/completions"):
                content = json.dumps({"choices": [{"message": {"content": "Sample response"}}]})
                return httpx.Response(200, content=content.encode("utf-8"), headers={"content-type": "application/json"})
            return httpx.Response(404)

        transport = httpx.MockTransport(handler)
        client_cls = httpx.AsyncClient
        with patch.object(settings, "OLLAMA_API_KEY", "test-token"), patch(
            "src.adapters.ollama.httpx.AsyncClient",
            lambda **kwargs: client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"}),
        ):
            adapter = OllamaAdapter(endpoint_url="http://mock-ollama:11434/v1")
            # 1. is_available
            available = asyncio.run(adapter.is_available())
            self.assertTrue(available)

            # 2. complete_text
            text = asyncio.run(adapter.complete_text("Hello"))
            self.assertEqual(text, "Sample response")

        self.assertEqual(len(sent_requests), 2)
        self.assertEqual(sent_requests[0]["auth"], "Bearer test-token")
        self.assertEqual(sent_requests[1]["auth"], "Bearer test-token")

    def test_explicit_headers_override_settings(self):
        adapter = OllamaAdapter(
            endpoint_url="http://mock:11434/v1",
            headers={"X-Override": "true", "Authorization": "Bearer explicit-token"},
        )
        self.assertEqual(adapter.headers.get("X-Override"), "true")
        self.assertEqual(adapter.headers.get("Authorization"), "Bearer explicit-token")

    def test_explicit_api_key_override(self):
        adapter = OllamaAdapter(
            endpoint_url="http://mock:11434/v1",
            api_key="direct-key",
        )
        self.assertEqual(adapter.headers.get("Authorization"), "Bearer direct-key")


class TestRoomProviderOrder(unittest.TestCase):
    def test_default_room_provider_order_is_ollama_then_gemini(self):
        with patch.object(settings, "ROOM_PROVIDER_ORDER", "ollama,gemini"):
            order = settings.get_room_provider_order()
            self.assertEqual(order, ["ollama", "gemini"])

    def test_room_adapter_prefers_ollama_first_by_default(self):
        calls = []

        class StubOllama:
            provider_name = "ollama (qwen2.5:7b-instruct)"

            async def is_available(self):
                calls.append("ollama_check")
                return True

            async def complete_text(self, prompt):
                calls.append("ollama_complete")
                return "Ollama explanation"

        class StubGemini:
            provider_name = "gemini (gemini-2.5-flash)"

            async def complete_text(self, prompt):
                calls.append("gemini_complete")
                return "Gemini explanation"

        with patch.object(settings, "ROOM_PROVIDER_ORDER", "ollama,gemini"), patch(
            "src.adapters.auto.OllamaAdapter", StubOllama
        ), patch("src.adapters.auto.GeminiAdapter", StubGemini):
            adapter = AutoAdaptiveAdapter(mode="room")
            result = asyncio.run(adapter.complete_text("Explain polymorphism"))

        self.assertEqual(result, "Ollama explanation")
        self.assertEqual(calls, ["ollama_check", "ollama_complete"])
        self.assertEqual(adapter.provider_name, "ollama (qwen2.5:7b-instruct)")

    def test_room_adapter_falls_back_to_gemini_when_ollama_fails(self):
        calls = []

        class FailingOllama:
            provider_name = "ollama (qwen2.5:7b-instruct)"

            async def is_available(self):
                calls.append("ollama_check")
                return True

            async def complete_text(self, prompt):
                calls.append("ollama_fail")
                raise RuntimeError("Ollama connection refused")

        class StubGemini:
            provider_name = "gemini (gemini-2.5-flash)"

            async def complete_text(self, prompt):
                calls.append("gemini_complete")
                return "Gemini explanation"

        with patch.object(settings, "ROOM_PROVIDER_ORDER", "ollama,gemini"), patch.object(
            settings, "GEMINI_API_KEY", "gemini-key"
        ), patch("src.adapters.auto.OllamaAdapter", FailingOllama), patch(
            "src.adapters.auto.GeminiAdapter", StubGemini
        ):
            adapter = AutoAdaptiveAdapter(mode="room")
            result = asyncio.run(adapter.complete_text("Explain polymorphism"))

        self.assertEqual(result, "Gemini explanation")
        self.assertEqual(calls, ["ollama_check", "ollama_fail", "gemini_complete"])
        self.assertEqual(adapter.provider_name, "gemini (gemini-2.5-flash)")

    def test_inverted_provider_order_tries_gemini_first(self):
        calls = []

        class StubOllama:
            provider_name = "ollama"

            async def is_available(self):
                calls.append("ollama_check")
                return True

            async def complete_text(self, prompt):
                calls.append("ollama_complete")
                return "Ollama explanation"

        class StubGemini:
            provider_name = "gemini"

            async def complete_text(self, prompt):
                calls.append("gemini_complete")
                return "Gemini explanation"

        with patch.object(settings, "ROOM_PROVIDER_ORDER", "gemini,ollama"), patch.object(
            settings, "GEMINI_API_KEY", "gemini-key"
        ), patch("src.adapters.auto.OllamaAdapter", StubOllama), patch(
            "src.adapters.auto.GeminiAdapter", StubGemini
        ):
            adapter = AutoAdaptiveAdapter(mode="room")
            result = asyncio.run(adapter.complete_text("Explain polymorphism"))

        self.assertEqual(result, "Gemini explanation")
        self.assertEqual(calls, ["gemini_complete"])
        self.assertEqual(adapter.provider_name, "gemini")

    def test_room_diff_follows_provider_order(self):
        calls = []
        expected_diff = ModelDiff(add=DiffAddBlock(elements=[DiffElementAdd(name="Course")]))

        class StubOllama:
            provider_name = "ollama"

            async def is_available(self):
                return True

            async def generate_room_diff(self, prompt, current_model, system_prompt):
                calls.append("ollama_diff")
                return expected_diff

        class StubGemini:
            provider_name = "gemini"

            async def generate_room_diff(self, prompt, current_model, system_prompt):
                calls.append("gemini_diff")
                return expected_diff

        with patch.object(settings, "ROOM_PROVIDER_ORDER", "ollama,gemini"), patch(
            "src.adapters.auto.OllamaAdapter", StubOllama
        ), patch("src.adapters.auto.GeminiAdapter", StubGemini):
            adapter = AutoAdaptiveAdapter(mode="room")
            diff = asyncio.run(adapter.generate_room_diff("Add Course", {}, "system"))

        self.assertEqual(diff, expected_diff)
        self.assertEqual(calls, ["ollama_diff"])

    def test_room_streaming_follows_provider_order(self):
        calls = []

        class StubOllama:
            provider_name = "ollama"

            async def is_available(self):
                return True

            async def stream_text(self, prompt):
                calls.append("ollama_stream")
                yield "Delta 1 "
                yield "Delta 2"

        class StubGemini:
            provider_name = "gemini"

            async def stream_text(self, prompt):
                calls.append("gemini_stream")
                yield "Gemini delta"

        with patch.object(settings, "ROOM_PROVIDER_ORDER", "ollama,gemini"), patch(
            "src.adapters.auto.OllamaAdapter", StubOllama
        ), patch("src.adapters.auto.GeminiAdapter", StubGemini):
            adapter = AutoAdaptiveAdapter(mode="room")

            async def collect():
                chunks = []
                async for chunk in adapter.stream_text("Explain"):
                    chunks.append(chunk)
                return chunks

            deltas = asyncio.run(collect())

        self.assertEqual(deltas, ["Delta 1 ", "Delta 2"])
        self.assertEqual(calls, ["ollama_stream"])

    def test_all_failing_room_providers_raise_explicit_error(self):
        class FailingOllama:
            provider_name = "ollama"

            async def is_available(self):
                return False

        with patch.object(settings, "ROOM_PROVIDER_ORDER", "ollama"), patch(
            "src.adapters.auto.OllamaAdapter", FailingOllama
        ):
            adapter = AutoAdaptiveAdapter(mode="room")
            with self.assertRaises(RuntimeError) as ctx:
                asyncio.run(adapter.complete_text("Explain"))
            self.assertIn("No configured AI provider in ['ollama'] is available", str(ctx.exception))


class TestDefaultLocalModel(unittest.TestCase):
    def test_default_ollama_model_is_stronger_qwen_not_gemma(self):
        self.assertEqual(settings.OLLAMA_MODEL, "qwen2.5:7b-instruct")
        self.assertNotEqual(settings.OLLAMA_MODEL, "gemma:2b")


if __name__ == "__main__":
    unittest.main()
