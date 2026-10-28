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
from typing import Dict, Any, Optional
from .base import BaseAIAdapter
from .cloudflare import CloudflareAdapter
from .openrouter import OpenRouterAdapter
from .gemini import GeminiAdapter
from .lmstudio import LMStudioAdapter
from .ollama import OllamaAdapter
from ..models.uml import ModelDiff
from ..core.config import settings
from ..services.diff_quality import is_complex_prompt

logger = logging.getLogger("umlstudio.ai_service.adapters.auto")


class AutoAdaptiveAdapter(BaseAIAdapter):
    def __init__(self, mode: Optional[str] = None):
        self.mode = (mode or settings.DEFAULT_PROVIDER or "auto").lower().strip()
        self._active_provider = f"auto-adaptive ({self.mode})"

    @property
    def provider_name(self) -> str:
        return self._active_provider

    async def complete_text(self, prompt: str) -> str:
        """Use text-capable providers without changing the existing diff cascade."""
        candidates = []
        if self.mode not in ("local", "laptop") and settings.GEMINI_API_KEY:
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

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
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
        if is_complex_prompt(prompt):
            return [gemini, openrouter, cloudflare]
        return [cloudflare, openrouter, gemini]

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
