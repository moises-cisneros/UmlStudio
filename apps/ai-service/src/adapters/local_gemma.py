"""
Local Gemma 2B Adapter running via Ollama / vLLM OpenAI-compatible endpoint.
"""

import httpx
from typing import Dict, Any
from .base import BaseAIAdapter
from ..models.uml import ModelDiff
from ..core.config import settings
from ..services.prompting import build_uml_system_prompt, parse_and_validate_diff_payload


class LocalGemmaAdapter(BaseAIAdapter):
    def __init__(self, endpoint_url: str = None, model_name: str = None):
        self.endpoint_url = endpoint_url or settings.LOCAL_LLM_URL
        self.model_name = model_name or settings.LOCAL_LLM_MODEL

    @property
    def provider_name(self) -> str:
        return f"local-gemma ({self.model_name})"

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        system_prompt = build_uml_system_prompt(current_model)
        url = f"{self.endpoint_url.rstrip('/')}/chat/completions"

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return parse_and_validate_diff_payload(content)
            raise RuntimeError(f"Local Gemma error ({resp.status_code}): {resp.text}")
