"""
Ollama Local Adapter (:11434).
Utilizes local OpenAI-compatible endpoint running via Ollama.
"""

import json
import logging
import httpx
from collections.abc import AsyncIterator
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
        self,
        endpoint_url: Optional[str] = None,
        model_name: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        api_key: Optional[str] = None,
    ):
        self.endpoint_url = (endpoint_url or settings.OLLAMA_URL).rstrip("/")
        self.model_name = model_name or settings.OLLAMA_MODEL
        if headers is not None:
            self.headers = dict(headers)
        else:
            self.headers = settings.get_ollama_headers()
        if api_key:
            auth_val = api_key if api_key.lower().startswith("bearer ") else f"Bearer {api_key}"
            self.headers["Authorization"] = auth_val

    @property
    def provider_name(self) -> str:
        return f"ollama ({self.model_name})"

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.endpoint_url}/models", headers=self.headers)
                return resp.status_code == 200
        except Exception:
            return False

    async def complete_text(self, prompt: str) -> str:
        url = f"{self.endpoint_url}/chat/completions"
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(url, json=payload, headers=self.headers)
            if resp.status_code != 200:
                raise RuntimeError(f"Ollama text completion failed ({resp.status_code})")
            content = resp.json()["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("Ollama returned an empty text completion")
            return content.strip()

    async def stream_text(self, prompt: str) -> AsyncIterator[str]:
        """Stream OpenAI-compatible text deltas without exposing provider framing upstream."""
        url = f"{self.endpoint_url}/chat/completions"
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
            async with client.stream("POST", url, json=payload, headers=self.headers) as resp:
                if resp.status_code != 200:
                    raise RuntimeError(f"Ollama text completion failed ({resp.status_code})")
                content_type = resp.headers.get("content-type", "")
                if "text/event-stream" not in content_type.lower():
                    data = json.loads((await resp.aread()).decode("utf-8"))
                    content = data["choices"][0]["message"]["content"]
                    if not isinstance(content, str) or not content.strip():
                        raise ValueError("Ollama returned an empty text completion")
                    yield content.strip()
                    return

                received = False
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        payload = json.loads(data)
                        delta = payload["choices"][0].get("delta", {}).get("content", "")
                    except (IndexError, KeyError, TypeError, json.JSONDecodeError) as exc:
                        raise ValueError("Ollama returned an invalid streaming text completion") from exc
                    if not isinstance(delta, str):
                        raise ValueError("Ollama returned an invalid streaming text completion")
                    if delta:
                        received = True
                        yield delta
                if not received:
                    raise ValueError("Ollama returned an empty streaming text completion")

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        return await self.generate_room_diff(
            prompt, current_model, build_uml_system_prompt(current_model)
        )

    async def generate_room_diff(
        self, prompt: str, current_model: Dict[str, Any], system_prompt: str
    ) -> ModelDiff:
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
            resp = await client.post(url, json=payload, headers=self.headers)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return parse_and_validate_diff_payload(
                    content, user_prompt=prompt, current_model=current_model
                )
            raise RuntimeError(f"Ollama error ({resp.status_code}): {resp.text}")
