"""
Cloudflare Workers AI Adapter.
Utilizes Cloudflare's serverless AI models (e.g. @cf/meta/llama-3.1-8b-instruct)
free tier on Cloudflare's global edge network.
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
    UML_ATOMIC_TOOLS,
)

logger = logging.getLogger("umlstudio.ai_service.adapters.cloudflare")


class CloudflareAdapter(BaseAIAdapter):
    """
    Adapter for Cloudflare Workers AI free LLM models.
    """

    def __init__(
        self,
        account_id: Optional[str] = None,
        api_token: Optional[str] = None,
        model_name: Optional[str] = None,
    ):
        self.account_id = account_id or settings.CLOUDFLARE_ACCOUNT_ID
        self.api_token = api_token or settings.CLOUDFLARE_API_TOKEN
        self.model_name = model_name or settings.CLOUDFLARE_MODEL

    @property
    def provider_name(self) -> str:
        return f"cloudflare ({self.model_name})"

    async def is_configured(self) -> bool:
        return bool(self.account_id and self.api_token)

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        if not self.account_id or not self.api_token:
            raise ValueError("CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN requeridos.")

        system_prompt = build_uml_system_prompt(current_model)
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model_name}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1024,
            "temperature": 0.2,
            "tools": UML_ATOMIC_TOOLS,
        }

        logger.info(f"Cloudflare Workers AI: invocando '{self.model_name}'...")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Cloudflare Workers AI error ({resp.status_code}): {resp.text}"
                )

            data = resp.json()
            if not data.get("success", False):
                errors = data.get("errors", [])
                raise RuntimeError(f"Cloudflare Workers AI fallo: {errors}")

            result = data.get("result", {})
            response_text = ""
            tool_calls = None

            if isinstance(result, dict):
                # 1. OpenAI-compatible choices (standard for Llama 3.1 models in Workers AI)
                choices = result.get("choices")
                if isinstance(choices, list) and len(choices) > 0:
                    choice = choices[0]
                    if isinstance(choice, dict):
                        msg = choice.get("message", {})
                        if isinstance(msg, dict):
                            tool_calls = msg.get("tool_calls")
                            response_text = msg.get("content", "")

                # 2. Check direct result tool_calls
                if not tool_calls:
                    tool_calls = result.get("tool_calls")

                # 3. Legacy / direct response key
                if not response_text:
                    resp_val = result.get("response", "")
                    if isinstance(resp_val, dict):
                        response_text = resp_val.get("content", "")
                    elif isinstance(resp_val, str):
                        response_text = resp_val
            elif isinstance(result, str):
                response_text = result

            # Native tool calling execution
            if tool_calls and isinstance(tool_calls, list):
                extracted_calls = []
                for tc in tool_calls:
                    fn = tc.get("function", tc)
                    extracted_calls.append(fn)
                print(f"\n{'='*25} [FASE 2: RESPUESTA RAW DEL LLM (CLOUDFLARE)] {'='*25}")
                print(f"  * Tool Calls Detectados ({len(extracted_calls)}):")
                for ec in extracted_calls:
                    print(f"    - {ec.get('name')}: {ec.get('arguments')}")
                print(f"{'='*70}\n")
                return parse_and_validate_diff_payload(
                    extracted_calls, user_prompt=prompt, current_model=current_model
                )

            response_text = str(response_text or "").strip()
            print(f"\n{'='*25} [FASE 2: RESPUESTA RAW DEL LLM (CLOUDFLARE)] {'='*25}")
            print(f"  * Texto Raw:\n{response_text}")
            print(f"{'='*70}\n")

            if not response_text:
                raise RuntimeError("Cloudflare Workers AI devolvió una respuesta vacía.")

            return parse_and_validate_diff_payload(
                response_text, user_prompt=prompt, current_model=current_model
            )
