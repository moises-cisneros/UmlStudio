"""
Auto-Adaptive Multi-Adapter.
Automatically detects configured LLM API keys and model availability,
cascading gracefully: Gemini -> OpenAI -> Claude -> Local Gemma -> Mock.
"""

import logging
from typing import Dict, Any
from .base import BaseAIAdapter
from .gemini import GeminiAdapter
from .openai import OpenAIAdapter
from .anthropic import AnthropicAdapter
from .local_gemma import LocalGemmaAdapter
from .mock import MockAIAdapter
from ..models.uml import ModelDiff
from ..core.config import settings

logger = logging.getLogger("umlstudio.ai_service.adapters.auto")


class AutoAdaptiveAdapter(BaseAIAdapter):
    def __init__(self):
        self._active_provider = "auto-adaptive"

    @property
    def provider_name(self) -> str:
        return self._active_provider

    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        # Candidate 1: Google Gemini (Structured Output)
        if settings.GEMINI_API_KEY:
            try:
                adapter = GeminiAdapter()
                res = await adapter.generate_diff(prompt, current_model)
                self._active_provider = adapter.provider_name
                return res
            except Exception as exc:
                logger.warning(f"AutoAdaptive: Gemini fallo ({exc}), intentando siguiente proveedor...")

        # Candidate 2: OpenAI (GPT-4o)
        if settings.OPENAI_API_KEY:
            try:
                adapter = OpenAIAdapter()
                res = await adapter.generate_diff(prompt, current_model)
                self._active_provider = adapter.provider_name
                return res
            except Exception as exc:
                logger.warning(f"AutoAdaptive: OpenAI fallo ({exc}), intentando siguiente proveedor...")

        # Candidate 3: Anthropic Claude (Claude 3.7)
        if settings.ANTHROPIC_API_KEY:
            try:
                adapter = AnthropicAdapter()
                res = await adapter.generate_diff(prompt, current_model)
                self._active_provider = adapter.provider_name
                return res
            except Exception as exc:
                logger.warning(f"AutoAdaptive: Claude fallo ({exc}), intentando siguiente proveedor...")

        # Candidate 4: Local Gemma (Ollama on LOCAL_LLM_URL)
        try:
            local_adapter = LocalGemmaAdapter()
            res = await local_adapter.generate_diff(prompt, current_model)
            self._active_provider = local_adapter.provider_name
            return res
        except Exception as exc:
            logger.info(f"AutoAdaptive: Local Gemma no disponible ({exc}), usando fallback Mock local.")

        # Candidate 5: Deterministic Mock fallback
        mock_adapter = MockAIAdapter()
        res = await mock_adapter.generate_diff(prompt, current_model)
        self._active_provider = mock_adapter.provider_name
        return res
