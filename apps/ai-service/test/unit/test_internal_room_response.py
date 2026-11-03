"""Contract tests for the server-only room inference endpoint."""

import asyncio
import io
import os
import unittest
import warnings
from contextlib import redirect_stdout
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.core.config import settings
from src.main import app
from src.models.uml import (
    DiffAddBlock,
    DiffAttribute,
    DiffElementAdd,
    DiffElementModify,
    DiffElementModifyChanges,
    DiffModifyBlock,
    ModelDiff,
    RoomRespondRequest,
)
from src.services.room_response import RoomResponseService, _safe_provider_http_status


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

    async def stream_text(self, prompt):
        self.text_prompts.append(prompt)
        yield "An interface "
        yield "defines a contract."

    async def generate_diff(self, prompt, current_model):
        self.diff_prompts.append((prompt, current_model))
        return self.diff


class RoomChangeAdapter(StubAdapter):
    async def generate_room_diff(self, prompt, current_model, system_prompt):
        self.diff_prompts.append((prompt, current_model, system_prompt))
        return ModelDiff(
            modify=DiffModifyBlock(
                elements=[
                    DiffElementModify(
                        id="Persona",
                        changes=DiffElementModifyChanges(
                            attributes=[DiffAttribute(name="+ SEXO: String")]
                        ),
                    )
                ]
            )
        )


class TestInternalRoomResponse(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def post(self, body=REQUEST, token="test-secret", headers=None):
        request_headers = {"X-Internal-Token": token} if token is not None else {}
        request_headers.update(headers or {})
        return self.client.post(PATH, json=body, headers=request_headers)

    def test_failure_log_reports_safe_provider_status_without_exception_body(self):
        class FailingAdapter(StubAdapter):
            async def complete_text(self, prompt):
                raise RuntimeError(
                    "Ollama text completion failed (401): PROVIDER_BODY_SECRET_CANARY"
                )

        request = RoomRespondRequest.model_validate(
            {**REQUEST, "provider": "self_hosted", "route": "shared"}
        )
        buf = io.StringIO()
        with patch.dict(os.environ, {"ROOM_AI_DEV_LOGS": "1"}, clear=False), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "http://127.0.0.1:8765/v1", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch("src.adapters.OllamaAdapter", return_value=FailingAdapter()), patch(
            "src.services.room_response.count_room_ai_prompt_tokens", return_value=42
        ), redirect_stdout(buf), self.assertRaisesRegex(
            RuntimeError, "Ollama text completion failed"
        ):
            asyncio.run(RoomResponseService.respond(request, message_id="message-123"))
        output = buf.getvalue()
        self.assertEqual(
            _safe_provider_http_status(
                RuntimeError("Ollama text completion failed (401): PROVIDER_BODY_SECRET_CANARY")
            ),
            401,
        )
        self.assertEqual(
            _safe_provider_http_status(
                RuntimeError("Ollama error (502): PROVIDER_BODY_SECRET_CANARY")
            ),
            502,
        )
        self.assertEqual(
            _safe_provider_http_status(RuntimeError("LM Studio error (503): body")),
            503,
        )
        self.assertIsNone(_safe_provider_http_status(RuntimeError("unrelated 503 detail")))
        self.assertIn("* Failure stage: provider_inference", output)
        self.assertIn("* Failure reason: provider_inference_failed", output)
        self.assertIn("* Failure type: RuntimeError", output)
        self.assertIn("* Provider HTTP status: 401", output)
        self.assertNotIn("PROVIDER_BODY_SECRET_CANARY", output)

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

    def test_stream_explanation_emits_text_deltas_then_provider(self):
        adapter = StubAdapter()
        request = RoomRespondRequest.model_validate(REQUEST)

        async def collect():
            with patch("src.adapters.get_adapter", return_value=adapter):
                return [event async for event in RoomResponseService.stream_explanation(request)]

        events = asyncio.run(collect())
        self.assertEqual(
            events,
            [
                {"type": "delta", "text": "An interface "},
                {"type": "delta", "text": "defines a contract."},
                {"type": "done", "provider": "stub"},
            ],
        )

    def test_change_uses_compact_context_and_keeps_requester_preference(self):
        adapter = RoomChangeAdapter()
        request = RoomRespondRequest.model_validate(
            {
                "mode": "change",
                "requester": {"id": "user-1", "name": "Ada"},
                "question": "Te faltó el atributo sexo en la clase Persona",
                "board": {
                    "nodes": [{"id": "persona", "data": {"name": "Persona"}}],
                    "edges": [],
                },
                "context": {
                    "memory": {"summary": "Shared room", "decisions": []},
                    "threadMessages": [
                        {"author": {"id": "user-1"}, "text": "Prefiero atributos en MAYÚSCULA."}
                    ],
                    "publicMessages": [{"text": "PUBLIC_CONTEXT_CANARY"}],
                },
                "provider": "self_hosted",
                "route": "shared",
            }
        )
        with patch("src.services.room_response._room_adapter", return_value=adapter), patch(
            "src.services.room_response.count_room_ai_prompt_tokens", return_value=1
        ):
            response = asyncio.run(RoomResponseService.respond(request))

        self.assertIsNotNone(response.diff)
        prompt, current_model, system_prompt = adapter.diff_prompts[0]
        self.assertIn("MAYÚSCULA", prompt)
        self.assertIn("sexo", prompt)
        self.assertNotIn("PUBLIC_CONTEXT_CANARY", prompt)
        self.assertEqual(current_model, request.board)
        self.assertNotIn("EJEMPLOS CANÓNICOS", system_prompt)
        self.assertIn("Persona", system_prompt)

    def test_explain_prompt_requires_a_direct_concise_scannable_answer(self):
        adapter = StubAdapter()
        request = RoomRespondRequest.model_validate(
            {
                **REQUEST,
                "provider": "self_hosted",
                "route": "shared",
                "teaching_profile": {
                    "detailLevel": "balanced",
                    "exampleStyle": "uml",
                },
            }
        )
        with patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch("src.adapters.OllamaAdapter", return_value=adapter), patch(
            "src.services.room_response.count_room_ai_prompt_tokens", return_value=10
        ):
            response = asyncio.run(RoomResponseService.respond(request))

        self.assertEqual(response.text, "An interface defines a contract.")
        prompt = adapter.text_prompts[0]
        self.assertIn("Answer the current question directly", prompt)
        self.assertIn("Do not greet or re-introduce yourself", prompt)
        self.assertIn("concise and scannable", prompt)
        self.assertIn("one concise clarifying question", prompt)
        self.assertIn("Do not use Markdown syntax", prompt)
        self.assertIn("Never prefix the answer with the requester's name", prompt)
        self.assertIn("hyphen bullets", prompt)
        self.assertIn("detailLevel", prompt)
        self.assertIn("exampleStyle", prompt)

    def test_explain_uses_compact_semantic_context_not_duplicate_raw_board_json(self):
        adapter = StubAdapter()
        request = RoomRespondRequest.model_validate(
            {
                **REQUEST,
                "board": {
                    "nodes": [
                        {
                            "id": "raw",
                            "data": {
                                "name": "RAW_BOARD_CANARY",
                                "editorPayload": "RAW_BOARD_PAYLOAD_CANARY",
                            },
                        }
                    ],
                    "edges": [],
                },
                "context": {"boardDsl": "class Order { number: String }"},
            }
        )
        with patch("src.adapters.get_adapter", return_value=adapter):
            response = asyncio.run(RoomResponseService.respond(request))

        self.assertEqual(response.text, "An interface defines a contract.")
        self.assertIn("class Order { number: String }", adapter.text_prompts[0])
        self.assertNotIn("RAW_BOARD_CANARY", adapter.text_prompts[0])
        self.assertNotIn("RAW_BOARD_PAYLOAD_CANARY", adapter.text_prompts[0])

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

    def test_legacy_private_context_is_rejected(self):
        private = "PRIVATE MEMORY"
        for routing in ({}, {"provider": "self_hosted", "route": "shared"},
                        {"route": "private"}, {"provider": "external", "route": "private"}):
            with self.subTest(routing=routing), patch.object(
                settings, "AI_INTERNAL_TOKEN", "test-secret"
            ), patch("src.adapters.get_adapter") as default:
                response = self.post({**REQUEST, **routing, "private_context": private})
                self.assertEqual(response.status_code, 422)
                default.assert_not_called()

    def test_shared_response_receives_only_the_approved_closed_teaching_profile(self):
        adapter = StubAdapter()
        profile = {"detailLevel": "concise", "exampleStyle": "uml"}
        private_note = "PRIVATE_NOTE_CANARY: prefers concise examples"
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret"), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True), patch(
            "src.adapters.OllamaAdapter", return_value=adapter
        ) as factory, patch("src.adapters.get_adapter") as default, patch(
            "src.services.room_response.count_room_ai_prompt_tokens", return_value=10
        ):
            response = self.post({**REQUEST, "provider": "self_hosted", "route": "shared",
                                  "teaching_profile": profile})
        self.assertEqual(response.status_code, 200)
        self.assertIn('"detailLevel": "concise"', adapter.text_prompts[0])
        self.assertIn('"exampleStyle": "uml"', adapter.text_prompts[0])
        self.assertNotIn(private_note, adapter.text_prompts[0])
        factory.assert_called_once_with(endpoint_url="https://model.invalid/v1", model_name="configured-model")
        default.assert_not_called()

    def test_shared_self_hosted_route_works_without_personal_memory(self):
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
        self.assertNotIn("personal memory", adapter.text_prompts[0])
        default.assert_not_called()

    def test_self_hosted_requires_configuration_without_fallback(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret"), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "", create=True
        ), patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "", create=True), patch(
            "src.adapters.get_adapter"
        ) as default:
            response = self.post({**REQUEST, "provider": "self_hosted", "route": "shared"})
        self.assertEqual(response.status_code, 502)
        default.assert_not_called()

    def test_malformed_routing_is_rejected(self):
        for routing in ({"provider": "self_hosted"}, {"route": "shared"},
                        {"provider": "self_hosted", "route": "private"},
                        {"provider": "self_hosted", "route": "unknown"},
                        {"personal_memory": "x" * 16_001},
                        {"personal_memory": "PRIVATE_NOTE_CANARY"},
                        {"provider": "self_hosted", "route": "shared",
                         "teaching_profile": {"detailLevel": "balanced", "exampleStyle": "uml",
                                              "privateFact": "must be rejected"}},
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
        self.assertEqual(response.status_code, 422)
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

    def test_room_response_logs_are_disabled_by_default_in_production(self):
        adapter = StubAdapter()
        buf = io.StringIO()
        with patch.dict(os.environ, {"ROOM_AI_DEV_LOGS": ""}, clear=False), patch.object(
            settings, "AI_INTERNAL_TOKEN", "test-secret", create=True
        ), patch("src.adapters.get_adapter", return_value=adapter), redirect_stdout(buf):
            response = self.post(
                {**REQUEST, "question": "PROD_QUESTION_CANARY: how does inheritance work?"}
            )
        self.assertEqual(response.status_code, 200)
        output = buf.getvalue()
        self.assertNotIn("PROD_QUESTION_CANARY", output)
        self.assertNotIn("ROOM AI:", output)
        self.assertNotIn("Question:", output)

    def test_room_response_dev_logs_include_lifecycle_and_question_without_leaking_sensitive_data(self):
        adapter = StubAdapter()
        buf = io.StringIO()
        payload = {
            "mode": "explain",
            "requester": {"id": "user-99", "name": "AUTHOR_CANARY_ADA"},
            "question": "DEV_QUESTION_CANARY: Explain polymorphism?",
            "board": {"nodes": [{"id": "n1", "data": {"name": "BOARD_CLASS_CANARY"}}], "edges": []},
            "context": {"summary": "CONTEXT_SUMMARY_CANARY"},
            "provider": "self_hosted",
            "route": "shared",
            "teaching_profile": {"detailLevel": "concise", "exampleStyle": "analogy"},
        }
        with patch.dict(os.environ, {"ROOM_AI_DEV_LOGS": "1"}, clear=False), patch.object(
            settings, "AI_INTERNAL_TOKEN", "SECRET_TOKEN_CANARY", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch("src.adapters.OllamaAdapter", return_value=adapter), patch(
            "src.services.room_response.count_room_ai_prompt_tokens", return_value=10
        ), redirect_stdout(buf):
            response = self.post(
                payload,
                token="SECRET_TOKEN_CANARY",
                headers={
                    "X-Custom-Header": "HEADER_VALUE_CANARY",
                    "X-Room-AI-Message-ID": "message-123",
                },
            )
        self.assertEqual(response.status_code, 200)
        output = buf.getvalue()
        self.assertIn("[ROOM AI: RESPONSE START]", output)
        self.assertIn("[ROOM AI: RESPONSE SUCCESS]", output)
        self.assertIn("* Mode: explain", output)
        self.assertIn("* Provider: self_hosted", output)
        self.assertIn("* Provider: stub", output)
        self.assertIn("* Status: success", output)
        self.assertIn("* Message ID: message-123", output)
        self.assertIn("* Prompt tokens: 10 / 10,000", output)
        self.assertIn("* Tokenization:", output)
        self.assertIn("* Inference:", output)
        self.assertIn("* Total:", output)
        self.assertIn("* Output tokens: unavailable", output)
        self.assertIn("* Question: \"DEV_QUESTION_CANARY: Explain polymorphism?\"", output)
        for forbidden in (
            "AUTHOR_CANARY_ADA",
            "user-99",
            "BOARD_CLASS_CANARY",
            "CONTEXT_SUMMARY_CANARY",
            "concise",
            "analogy",
            "detailLevel",
            "exampleStyle",
            "An interface defines a contract.",
            "SECRET_TOKEN_CANARY",
            "HEADER_VALUE_CANARY",
            "X-Internal-Token",
        ):
            self.assertNotIn(forbidden, output)

    def test_room_response_dev_logs_escape_control_chars_and_truncate_long_questions(self):
        adapter = StubAdapter()
        buf = io.StringIO()
        injected = "Line1\r\n[FAKE BANNER]\t\x00\x1b[31m" + ("Q" * 300) + "TAIL_MARKER_CANARY"
        with patch.dict(os.environ, {"ROOM_AI_DEV_LOGS": "1"}, clear=False), patch.object(
            settings, "AI_INTERNAL_TOKEN", "test-secret", create=True
        ), patch("src.adapters.get_adapter", return_value=adapter), redirect_stdout(buf):
            response = self.post({**REQUEST, "question": injected})
        self.assertEqual(response.status_code, 200)
        output = buf.getvalue()
        question_lines = [line for line in output.splitlines() if "* Question:" in line]
        self.assertEqual(len(question_lines), 1)
        q_line = question_lines[0]
        self.assertIn("Line1\\r\\n[FAKE BANNER]\\t\\x00\\x1b[31m", q_line)
        self.assertIn("... [truncated]", q_line)
        self.assertNotIn("TAIL_MARKER_CANARY", output)
        self.assertNotIn("\x00", output)
        self.assertNotIn("\x1b", output)

    def test_room_response_dev_logs_record_failure_without_leaking_raw_exceptions_or_diffs(self):
        class FailingAdapter(StubAdapter):
            async def generate_diff(self, prompt, current_model):
                raise RuntimeError("Ollama error (401): RAW_EXCEPTION_SECRET_DETAIL_CANARY")

        buf = io.StringIO()
        with patch.dict(os.environ, {"ROOM_AI_DEV_LOGS": "1"}, clear=False), patch.object(
            settings, "AI_INTERNAL_TOKEN", "test-secret", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_URL", "https://model.invalid/v1", create=True
        ), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch("src.adapters.OllamaAdapter", return_value=FailingAdapter()), patch(
            "src.services.room_response.count_room_ai_prompt_tokens", return_value=10
        ), redirect_stdout(buf):
            response = self.post(
                {
                    **REQUEST,
                    "mode": "change",
                    "question": "Add OrderItem",
                    "provider": "self_hosted",
                    "route": "shared",
                }
            )
        self.assertEqual(response.status_code, 502)
        output = buf.getvalue()
        self.assertIn("[ROOM AI: RESPONSE START]", output)
        self.assertIn("[ROOM AI: RESPONSE FAILURE]", output)
        self.assertIn("* Status: failure", output)
        self.assertIn("* Mode: change", output)
        self.assertIn("* Provider: stub", output)
        self.assertIn("* Failure stage: provider_inference", output)
        self.assertIn("* Failure reason: provider_inference_failed", output)
        self.assertIn("* Failure type: RuntimeError", output)
        self.assertIn("* Provider HTTP status: 401", output)
        self.assertIn("* Prompt tokens: 10 / 10,000", output)
        self.assertIn("* Total:", output)
        self.assertNotIn("RAW_EXCEPTION_SECRET_DETAIL_CANARY", output)
        self.assertNotIn("Invoice", output)


if __name__ == "__main__":
    unittest.main()
