"""Optional adapter for an external OpenAI-compatible Vertex bridge."""

import logging
from typing import Any, Dict, Optional

import httpx

from .base import BaseAIAdapter
from ..core.config import settings
from ..models.uml import ModelDiff
from ..services.prompting import (
    UML_ATOMIC_TOOLS,
    build_uml_system_prompt,
    parse_and_validate_diff_payload,
)

logger = logging.getLogger("umlstudio.ai_service.adapters.vertex_bridge")


class VertexBridgeAdapter(BaseAIAdapter):
    """Send Agent AI diff requests to an opt-in OpenAI-compatible bridge."""

    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        model_name: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.endpoint_url = (endpoint_url or settings.VERTEX_BRIDGE_URL).rstrip("/")
        self.model_name = model_name or settings.VERTEX_BRIDGE_MODEL
        self.api_key = api_key if api_key is not None else settings.VERTEX_BRIDGE_API_KEY

    @property
    def provider_name(self) -> str:
        return f"vertex-bridge ({self.model_name})"

    def _headers(self) -> Dict[str, str]:
        headers = {"Connection": "close"}
        if self.api_key:
            token = self.api_key if self.api_key.lower().startswith("bearer ") else f"Bearer {self.api_key}"
            headers["Authorization"] = token
        return headers

    async def is_available(self) -> bool:
        if not self.endpoint_url or not self.model_name:
            return False
        try:
            async with httpx.AsyncClient(timeout=8.0, headers=self._headers()) as client:
                response = await client.get(f"{self.endpoint_url}/models")
                return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        if not self.endpoint_url or not self.model_name:
            raise ValueError("VERTEX_BRIDGE_URL and VERTEX_BRIDGE_MODEL must be configured.")

        url = f"{self.endpoint_url}/chat/completions"
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": build_uml_system_prompt(current_model)},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "tools": UML_ATOMIC_TOOLS,
            "tool_choice": "auto",
        }
        logger.info("Vertex bridge: sending request to %s with model %s", url, self.model_name)
        limits = httpx.Limits(max_keepalive_connections=0, max_connections=5)
        async with httpx.AsyncClient(
            timeout=90.0, limits=limits, headers=self._headers()
        ) as client:
            response = await client.post(url, json=payload)
            if response.status_code != 200:
                raise RuntimeError(f"Vertex bridge error ({response.status_code}): {response.text}")

        data = response.json()
        choice = data.get("choices", [{}])[0].get("message", {})
        tool_calls = choice.get("tool_calls", [])
        if tool_calls and isinstance(tool_calls, list):
            return parse_and_validate_diff_payload(
                [call.get("function", call) for call in tool_calls],
                user_prompt=prompt,
                current_model=current_model,
            )

        content = (choice.get("content") or "").strip()
        if not content:
            raise RuntimeError("Vertex bridge returned an empty response.")
        return parse_and_validate_diff_payload(
            content, user_prompt=prompt, current_model=current_model
        )
