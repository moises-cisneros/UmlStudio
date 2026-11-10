"""Contract tests for private, closed-schema Room teaching-profile derivation."""

from contextlib import redirect_stdout
import io
import json
import os
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

    def test_self_hosted_profile_uses_configured_room_timeout(self):
        from src.services.room_profile import _self_hosted_adapter

        adapter = object()
        with patch.object(settings, "ROOM_AI_SELF_HOSTED_URL", "http://127.0.0.1:8766/v1"), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "room-model"
        ), patch.object(settings, "ROOM_AI_REQUEST_TIMEOUT_SECONDS", 300.0, create=True), patch(
            "src.adapters.OllamaAdapter", return_value=adapter
        ) as factory:
            self.assertIs(_self_hosted_adapter(), adapter)

        factory.assert_called_once_with(
            endpoint_url="http://127.0.0.1:8766/v1",
            model_name="room-model",
            timeout_seconds=300.0,
        )

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
            "profile": {
                "detailLevel": "step_by_step",
                "exampleStyle": "uml",
                "preferences": [],
            }
        })
        self.assertIn(json.dumps({**previous, "preferences": []}), adapter.prompts[0])
        self.assertIn(interaction, adapter.prompts[0])
        self.assertIn("current interaction", adapter.prompts[0].lower())
        self.assertNotIn("Please explain", response.text)
        factory.assert_called_once_with(
            endpoint_url="https://model.invalid/v1",
            model_name="configured-model",
            timeout_seconds=45.0,
        )
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
        self.assertEqual(response.json(), {"profile": {**previous, "preferences": []}})
        self.assertIn("preserve both prior values unchanged", adapter.prompts[0])

    def test_profile_prompt_requires_explicit_preferences_without_a_uml_change(self):
        previous = {"detailLevel": "balanced", "exampleStyle": "none"}
        adapter = StubAdapter(json.dumps({"profile": {
            **previous,
            "preferences": ["Usar nombres de atributos en mayúsculas"],
        }}))
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True), patch(
            "src.adapters.OllamaAdapter", return_value=adapter
        ), patch("src.services.room_profile.count_room_ai_prompt_tokens", return_value=10):
            response = self.post("Me gustan los atributos en mayúsculas, recuérdalo", profile=previous)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"]["preferences"], [
            "Usar nombres de atributos en mayúsculas"
        ])
        self.assertIn("MUST update preferences", adapter.prompts[0])
        self.assertIn("Preserve the interaction language", adapter.prompts[0])

    def test_preserves_explicit_preference_when_provider_returns_the_prior_profile(self):
        previous = {"detailLevel": "balanced", "exampleStyle": "none"}
        adapter = StubAdapter(json.dumps({"profile": previous}))
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True), patch(
            "src.adapters.OllamaAdapter", return_value=adapter
        ), patch("src.services.room_profile.count_room_ai_prompt_tokens", return_value=10):
            response = self.post("me gustan los atributos en mayusculas, recuerdalo", profile=previous)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"]["preferences"], [
            "me gustan los atributos en mayusculas"
        ])

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

    def test_room_profile_logs_are_disabled_by_default_in_production(self):
        adapter = StubAdapter('{"profile":{"detailLevel":"step_by_step","exampleStyle":"uml"}}')
        buf = io.StringIO()
        with patch.dict(os.environ, {"ROOM_AI_DEV_LOGS": ""}, clear=False), patch.object(
            settings, "AI_INTERNAL_TOKEN", "test-secret", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch("src.adapters.OllamaAdapter", return_value=adapter), patch(
            "src.services.room_profile.count_room_ai_prompt_tokens", return_value=10
        ), redirect_stdout(buf):
            response = self.post("PROD_PROFILE_INTERACTION_CANARY")
        self.assertEqual(response.status_code, 200)
        output = buf.getvalue()
        self.assertNotIn("PROD_PROFILE_INTERACTION_CANARY", output)
        self.assertNotIn("ROOM AI:", output)
        self.assertNotIn("Question:", output)

    def test_room_profile_dev_logs_include_lifecycle_without_leaking_interaction_or_profile_values(self):
        adapter = StubAdapter('{"profile":{"detailLevel":"step_by_step","exampleStyle":"uml"}}')
        buf = io.StringIO()
        with patch.dict(os.environ, {"ROOM_AI_DEV_LOGS": "1"}, clear=False), patch.object(
            settings, "AI_INTERNAL_TOKEN", "PROFILE_SECRET_TOKEN_CANARY", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch("src.adapters.OllamaAdapter", return_value=adapter), patch(
            "src.services.room_profile.count_room_ai_prompt_tokens", return_value=10
        ), redirect_stdout(buf):
            response = self.post(
                interaction="PRIVATE_INTERACTION_TEXT_CANARY: explain with code examples",
                profile={"detailLevel": "concise", "exampleStyle": "analogy"},
                token="PROFILE_SECRET_TOKEN_CANARY",
                headers={
                    "X-Custom-Header": "PROFILE_HEADER_CANARY",
                    "X-Room-AI-Message-ID": "message-123",
                },
            )
        self.assertEqual(response.status_code, 200)
        output = buf.getvalue()
        self.assertIn("[ROOM AI: PROFILE START]", output)
        self.assertIn("[ROOM AI: PROFILE SUCCESS]", output)
        self.assertIn("* Mode: profile", output)
        self.assertIn("* Provider: self_hosted", output)
        self.assertIn("* Provider: stub-self-hosted", output)
        self.assertIn("* Status: success", output)
        self.assertIn("* Message ID: message-123", output)
        self.assertIn("* Prompt tokens: 10 / 10,000", output)
        self.assertIn("* Tokenization:", output)
        self.assertIn("* Inference:", output)
        self.assertIn("* Total:", output)
        self.assertIn("* Output tokens: unavailable", output)
        for forbidden in (
            "Question:",
            "PRIVATE_INTERACTION_TEXT_CANARY",
            "explain with code examples",
            "detailLevel",
            "exampleStyle",
            "concise",
            "analogy",
            "step_by_step",
            "uml",
            "PROFILE_SECRET_TOKEN_CANARY",
            "PROFILE_HEADER_CANARY",
            "X-Internal-Token",
        ):
            self.assertNotIn(forbidden, output)

    def test_room_profile_dev_logs_record_failure_without_leaking_raw_exceptions_or_output(self):
        class FailingAdapter:
            provider_name = "stub-self-hosted"

            async def complete_text(self, prompt):
                raise RuntimeError("RAW_PROFILE_EXCEPTION_SECRET_CANARY")

        buf = io.StringIO()
        with patch.dict(os.environ, {"ROOM_AI_DEV_LOGS": "1"}, clear=False), patch.object(
            settings, "AI_INTERNAL_TOKEN", "test-secret", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch("src.adapters.OllamaAdapter", return_value=FailingAdapter()), patch(
            "src.services.room_profile.count_room_ai_prompt_tokens", return_value=10
        ), redirect_stdout(buf):
            response = self.post("PRIVATE_FAILURE_INTERACTION_CANARY")
        self.assertEqual(response.status_code, 502)
        output = buf.getvalue()
        self.assertIn("[ROOM AI: PROFILE START]", output)
        self.assertIn("[ROOM AI: PROFILE FAILURE]", output)
        self.assertIn("* Status: failure", output)
        self.assertIn("* Mode: profile", output)
        self.assertIn("* Provider: stub-self-hosted", output)
        self.assertIn("* Failure stage: provider_inference", output)
        self.assertIn("* Failure reason: provider_inference_failed", output)
        self.assertIn("* Prompt tokens: 10 / 10,000", output)
        self.assertIn("* Total:", output)
        self.assertNotIn("RAW_PROFILE_EXCEPTION_SECRET_CANARY", output)
        self.assertNotIn("PRIVATE_FAILURE_INTERACTION_CANARY", output)


if __name__ == "__main__":
    unittest.main()
