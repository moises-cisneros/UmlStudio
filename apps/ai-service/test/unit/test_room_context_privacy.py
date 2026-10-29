"""Privacy checks for structured room context without a model provider."""
import unittest
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError
from src.models.uml import RoomRespondRequest
from src.core.config import settings
from src.services.room_response import RoomResponseService


BASE = {
    "mode": "explain", "requester": {"id": "u", "name": "User"},
    "question": "question", "board": {}, "context": {"summary": "shared"},
}


class TestRoomContextPrivacy(unittest.TestCase):
    def test_private_fields_cannot_be_hidden_inside_shared_context(self):
        for key in ("private_context", "privateContext"):
            with self.subTest(key=key), self.assertRaises(ValidationError):
                RoomRespondRequest.model_validate({
                    **BASE, "context": {"nested": [{key: "secret"}]},
                })

    def test_private_memory_requires_explicit_private_self_hosted_route(self):
        for routing in ({}, {"provider": "self_hosted", "route": "shared"}):
            with self.subTest(routing=routing), self.assertRaises(ValidationError):
                RoomRespondRequest.model_validate({**BASE, **routing, "private_context": "secret"})


class TestSelfHostedRoomProvider(unittest.IsolatedAsyncioTestCase):
    async def test_private_request_uses_configured_self_hosted_adapter_without_fallback(self):
        adapter = AsyncMock()
        adapter.provider_name = "self-hosted"
        adapter.complete_text.return_value = "answer"
        request = RoomRespondRequest.model_validate({
            **BASE, "provider": "self_hosted", "route": "private", "private_context": "secret",
        })
        with patch.object(settings, "ROOM_AI_SELF_HOSTED_URL", "http://model.invalid/v1"), \
             patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", "test-model"), \
             patch("src.services.room_response.count_room_ai_prompt_tokens", return_value=1), \
             patch("src.adapters.OllamaAdapter", return_value=adapter) as self_hosted, \
             patch("src.adapters.get_adapter") as fallback:
            result = await RoomResponseService.respond(request)
        self.assertEqual(result.provider, "self-hosted")
        self.assertIn("secret", adapter.complete_text.await_args.args[0])
        self_hosted.assert_called_once_with(endpoint_url="http://model.invalid/v1", model_name="test-model")
        fallback.assert_not_called()

    async def test_missing_self_hosted_configuration_fails_without_fallback(self):
        request = RoomRespondRequest.model_validate({**BASE, "provider": "self_hosted", "route": "shared"})
        with patch.object(settings, "ROOM_AI_SELF_HOSTED_URL", ""), \
             patch.object(settings, "ROOM_AI_SELF_HOSTED_MODEL", ""), \
             patch("src.adapters.get_adapter") as fallback:
            with self.assertRaises(RuntimeError):
                await RoomResponseService.respond(request)
        fallback.assert_not_called()


if __name__ == "__main__":
    unittest.main()
