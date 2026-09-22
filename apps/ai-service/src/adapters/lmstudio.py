"""
LM Studio Local AI Adapter (:1234).
Utilizes local OpenAI-compatible endpoint with Qwen3 Toolcalling / Instruct models.
"""

import json
import logging
import httpx
from typing import Dict, Any, Optional
from .base import BaseAIAdapter
from ..models.uml import ModelDiff
from ..core.config import settings
from ..services.prompting import (
    build_uml_system_prompt,
    parse_and_validate_diff_payload,
    UML_ATOMIC_TOOLS,
)

logger = logging.getLogger("umlstudio.ai_service.adapters.lmstudio")


class LMStudioAdapter(BaseAIAdapter):
    """
    Adapter for locally hosted models running in LM Studio.
    """

    def __init__(self, endpoint_url: Optional[str] = None, model_name: Optional[str] = None):
        self.endpoint_url = (endpoint_url or settings.LMSTUDIO_URL).rstrip("/")
        self.model_name = model_name or settings.LMSTUDIO_MODEL

    @property
    def provider_name(self) -> str:
        return f"lm-studio ({self.model_name})"

    async def is_available(self) -> bool:
        """
        Quick probe to check if LM Studio is active and responding on its port.
        Uses Connection: close and 8.0s timeout to allow waking up idle local models.
        """
        try:
            headers = {"Connection": "close"}
            async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
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
            "temperature": 0.1,
            "tools": UML_ATOMIC_TOOLS,
            "tool_choice": "auto",
        }

        logger.info(f"LM Studio: enviando petición a '{url}' con modelo '{self.model_name}'...")

        max_retries = 2
        last_exc: Optional[Exception] = None

        for attempt in range(1, max_retries + 1):
            try:
                headers = {"Connection": "close"}
                limits = httpx.Limits(max_keepalive_connections=0, max_connections=5)
                async with httpx.AsyncClient(timeout=90.0, limits=limits, headers=headers) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code != 200:
                        raise RuntimeError(f"LM Studio error ({resp.status_code}): {resp.text}")

                    data = resp.json()
                    choice = data.get("choices", [{}])[0].get("message", {})
                    content = (choice.get("content") or "").strip()
                    tool_calls = choice.get("tool_calls", [])

                    if tool_calls and isinstance(tool_calls, list):
                        extracted_calls = []
                        for tc in tool_calls:
                            fn = tc.get("function", tc)
                            extracted_calls.append(fn)
                        print(f"\n[LM-STUDIO RAW TOOL CALLS]:\n{extracted_calls}\n")
                        return parse_and_validate_diff_payload(
                            extracted_calls, user_prompt=prompt, current_model=current_model
                        )

                    print(f"\n[LM-STUDIO RAW RESPONSE]:\n{content}\n")
                    if not content:
                        raise RuntimeError("LM Studio devolvió una respuesta vacía.")

                    return parse_and_validate_diff_payload(
                        content, user_prompt=prompt, current_model=current_model
                    )

            except (httpx.TransportError, httpx.RemoteProtocolError, httpx.ConnectError, httpx.TimeoutException) as exc:
                last_exc = exc
                err_desc = str(exc) or type(exc).__name__
                logger.warning(
                    f"LM Studio: intento {attempt}/{max_retries} falló ({err_desc}), "
                    f"{'reintentando conexión en 1.5s...' if attempt < max_retries else 'sin más intentos.'}"
                )
                if attempt < max_retries:
                    import asyncio
                    await asyncio.sleep(1.5)
            except Exception as exc:
                logger.error(f"LM Studio error de inferencia: {exc}")
                raise

        if last_exc:
            raise last_exc
