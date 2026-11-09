"""
Cloudflare Workers AI Adapter.
Utilizes Cloudflare's serverless AI models (e.g. @cf/meta/llama-3.1-8b-instruct)
free tier on Cloudflare's global edge network.
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
    UML_ATOMIC_TOOLS,
)

logger = logging.getLogger("umlstudio.ai_service.adapters.cloudflare")


class CloudflareAdapter(BaseAIAdapter):
    """
    Adapter for Cloudflare Workers AI free LLM models.
    Supports complete_text, stream_text, generate_diff, and generate_room_diff.
    """

    def __init__(
        self,
        account_id: Optional[str] = None,
        api_token: Optional[str] = None,
        model_name: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.account_id = account_id or settings.CLOUDFLARE_ACCOUNT_ID
        self.api_token = api_token or settings.CLOUDFLARE_API_TOKEN
        self.model_name = model_name or settings.CLOUDFLARE_MODEL
        self.base_url = (
            base_url or getattr(settings, "CLOUDFLARE_BASE_URL", "https://api.cloudflare.com/client/v4")
        ).rstrip("/")

    @property
    def provider_name(self) -> str:
        return f"cloudflare ({self.model_name})"

    async def is_configured(self) -> bool:
        return bool(self.account_id and self.api_token)

    async def is_available(self) -> bool:
        return await self.is_configured()

    def _get_url(self) -> str:
        return f"{self.base_url}/accounts/{self.account_id}/ai/run/{self.model_name}"

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    async def complete_text(self, prompt: str) -> str:
        if not await self.is_configured():
            raise ValueError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.")

        payload = {
            "messages": [
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1024,
            "temperature": 0.2,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(self._get_url(), headers=self._get_headers(), json=payload)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Cloudflare Workers AI text completion failed ({resp.status_code}): {resp.text}"
                )

            data = resp.json()
            if not data.get("success", False) and "result" not in data:
                errors = data.get("errors", [])
                raise RuntimeError(f"Cloudflare Workers AI failed: {errors}")

            result = data.get("result", {})
            text = ""
            if isinstance(result, dict):
                choices = result.get("choices")
                if isinstance(choices, list) and len(choices) > 0 and isinstance(choices[0], dict):
                    text = choices[0].get("message", {}).get("content", "")
                if not text:
                    resp_val = result.get("response", "")
                    if isinstance(resp_val, dict):
                        text = resp_val.get("content", "")
                    elif isinstance(resp_val, str):
                        text = resp_val
            elif isinstance(result, str):
                text = result

            content = str(text or "").strip()
            if not content:
                raise ValueError("Cloudflare Workers AI returned an empty text completion")
            return content

    async def stream_text(self, prompt: str) -> AsyncIterator[str]:
        if not await self.is_configured():
            raise ValueError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.")

        payload = {
            "messages": [
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1024,
            "temperature": 0.2,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            async with client.stream(
                "POST", self._get_url(), headers=self._get_headers(), json=payload
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise RuntimeError(
                        f"Cloudflare Workers AI streaming failed ({resp.status_code}): {body.decode('utf-8', errors='ignore')}"
                    )

                content_type = resp.headers.get("content-type", "")
                if "text/event-stream" not in content_type.lower():
                    raw = (await resp.aread()).decode("utf-8")
                    data = json.loads(raw)
                    result = data.get("result", {})
                    content = ""
                    if isinstance(result, dict):
                        choices = result.get("choices")
                        if isinstance(choices, list) and len(choices) > 0:
                            content = choices[0].get("message", {}).get("content", "")
                        if not content:
                            content = result.get("response", "")
                    elif isinstance(result, str):
                        content = result
                    if not str(content).strip():
                        raise ValueError("Cloudflare Workers AI returned an empty text completion")
                    yield str(content).strip()
                    return

                received = False
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if not data_str or data_str == "[DONE]":
                        break
                    try:
                        chunk_payload = json.loads(data_str)
                        delta = ""
                        choices = chunk_payload.get("choices")
                        if isinstance(choices, list) and len(choices) > 0 and isinstance(choices[0], dict):
                            delta = choices[0].get("delta", {}).get("content", "")
                        if not delta:
                            delta = chunk_payload.get("response", "")
                    except (json.JSONDecodeError, TypeError, KeyError) as exc:
                        logger.warning("Cloudflare stream line parse error: %s", exc)
                        continue

                    if delta and isinstance(delta, str):
                        received = True
                        yield delta

                if not received:
                    raise ValueError("Cloudflare Workers AI returned an empty streaming text completion")

    async def generate_room_diff(
        self, prompt: str, current_model: Dict[str, Any], system_prompt: str
    ) -> ModelDiff:
        if not await self.is_configured():
            raise ValueError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.")

        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1536,
            "temperature": 0.2,
            "tools": UML_ATOMIC_TOOLS,
        }

        logger.info(f"Cloudflare Workers AI: generating room diff with '{self.model_name}'...")
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(self._get_url(), headers=self._get_headers(), json=payload)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Cloudflare Workers AI error ({resp.status_code}): {resp.text}"
                )

            data = resp.json()
            if not data.get("success", False) and "result" not in data:
                errors = data.get("errors", [])
                raise RuntimeError(f"Cloudflare Workers AI failed: {errors}")

            result = data.get("result", {})
            response_text = ""
            tool_calls = None

            if isinstance(result, dict):
                choices = result.get("choices")
                if isinstance(choices, list) and len(choices) > 0 and isinstance(choices[0], dict):
                    msg = choices[0].get("message", {})
                    if isinstance(msg, dict):
                        tool_calls = msg.get("tool_calls")
                        response_text = msg.get("content", "")

                if not tool_calls:
                    tool_calls = result.get("tool_calls")

                if not response_text:
                    resp_val = result.get("response", "")
                    if isinstance(resp_val, dict):
                        response_text = resp_val.get("content", "")
                    elif isinstance(resp_val, str):
                        response_text = resp_val
            elif isinstance(result, str):
                response_text = result

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
                raise RuntimeError("Cloudflare Workers AI returned an empty room diff response.")

            return parse_and_validate_diff_payload(
                response_text, user_prompt=prompt, current_model=current_model
            )

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        return await self.generate_room_diff(
            prompt, current_model, build_uml_system_prompt(current_model)
        )
