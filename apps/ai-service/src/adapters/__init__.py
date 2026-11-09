from .base import BaseAIAdapter
from .cloudflare import CloudflareAdapter
from .openrouter import OpenRouterAdapter
from .gemini import GeminiAdapter
from .lmstudio import LMStudioAdapter
from .ollama import OllamaAdapter
from .vertex_bridge import VertexBridgeAdapter
from .auto import AutoAdaptiveAdapter


def get_room_adapter() -> BaseAIAdapter:
    from ..core.config import settings

    return AutoAdaptiveAdapter(
        mode="room", provider_order=settings.get_room_provider_order()
    )


def get_adapter(provider_name: str = None) -> BaseAIAdapter:
    from ..core.config import settings

    normalized = (provider_name or "").lower().strip()
    if normalized == "room":
        return get_room_adapter()
    if not normalized or normalized == "default":
        normalized = (settings.DEFAULT_PROVIDER or "auto").lower().strip()

    if normalized in ("auto", "adaptive"):
        return AutoAdaptiveAdapter(mode="auto")
    elif normalized in ("local", "laptop"):
        return AutoAdaptiveAdapter(mode="local")
    elif normalized in ("cloud", "remote"):
        return AutoAdaptiveAdapter(mode="cloud")
    elif "cloudflare" in normalized:
        return CloudflareAdapter()
    elif "openrouter" in normalized:
        return OpenRouterAdapter()
    elif "gemini" in normalized:
        return GeminiAdapter()
    elif "lmstudio" in normalized or "lm-studio" in normalized:
        return LMStudioAdapter()
    elif "ollama" in normalized or "gemma" in normalized:
        return OllamaAdapter()
    elif normalized in ("vertex", "vertex-bridge", "vertex_bridge"):
        return VertexBridgeAdapter()
    return AutoAdaptiveAdapter(mode=normalized)


__all__ = [
    "BaseAIAdapter",
    "CloudflareAdapter",
    "OpenRouterAdapter",
    "GeminiAdapter",
    "LMStudioAdapter",
    "OllamaAdapter",
    "VertexBridgeAdapter",
    "AutoAdaptiveAdapter",
    "get_adapter",
    "get_room_adapter",
]
