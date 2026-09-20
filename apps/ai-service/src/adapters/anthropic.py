"""
Anthropic Claude Adapter utilizing Messages API with Tool Use.
"""

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


class AnthropicAdapter(BaseAIAdapter):
    def __init__(self, model_name: str = None, api_key: str = None):
        self.model_name = model_name or settings.ANTHROPIC_MODEL
        self.api_key = api_key or settings.ANTHROPIC_API_KEY

    @property
    def provider_name(self) -> str:
        return f"anthropic ({self.model_name})"

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        if not self.api_key:
            from .mock import MockAIAdapter
            return await MockAIAdapter().generate_diff(prompt, current_model)

        system_prompt = build_uml_system_prompt(current_model)
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model_name,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "tools": [
                {
                    "name": "apply_model_diff",
                    "description": UML_DIFF_TOOL_SCHEMA["description"],
                    "input_schema": UML_DIFF_TOOL_SCHEMA["parameters"],
                }
            ],
            "tool_choice": {"type": "tool", "name": "apply_model_diff"},
            "temperature": 0.2,
        }

        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Anthropic API error ({resp.status_code}): {resp.text}"
                )

            data = resp.json()
            contents = data.get("content", [])

            for block in contents:
                if block.get("type") == "tool_use" and block.get("name") == "apply_model_diff":
                    return parse_and_validate_diff_payload(block.get("input", {}))

            for block in contents:
                if block.get("type") == "text":
                    return parse_and_validate_diff_payload(block.get("text", ""))

            return ModelDiff(add=DiffAddBlock(elements=[], relationships=[]))
