"""
OpenAI Adapter utilizing Chat Completions and Tool / Function Calling.
"""

import json
import httpx
from typing import Dict, Any
from .base import BaseAIAdapter
from ..models.uml import ModelDiff, DiffAddBlock
from ..core.config import settings
from ..services.prompting import (
    build_uml_system_prompt,
    UML_DIFF_TOOL_SCHEMA,
    parse_and_validate_diff_payload,
)


class OpenAIAdapter(BaseAIAdapter):
    def __init__(self, model_name: str = None, api_key: str = None):
        self.model_name = model_name or settings.OPENAI_MODEL
        self.api_key = api_key or settings.OPENAI_API_KEY

    @property
    def provider_name(self) -> str:
        return f"openai ({self.model_name})"

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        if not self.api_key:
            from .mock import MockAIAdapter
            return await MockAIAdapter().generate_diff(prompt, current_model)

        system_prompt = build_uml_system_prompt(current_model)
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "tools": [
                {"type": "function", "function": UML_DIFF_TOOL_SCHEMA}
            ],
            "tool_choice": {
                "type": "function",
                "function": {"name": "apply_model_diff"},
            },
            "temperature": 0.2,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"OpenAI API error ({resp.status_code}): {resp.text}"
                )

            data = resp.json()
            choice = data["choices"][0]["message"]

            if "tool_calls" in choice and choice["tool_calls"]:
                tool_call = choice["tool_calls"][0]
                args_json = tool_call["function"]["arguments"]
                args = json.loads(args_json) if isinstance(args_json, str) else args_json
                return parse_and_validate_diff_payload(args)

            if choice.get("content"):
                return parse_and_validate_diff_payload(choice["content"])

            return ModelDiff(add=DiffAddBlock(elements=[], relationships=[]))
