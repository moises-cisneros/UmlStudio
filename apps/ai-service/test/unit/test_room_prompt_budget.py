"""Room AI prompt-budget tests that do not start the ASGI application."""

import asyncio
import unittest
from unittest.mock import patch

from src.models.uml import DiffAddBlock, DiffElementAdd, ModelDiff, RoomRespondRequest
from src.services.room_response import RoomPromptTooLongError, RoomResponseService


REQUEST = RoomRespondRequest(
    mode="explain",
    requester={"id": "user-1", "name": "Ada"},
    question="Explain this diagram",
    board={"nodes": [], "edges": []},
    context={"summary": "Shared context"},
    provider="self_hosted",
    route="shared",
)


class StubAdapter:
    provider_name = "stub"

    def __init__(self):
        self.prompts = []

    async def complete_text(self, prompt):
        self.prompts.append(prompt)
        return "A class diagram."


class RepairAdapter:
    provider_name = "stub"

    def __init__(self):
        self.prompts = []

    async def generate_diff(self, prompt, current_model):
        self.prompts.append(prompt)
        if len(self.prompts) == 1:
            return ModelDiff()
        return ModelDiff(add=DiffAddBlock(elements=[DiffElementAdd(name="Invoice")]))


class TestRoomPromptBudget(unittest.TestCase):
    def test_over_budget_prompt_is_rejected_before_inference(self):
        adapter = StubAdapter()
        with patch("src.services.room_response._room_adapter", return_value=adapter), patch(
            "src.services.room_response.count_room_ai_prompt_tokens",
            return_value=10_001,
            create=True,
        ):
            with self.assertRaisesRegex(ValueError, "10,000-token"):
                asyncio.run(RoomResponseService.respond(REQUEST))

        self.assertEqual(adapter.prompts, [])

    def test_change_repair_prompt_is_checked_before_retry_inference(self):
        adapter = RepairAdapter()
        request = REQUEST.model_copy(
            update={"mode": "change", "question": "Add a class to the diagram"}
        )
        with patch("src.services.room_response._room_adapter", return_value=adapter), patch(
            "src.services.room_response.count_room_ai_prompt_tokens",
            side_effect=[9_995, 10_045],
        ):
            with self.assertRaisesRegex(RoomPromptTooLongError, "10,000-token"):
                asyncio.run(RoomResponseService.respond(request))

        self.assertEqual(len(adapter.prompts), 1)
