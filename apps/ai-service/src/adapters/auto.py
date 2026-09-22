"""
Auto-Adaptive Multi-Adapter.
Cascades across active providers according to the configured mode:
- 'auto': Cloudflare -> OpenRouter -> Gemini -> LM Studio -> Ollama (No mocks)
- 'local': LM Studio -> Ollama
- 'cloud': Cloudflare -> OpenRouter -> Gemini
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

logger = logging.getLogger("umlstudio.ai_service.adapters.auto")


class AutoAdaptiveAdapter(BaseAIAdapter):
    def __init__(self, mode: Optional[str] = None):
        self.mode = (mode or settings.DEFAULT_PROVIDER or "auto").lower().strip()
        self._active_provider = f"auto-adaptive ({self.mode})"

    @property
    def provider_name(self) -> str:
        return self._active_provider

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        # MODE: LOCAL (Prioritize local models on user's machine)
        if self.mode in ("local", "laptop"):
            return await self._run_local_cascade(prompt, current_model)

        # MODE: CLOUD (Only remote APIs)
        if self.mode in ("cloud", "remote"):
            return await self._run_cloud_cascade(prompt, current_model)

        # MODE: AUTO (Default order: Cloudflare -> OpenRouter -> Gemini -> LM Studio -> Ollama)
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

    async def _run_cloud_cascade(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        # 1. Cloudflare Workers AI
        if settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_API_TOKEN:
            try:
                cf = CloudflareAdapter()
                res = await cf.generate_diff(prompt, current_model)
                self._active_provider = cf.provider_name
                return res
            except Exception as exc:
                logger.warning(f"CloudMode: Cloudflare fallo ({exc}), intentando OpenRouter...")

        # 2. OpenRouter (Free-tier model pool)
        if settings.OPENROUTER_API_KEY:
            try:
                openrouter = OpenRouterAdapter()
                res = await openrouter.generate_diff(prompt, current_model)
                self._active_provider = openrouter.provider_name
                return res
            except Exception as exc:
                logger.warning(f"CloudMode: OpenRouter fallo ({exc}), intentando Gemini...")

        # 3. Google Gemini
        if settings.GEMINI_API_KEY:
            try:
                gemini = GeminiAdapter()
                res = await gemini.generate_diff(prompt, current_model)
                self._active_provider = gemini.provider_name
                return res
            except Exception as exc:
                logger.warning(f"CloudMode: Gemini fallo ({exc})...")

        raise RuntimeError(
            "No hay modelos de IA cloud activos o disponibles en este momento (Cloudflare, OpenRouter o Gemini)."
        )

    async def _run_auto_cascade(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        # 1. Cloudflare Workers AI (Modelos gratuitos)
        if settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_API_TOKEN:
            try:
                cf = CloudflareAdapter()
                res = await cf.generate_diff(prompt, current_model)
                self._active_provider = cf.provider_name
                return res
            except Exception as exc:
                logger.warning(f"AutoAdaptive: Cloudflare fallo ({exc}), probando OpenRouter...")

        # 2. OpenRouter API (Pool gratuito)
        if settings.OPENROUTER_API_KEY:
            try:
                openrouter = OpenRouterAdapter()
                res = await openrouter.generate_diff(prompt, current_model)
                self._active_provider = openrouter.provider_name
                return res
            except Exception as exc:
                logger.warning(f"AutoAdaptive: OpenRouter fallo ({exc}), probando Gemini...")

        # 3. Google Gemini API
        if settings.GEMINI_API_KEY:
            try:
                gemini = GeminiAdapter()
                res = await gemini.generate_diff(prompt, current_model)
                self._active_provider = gemini.provider_name
                return res
            except Exception as exc:
                logger.warning(f"AutoAdaptive: Gemini fallo ({exc}), probando LM Studio local...")

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
