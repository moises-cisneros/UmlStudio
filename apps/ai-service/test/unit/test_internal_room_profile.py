"""Contract tests for private, closed-schema Room teaching-profile derivation."""

import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.core.config import settings
from src.main import app


PATH = "/internal/v1/room/profile"


class StubAdapter:
    provider_name = "stub-self-hosted"

    def __init__(self, response):
        self.response = response
        self.prompts = []

    async def complete_text(self, prompt):
        self.prompts.append(prompt)
        return self.response


class TestInternalRoomProfile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def post(self, interaction="Could you explain this relationship?", profile=None, token="test-secret", headers=None):
        request_headers = {"X-Internal-Token": token} if token is not None else {}
        request_headers.update(headers or {})
        return self.client.post(PATH, json={
            "profile": profile or {"detailLevel": "balanced", "exampleStyle": "analogy"},
            "interaction": interaction,
        }, headers=request_headers)

    def test_compares_prior_closed_profile_with_only_the_current_interaction(self):
        adapter = StubAdapter('{"profile":{"detailLevel":"step_by_step","exampleStyle":"uml"}}')
        interaction = "Please explain this relationship step by step using UML examples."
        previous = {"detailLevel": "balanced", "exampleStyle": "analogy"}
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True), patch(
            "src.adapters.OllamaAdapter", return_value=adapter
        ) as factory, patch("src.adapters.get_adapter") as fallback, patch(
            "src.services.room_profile.count_room_ai_prompt_tokens", return_value=10
        ):
            response = self.post(interaction, profile=previous)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "profile": {"detailLevel": "step_by_step", "exampleStyle": "uml"}
        })
        self.assertIn(json.dumps(previous), adapter.prompts[0])
        self.assertIn(interaction, adapter.prompts[0])
        self.assertIn("current interaction", adapter.prompts[0].lower())
        self.assertNotIn("Please explain", response.text)
        factory.assert_called_once_with(endpoint_url="https://model.invalid/v1", model_name="configured-model")
        fallback.assert_not_called()

    def test_preserves_prior_profile_for_an_ordinary_question(self):
        previous = {"detailLevel": "concise", "exampleStyle": "code"}
        adapter = StubAdapter(json.dumps({"profile": previous}))
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True), patch(
            "src.adapters.OllamaAdapter", return_value=adapter
        ), patch("src.services.room_profile.count_room_ai_prompt_tokens", return_value=10):
            response = self.post("What does this association mean?", profile=previous)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"profile": previous})
        self.assertIn("preserve both prior values unchanged", adapter.prompts[0])

    def test_rejects_free_text_or_unknown_profile_values_without_returning_them(self):
        for output in (
            "Here is the profile: {\"detailLevel\":\"balanced\",\"exampleStyle\":\"uml\"}",
            '{"profile":{"detailLevel":"balanced","exampleStyle":"uml","notes":"PRIVATE"}}',
            '{"profile":{"detailLevel":"private_fact","exampleStyle":"uml"}}',
        ):
            adapter = StubAdapter(output)
            with self.subTest(output=output), patch.object(
                settings, "AI_INTERNAL_TOKEN", "test-secret", create=True
            ), patch.object(settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True), patch.object(
                settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
            ), patch("src.adapters.OllamaAdapter", return_value=adapter), patch(
                "src.services.room_profile.count_room_ai_prompt_tokens", return_value=10
            ):
                response = self.post()
            self.assertEqual(response.status_code, 502)
            self.assertNotIn("PRIVATE", response.text)

    def test_requires_internal_auth_and_rejects_browser_origins(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True):
            self.assertEqual(self.post(token=None).status_code, 401)
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

    def test_malformed_and_oversized_requests_are_rejected(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True):
            profile = {"detailLevel": "balanced", "exampleStyle": "analogy"}
            self.assertEqual(self.client.post(PATH, json={"profile": profile, "interaction": ""}, headers={
                "X-Internal-Token": "test-secret"
            }).status_code, 422)
            self.assertEqual(self.client.post(PATH, json={"profile": profile, "interaction": "x" * 16_001}, headers={
                "X-Internal-Token": "test-secret"
            }).status_code, 422)
            self.assertEqual(self.client.post(PATH, json={"profile": profile, "interaction": "x", "extra": "no"}, headers={
                "X-Internal-Token": "test-secret"
            }).status_code, 422)


if __name__ == "__main__":
    unittest.main()
