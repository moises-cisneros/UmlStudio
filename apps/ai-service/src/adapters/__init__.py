from .base import BaseAIAdapter
from .gemini import GeminiAdapter
from .openai import OpenAIAdapter
from .anthropic import AnthropicAdapter
from .local_gemma import LocalGemmaAdapter
from .mock import MockAIAdapter
from .auto import AutoAdaptiveAdapter


def get_adapter(provider_name: str = None) -> BaseAIAdapter:
    normalized = (provider_name or "").lower().strip()
    if not normalized or normalized == "auto":
        return AutoAdaptiveAdapter()
    elif "gemini" in normalized:
        return GeminiAdapter()
    elif "openai" in normalized or "gpt" in normalized:
        return OpenAIAdapter()
    elif "claude" in normalized or "anthropic" in normalized:
        return AnthropicAdapter()
    elif "gemma" in normalized or "local" in normalized:
        return LocalGemmaAdapter()
    elif "mock" in normalized:
        return MockAIAdapter()
    return AutoAdaptiveAdapter()


__all__ = [
    "BaseAIAdapter",
    "GeminiAdapter",
    "OpenAIAdapter",
    "AnthropicAdapter",
    "LocalGemmaAdapter",
    "MockAIAdapter",
    "AutoAdaptiveAdapter",
    "get_adapter",
]
