"""
Ollama Local Adapter (:11434).
Utilizes local OpenAI-compatible endpoint running via Ollama.
"""

import logging
import httpx
from typing import Dict, Any, Optional
from .base import BaseAIAdapter
from ..models.uml import ModelDiff
from ..core.config import settings
from ..services.prompting import (
    build_uml_system_prompt,
    parse_and_validate_diff_payload,
)

logger = logging.getLogger("umlstudio.ai_service.adapters.ollama")


class OllamaAdapter(BaseAIAdapter):
    def __init__(
        self, endpoint_url: Optional[str] = None, model_name: Optional[str] = None
    ):
        self.endpoint_url = (endpoint_url or settings.OLLAMA_URL).rstrip("/")
        self.model_name = model_name or settings.OLLAMA_MODEL

    @property
    def provider_name(self) -> str:
        return f"ollama ({self.model_name})"

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.endpoint_url}/models")
                return resp.status_code == 200
        except Exception:
            return False

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        system_prompt = build_uml_system_prompt(current_model)
        url = f"{self.endpoint_url}/chat/completions"

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }

        logger.info(f"Ollama: enviando petición a '{url}' con modelo '{self.model_name}'...")
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return parse_and_validate_diff_payload(
                    content, user_prompt=prompt, current_model=current_model
                )
            raise RuntimeError(f"Ollama error ({resp.status_code}): {resp.text}")
