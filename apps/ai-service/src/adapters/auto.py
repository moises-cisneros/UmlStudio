"""
Auto-Adaptive Multi-Adapter.
Cascades across active providers according to the configured mode:
The cloud order depends on the prompt (see is_complex_prompt): complex prompts try the
strongest model first (Gemini -> OpenRouter -> Cloudflare), simple ones the cheapest first
(Cloudflare -> OpenRouter -> Gemini).
- 'auto': cloud (order above) -> LM Studio -> Ollama (No mocks)
- 'local': LM Studio -> Ollama
- 'cloud': cloud providers only (order above)
If no provider succeeds, raises an explicit error stating no active models.
"""

import logging
from collections.abc import AsyncIterator
from typing import Dict, Any, Optional, List
from .base import BaseAIAdapter
from .cloudflare import CloudflareAdapter
from .openrouter import OpenRouterAdapter
from .gemini import GeminiAdapter
from .lmstudio import LMStudioAdapter
from .ollama import OllamaAdapter
from .vertex_bridge import VertexBridgeAdapter
from ..models.uml import ModelDiff
from ..core.config import settings
from ..services.diff_quality import is_complex_prompt

logger = logging.getLogger("umlstudio.ai_service.adapters.auto")


class AutoAdaptiveAdapter(BaseAIAdapter):
    def __init__(
        self,
        mode: Optional[str] = None,
        provider_order: Optional[List[str]] = None,
    ):
        self.mode = (mode or settings.DEFAULT_PROVIDER or "auto").lower().strip()
        self.provider_order = [p.lower().strip() for p in provider_order] if provider_order else None
        if self.mode == "room" and self.provider_order is None:
            self.provider_order = settings.get_room_provider_order()
        self._active_provider = f"auto-adaptive ({self.mode})"

    @property
    def provider_name(self) -> str:
        return self._active_provider

    def _create_provider_adapter(self, provider_key: str) -> Optional[BaseAIAdapter]:
        k = provider_key.lower().strip()
        if k == "ollama":
            return OllamaAdapter()
        elif k == "gemini":
            return GeminiAdapter()
        elif k == "openrouter":
            return OpenRouterAdapter()
        elif k == "cloudflare":
            return CloudflareAdapter()
        elif k == "lmstudio":
            return LMStudioAdapter()
        elif k in ("vertex", "vertex-bridge", "vertex_bridge"):
            return VertexBridgeAdapter()
        return None

    async def _is_adapter_usable(self, adapter: BaseAIAdapter) -> bool:
        if isinstance(adapter, OllamaAdapter):
            return await adapter.is_available()
        elif isinstance(adapter, GeminiAdapter):
            return bool(settings.GEMINI_API_KEY)
        elif isinstance(adapter, CloudflareAdapter):
            return bool(settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_API_TOKEN)
        elif isinstance(adapter, OpenRouterAdapter):
            return bool(settings.OPENROUTER_API_KEY)
        elif isinstance(adapter, LMStudioAdapter):
            return await adapter.is_available()
        elif isinstance(adapter, VertexBridgeAdapter):
            return await adapter.is_available()
        return True

    async def complete_text(self, prompt: str) -> str:
        """Use text-capable providers without changing the existing diff cascade."""
        if self.provider_order:
            for name in self.provider_order:
                adapter = self._create_provider_adapter(name)
                if adapter is None or not await self._is_adapter_usable(adapter):
                    continue
                try:
                    text = await adapter.complete_text(prompt)
                    self._active_provider = adapter.provider_name
                    return text
                except Exception as exc:
                    logger.warning("Text completion via %s failed (%s)", adapter.provider_name, type(exc).__name__)
            raise RuntimeError(f"No configured AI provider in {self.provider_order} is available")

        candidates = []
        if self.mode not in ("local", "laptop"):
            if settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_API_TOKEN:
                candidates.append(CloudflareAdapter())
            if settings.GEMINI_API_KEY:
                candidates.append(GeminiAdapter())
        if self.mode not in ("cloud", "remote"):
            candidates.append(OllamaAdapter())

        for adapter in candidates:
            try:
                if isinstance(adapter, OllamaAdapter) and not await adapter.is_available():
                    continue
                text = await adapter.complete_text(prompt)
                self._active_provider = adapter.provider_name
                return text
            except Exception as exc:
                logger.warning("Text completion via %s failed (%s)", adapter.provider_name, type(exc).__name__)

        raise RuntimeError("No configured text-capable AI provider is available")

    async def stream_text(self, prompt: str) -> AsyncIterator[str]:
        """Stream text deltas according to configured provider order."""
        order = self.provider_order or (
            ["cloudflare", "ollama", "gemini"] if self.mode != "cloud" else ["cloudflare", "gemini"]
        )
        for name in order:
            adapter = self._create_provider_adapter(name)
            if adapter is None or not await self._is_adapter_usable(adapter):
                continue
            try:
                received = False
                async for chunk in adapter.stream_text(prompt):
                    if chunk:
                        received = True
                        yield chunk
                if received:
                    self._active_provider = adapter.provider_name
                    return
            except Exception as exc:
                logger.warning("Streaming text via %s failed (%s)", adapter.provider_name, type(exc).__name__)

        raise RuntimeError(f"No configured streaming AI provider in {order} is available")

    async def generate_room_diff(
        self, prompt: str, current_model: Dict[str, Any], system_prompt: str
    ) -> ModelDiff:
        order = self.provider_order or settings.get_room_provider_order()
        for name in order:
            adapter = self._create_provider_adapter(name)
            if adapter is None or not await self._is_adapter_usable(adapter):
                continue
            try:
                room_fn = getattr(adapter, "generate_room_diff", None)
                if callable(room_fn):
                    res = await room_fn(prompt, current_model, system_prompt)
                else:
                    res = await adapter.generate_diff(prompt, current_model)
                self._active_provider = adapter.provider_name
                return res
            except Exception as exc:
                logger.warning("Room diff via %s failed (%s)", adapter.provider_name, type(exc).__name__)
        raise RuntimeError(f"No configured room diff AI provider in {order} is available")

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        if self.provider_order:
            from ..services.prompting import build_uml_system_prompt
            return await self.generate_room_diff(
                prompt, current_model, build_uml_system_prompt(current_model)
            )

        # MODE: LOCAL (Prioritize local models on user's machine)
        if self.mode in ("local", "laptop"):
            return await self._run_local_cascade(prompt, current_model)

        # MODE: CLOUD (Only remote APIs)
        if self.mode in ("cloud", "remote"):
            return await self._run_cloud_cascade(prompt, current_model)

        # MODE: AUTO (cloud order chosen by prompt complexity, then LM Studio -> Ollama)
        return await self._run_auto_cascade(prompt, current_model)

    async def _run_local_cascade(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        # 1. LM Studio (:1234)
        try:
            lmstudio = LMStudioAdapter()
            if await lmstudio.is_available():
                res = await lmstudio.generate_diff(prompt, current_model)
                self._active_provider = lmstudio.provider_name
                return res
        except Exception as exc:
            logger.warning(f"LocalMode: LM Studio fallo ({exc}), probando Ollama...")

        # 2. Ollama (:11434)
        try:
            ollama = OllamaAdapter()
            if await ollama.is_available():
                res = await ollama.generate_diff(prompt, current_model)
                self._active_provider = ollama.provider_name
                return res
        except Exception as exc:
            logger.warning(f"LocalMode: Ollama fallo ({exc})...")

        raise RuntimeError(
            "No hay modelos locales de IA activos o respondiendo en este momento (LM Studio :1234 u Ollama :11434)."
        )

    def _cloud_candidates(self, prompt: str):
        """
        (label, configured, factory) in the order they should be tried.
        Complex prompts go to the strongest model first: small free models tend to copy few-shot
        examples and invert relationship directions. Simple prompts keep the cheapest-first order.
        """
        gemini = ("Gemini", bool(settings.GEMINI_API_KEY), lambda: GeminiAdapter())
        openrouter = ("OpenRouter", bool(settings.OPENROUTER_API_KEY), lambda: OpenRouterAdapter())
        cloudflare = (
            "Cloudflare",
            bool(settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_API_TOKEN),
            lambda: CloudflareAdapter(),
        )
        vertex = (
            "Vertex bridge",
            bool(settings.VERTEX_BRIDGE_URL and settings.VERTEX_BRIDGE_MODEL),
            lambda: VertexBridgeAdapter(),
        )
        if is_complex_prompt(prompt):
            candidates = [gemini, openrouter, cloudflare]
        else:
            candidates = [cloudflare, openrouter, gemini]
        return [vertex, *candidates] if vertex[1] else candidates

    async def _try_cloud(self, prompt: str, current_model: Dict[str, Any], tag: str) -> Optional[ModelDiff]:
        for label, configured, factory in self._cloud_candidates(prompt):
            if not configured:
                continue
            try:
                adapter = factory()
                result = await adapter.generate_diff(prompt, current_model)
                self._active_provider = adapter.provider_name
                return result
            except Exception as exc:
                logger.warning(f"{tag}: {label} fallo ({exc}), probando siguiente proveedor...")
        return None

    async def _run_cloud_cascade(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        result = await self._try_cloud(prompt, current_model, "CloudMode")
        if result is not None:
            return result
        raise RuntimeError(
            "No hay modelos de IA cloud activos o disponibles en este momento (Cloudflare, OpenRouter o Gemini)."
        )

    async def _run_auto_cascade(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        result = await self._try_cloud(prompt, current_model, "AutoAdaptive")
        if result is not None:
            return result

        # 4. LM Studio Local (:1234)
        try:
            lmstudio = LMStudioAdapter()
            if await lmstudio.is_available():
                res = await lmstudio.generate_diff(prompt, current_model)
                self._active_provider = lmstudio.provider_name
                return res
        except Exception as exc:
            logger.warning(f"AutoAdaptive: LM Studio fallo ({exc}), probando Ollama...")

        # 5. Ollama Local (:11434)
        try:
            ollama = OllamaAdapter()
            if await ollama.is_available():
                res = await ollama.generate_diff(prompt, current_model)
                self._active_provider = ollama.provider_name
                return res
        except Exception as exc:
            logger.warning(f"AutoAdaptive: Ollama fallo ({exc})...")

        # Sin mock: fallar explícitamente indicando que no hay modelos activos
        raise RuntimeError(
            "No hay modelos de IA activos o disponibles en este momento. "
            "Verifica la conexión a Cloudflare, OpenRouter, Gemini o inicia LM Studio / Ollama en local."
        )
