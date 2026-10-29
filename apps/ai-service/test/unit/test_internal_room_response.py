"""Contract tests for the server-only room inference endpoint."""

import unittest
import warnings
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.core.config import settings
from src.main import app
from src.models.uml import DiffAddBlock, DiffElementAdd, ModelDiff


PATH = "/internal/v1/room/respond"
REQUEST = {
    "mode": "explain",
    "requester": {"id": "user-1", "name": "Ada"},
    "question": "What is an interface?",
    "board": {"nodes": [{"id": "n1", "data": {"name": "Order"}}], "edges": []},
    "context": {"summary": "The room is modeling orders."},
}


class StubAdapter:
    provider_name = "stub"

    def __init__(self, diff=None):
        self.diff = diff if diff is not None else ModelDiff(
            add=DiffAddBlock(elements=[DiffElementAdd(name="Invoice")])
        )
        self.text_prompts = []
        self.diff_prompts = []

    async def complete_text(self, prompt):
        self.text_prompts.append(prompt)
        return "An interface defines a contract."

    async def generate_diff(self, prompt, current_model):
        self.diff_prompts.append((prompt, current_model))
        return self.diff


class TestInternalRoomResponse(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def post(self, body=REQUEST, token="test-secret", headers=None):
        request_headers = {"X-Internal-Token": token} if token is not None else {}
        request_headers.update(headers or {})
        return self.client.post(PATH, json=body, headers=request_headers)

    def test_explain_returns_text_without_a_diff_and_uses_room_context(self):
        adapter = StubAdapter()
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch(
            "src.adapters.get_adapter", return_value=adapter
        ):
            response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"text": "An interface defines a contract.", "diff": None, "provider": "stub"},
        )
        self.assertEqual(len(adapter.text_prompts), 1)
        self.assertIn("Ada", adapter.text_prompts[0])
        self.assertIn("Order", adapter.text_prompts[0])
        self.assertIn("The room is modeling orders.", adapter.text_prompts[0])
        self.assertEqual(adapter.diff_prompts, [])

    def test_change_returns_a_validated_diff_and_no_unrelated_public_change(self):
        adapter = StubAdapter()
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch(
            "src.adapters.get_adapter", return_value=adapter
        ):
            response = self.post({**REQUEST, "mode": "change", "question": "Add Invoice"})

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["provider"], "stub")
        self.assertTrue(data["text"])
        self.assertEqual(data["diff"]["add"]["elements"][0]["name"], "Invoice")
        self.assertEqual(adapter.text_prompts, [])
        self.assertEqual(adapter.diff_prompts[0][1], REQUEST["board"])
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_existing_public_cors_behavior_is_unchanged(self):
        response = self.client.get(
            "/health", headers={"Origin": "http://localhost:5173"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"], "http://localhost:5173"
        )

    def test_missing_invalid_and_unconfigured_tokens_are_unauthorized(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True):
            self.assertEqual(self.post(token=None).status_code, 401)
            self.assertEqual(self.post(token="wrong").status_code, 401)
        with patch.object(settings, "AI_INTERNAL_TOKEN", "", create=True):
            self.assertEqual(self.post().status_code, 401)

    def test_browser_origin_is_rejected_without_cors_exposure(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True):
            response = self.post(headers={"Origin": "https://example.invalid"})
            preflight = self.client.options(
                PATH,
                headers={
                    "Origin": "https://example.invalid",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "X-Internal-Token",
                },
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(preflight.status_code, 403)
        self.assertNotIn("access-control-allow-origin", response.headers)
        self.assertNotIn("access-control-allow-origin", preflight.headers)

    def test_private_context_rejects_shared_or_implicit_routes(self):
        private = {"notes": "PRIVATE MEMORY"}
        for routing in ({}, {"provider": "self_hosted", "route": "shared"},
                        {"route": "private"}, {"provider": "external", "route": "private"}):
            with self.subTest(routing=routing), patch.object(
                settings, "AI_INTERNAL_TOKEN", "test-secret"
            ), patch("src.adapters.get_adapter") as default:
                response = self.post({**REQUEST, **routing, "private_context": private})
                self.assertEqual(response.status_code, 422)
                default.assert_not_called()

    def test_private_self_hosted_route_never_uses_default_provider(self):
        adapter = StubAdapter()
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret"), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True), patch(
            "src.adapters.OllamaAdapter", return_value=adapter
        ) as factory, patch("src.adapters.get_adapter") as default, patch(
            "src.services.room_response.count_room_ai_prompt_tokens", return_value=10
        ):
            response = self.post({**REQUEST, "provider": "self_hosted", "route": "private",
                                  "private_context": {"notes": "PRIVATE MEMORY"}})
        self.assertEqual(response.status_code, 200)
        self.assertIn("PRIVATE MEMORY", adapter.text_prompts[0])
        factory.assert_called_once_with(endpoint_url="https://model.invalid/v1", model_name="configured-model")
        default.assert_not_called()

    def test_shared_self_hosted_route_does_not_receive_private_context(self):
        adapter = StubAdapter()
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret"), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True), patch(
            "src.adapters.OllamaAdapter", return_value=adapter
        ), patch("src.adapters.get_adapter") as default, patch(
            "src.services.room_response.count_room_ai_prompt_tokens", return_value=10
        ):
            response = self.post({**REQUEST, "provider": "self_hosted", "route": "shared"})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("PRIVATE MEMORY", adapter.text_prompts[0])
        default.assert_not_called()

    def test_self_hosted_requires_configuration_without_fallback(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret"), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "", create=True), patch(
            "src.adapters.get_adapter"
        ) as default:
            response = self.post({**REQUEST, "provider": "self_hosted", "route": "private"})
        self.assertEqual(response.status_code, 502)
        default.assert_not_called()

    def test_malformed_routing_is_rejected(self):
        for routing in ({"provider": "self_hosted"}, {"route": "shared"},
                        {"provider": "self_hosted", "route": "unknown"},
                        {"privateContext": {"notes": "PRIVATE MEMORY"}}):
            with self.subTest(routing=routing), patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret"):
                self.assertEqual(self.post({**REQUEST, **routing}).status_code, 422)

    def test_invalid_change_diff_is_never_returned(self):
        adapter = StubAdapter(diff={"unexpected": "value"})
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch(
            "src.adapters.get_adapter", return_value=adapter
        ):
            response = self.post({**REQUEST, "mode": "change"})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("unexpected", response.text)

    def test_empty_change_diff_is_not_reported_as_a_proposal(self):
        adapter = StubAdapter(diff=ModelDiff())
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch(
            "src.adapters.get_adapter", return_value=adapter
        ):
            response = self.post({**REQUEST, "mode": "change"})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("Propuesta de cambio UML generada", response.text)

    def test_corrupted_diff_does_not_leak_provider_content_in_warnings(self):
        adapter = StubAdapter(diff=ModelDiff.model_construct(add="PROVIDER_SECRET"))
        with warnings.catch_warnings(record=True) as caught, patch.object(
            settings, "AI_INTERNAL_TOKEN", "test-secret", create=True
        ), patch("src.adapters.get_adapter", return_value=adapter):
            warnings.simplefilter("always")
            response = self.post({**REQUEST, "mode": "change"})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("PROVIDER_SECRET", response.text)
        self.assertFalse(any("PROVIDER_SECRET" in str(item.message) for item in caught))
if __name__ == "__main__":
    unittest.main()
