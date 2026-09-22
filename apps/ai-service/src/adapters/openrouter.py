"""
OpenRouter Adapter with Multi-Model Free-Tier Cascade and 429 Resilience.
"""

import json
import logging
import httpx
from typing import Dict, Any, List
from .base import BaseAIAdapter
from ..models.uml import ModelDiff, DiffAddBlock
from ..core.config import settings
from ..services.prompting import (
    build_uml_system_prompt,
    parse_and_validate_diff_payload,
    UML_ATOMIC_TOOLS,
)

logger = logging.getLogger("umlstudio.ai_service.adapters.openrouter")


class OpenRouterAdapter(BaseAIAdapter):
    """
    Adapter for OpenRouter API with graceful fallback across free-tier models.
    """

    def __init__(self, model_name: str = None, api_key: str = None):
        raw_models = model_name or settings.OPENROUTER_MODEL
        if isinstance(raw_models, str):
            self.model_candidates: List[str] = [
                m.strip() for m in raw_models.split(",") if m.strip()
            ]
        else:
            self.model_candidates = ["qwen/qwen-2.5-coder-32b-instruct", "meta-llama/llama-3.1-8b-instruct:free"]

        if not self.model_candidates:
            self.model_candidates = ["qwen/qwen-2.5-coder-32b-instruct"]

        self.api_key = api_key or settings.OPENROUTER_API_KEY
        self.active_model = self.model_candidates[0]

    @property
    def provider_name(self) -> str:
        return f"openrouter ({self.active_model})"

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY no está configurada.")

        system_prompt = build_uml_system_prompt(current_model)
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "UmlStudio OMG UML 2.5",
        }

        last_error = None

        for candidate_model in self.model_candidates:
            self.active_model = candidate_model
            payload = {
                "model": candidate_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
                "tools": UML_ATOMIC_TOOLS,
            }

            try:
                logger.info(f"OpenRouter: intentando modelo '{candidate_model}'...")
                async with httpx.AsyncClient(timeout=25.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)

                    if resp.status_code == 429:
                        logger.warning(
                            f"OpenRouter: modelo '{candidate_model}' saturado (429 Too Many Requests), probando alternativa..."
                        )
                        last_error = RuntimeError(f"Rate limited (429): {resp.text}")
                        continue

                    if resp.status_code != 200:
                        logger.warning(
                            f"OpenRouter: modelo '{candidate_model}' error ({resp.status_code}): {resp.text}"
                        )
                        last_error = RuntimeError(f"OpenRouter error ({resp.status_code}): {resp.text}")
                        continue

                    data = resp.json()
                    choice = data.get("choices", [{}])[0].get("message", {})
                    tool_calls = choice.get("tool_calls", [])

                    if tool_calls and isinstance(tool_calls, list):
                        extracted_calls = []
                        for tc in tool_calls:
                            fn = tc.get("function", tc)
                            extracted_calls.append(fn)
                        print(f"\n[OPENROUTER RAW TOOL CALLS ({candidate_model})]:\n{extracted_calls}\n")
                        return parse_and_validate_diff_payload(
                            extracted_calls, user_prompt=prompt, current_model=current_model
                        )

                    content = (choice.get("content") or "").strip()
                    print(f"\n[OPENROUTER RAW RESPONSE ({candidate_model})]:\n{content}\n")

                    if not content:
                        logger.warning(f"OpenRouter: respuesta vacía de '{candidate_model}'.")
                        continue

                    return parse_and_validate_diff_payload(
                        content, user_prompt=prompt, current_model=current_model
                    )

            except Exception as exc:
                logger.warning(f"OpenRouter: excepción con modelo '{candidate_model}': {exc}")
                last_error = exc

        raise RuntimeError(
            f"OpenRouter falló con todos los modelos candidatos ({', '.join(self.model_candidates)}). Último error: {last_error}"
        )
