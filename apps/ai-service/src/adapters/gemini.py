"""
Google Gemini Adapter utilizing Gemini REST API with Structured JSON output.
"""

import httpx
from typing import Dict, Any
from .base import BaseAIAdapter
from ..models.uml import ModelDiff
from ..core.config import settings
from ..services.prompting import build_uml_system_prompt, parse_and_validate_diff_payload


class GeminiAdapter(BaseAIAdapter):
    def __init__(self, model_name: str = None, api_key: str = None):
        self.model_name = model_name or settings.GEMINI_MODEL
        self.api_key = api_key or settings.GEMINI_API_KEY

    @property
    def provider_name(self) -> str:
        return f"gemini ({self.model_name})"

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY no está configurada.")

        system_prompt = build_uml_system_prompt(current_model)
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model_name}:generateContent?key={self.api_key}"
        )

        payload = {
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {"role": "user", "parts": [{"text": prompt}]}
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Gemini API error ({resp.status_code}): {resp.text}"
                )

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise RuntimeError("Gemini did not return any candidates.")

            content_text = candidates[0]["content"]["parts"][0]["text"]
            return parse_and_validate_diff_payload(
                content_text, user_prompt=prompt, current_model=current_model
            )
