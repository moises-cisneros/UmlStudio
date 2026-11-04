"""
UmlStudio AI Service — Core Configuration & Environment Loading.
Robustly discovers and loads .env files and manages provider settings.
"""

import os
import logging
from pathlib import Path
from typing import Dict, Any, List

logger = logging.getLogger("umlstudio.ai_service.config")

# Discovers and loads .env from package root, current dir, or repo root
try:
    from dotenv import load_dotenv

    src_dir = Path(__file__).resolve().parent.parent
    service_root = src_dir.parent
    repo_root = service_root.parent.parent

    loaded_paths = []
    for candidate in [service_root / ".env", Path.cwd() / ".env", repo_root / ".env"]:
        if candidate.is_file():
            load_dotenv(dotenv_path=candidate, override=False)
            loaded_paths.append(str(candidate))

    if loaded_paths:
        logger.info(f"Loaded environment variables from: {', '.join(loaded_paths)}")
except ImportError:
    logger.warning("python-dotenv not installed, reading directly from os.environ")


def _mask_secret(val: str) -> str:
    if not val:
        return "Not Set"
    if len(val) <= 8:
        return "****"
    return f"{val[:4]}...{val[-4:]}"


class Settings:
    # Server network settings
    PORT: int = int(os.getenv("AI_SERVICE_PORT", os.getenv("PORT", "8001")))
    HOST: str = os.getenv("AI_SERVICE_HOST", os.getenv("HOST", "0.0.0.0"))
    CORS_ORIGIN: str = os.getenv(
        "CORS_ORIGIN",
        os.getenv("CORS_ORIGINS", os.getenv("WEBAPP_ORIGIN", "http://localhost:5173")),
    ).strip()
    # Shared only with the server; never expose this value to the webapp.
    AI_INTERNAL_TOKEN: str = os.getenv("AI_INTERNAL_TOKEN", "").strip()

    # API Keys & Credentials
    CLOUDFLARE_ACCOUNT_ID: str = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    CLOUDFLARE_API_TOKEN: str = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    CLOUDFLARE_MODEL: str = os.getenv("CLOUDFLARE_MODEL", "@cf/meta/llama-3.1-8b-instruct").strip()

    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "").strip()
    OPENROUTER_MODEL: str = os.getenv(
        "OPENROUTER_MODEL", "qwen/qwen-2.5-coder-32b-instruct,meta-llama/llama-3.1-8b-instruct:free,liquid/lfm-2.5-2.6b:free"
    ).strip()

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()

    # LM Studio settings (:1234)
    LMSTUDIO_URL: str = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1").strip()
    LMSTUDIO_MODEL: str = os.getenv("LMSTUDIO_MODEL", "qwen3-4b-toolcalling-codex").strip()
    LMSTUDIO_VISION_MODEL: str = os.getenv("LMSTUDIO_VISION_MODEL", "qwen3-vl-4b-instruct").strip()

    # Ollama settings (:11434)
    OLLAMA_URL: str = os.getenv("OLLAMA_URL", os.getenv("LOCAL_LLM_URL", "http://localhost:11434/v1")).strip()
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", os.getenv("LOCAL_LLM_MODEL", "qwen2.5:7b-instruct")).strip()
    OLLAMA_API_KEY: str = os.getenv("OLLAMA_API_KEY", os.getenv("OLLAMA_AUTH_TOKEN", "")).strip()
    OLLAMA_AUTH_HEADER: str = os.getenv("OLLAMA_AUTH_HEADER", "").strip()

    # Room provider order when no specific provider is requested:
    # Comma-separated list of providers tried in sequence (e.g. "ollama,gemini").
    ROOM_PROVIDER_ORDER: str = os.getenv("ROOM_PROVIDER_ORDER", "ollama,gemini").strip()

    # Dedicated Room AI endpoint; no default or provider fallback.
    ROOM_AI_SELF_HOSTED_URL: str = os.getenv("ROOM_AI_SELF_HOSTED_URL", "").strip()
    ROOM_AI_SELF_HOSTED_MODEL: str = os.getenv("ROOM_AI_SELF_HOSTED_MODEL", "").strip()
    ROOM_AI_TOKENIZER_FILE: str = os.getenv("ROOM_AI_TOKENIZER_FILE", "").strip()
    ROOM_AI_TOKENIZER_MODEL: str = os.getenv("ROOM_AI_TOKENIZER_MODEL", "").strip()

    # Whisper STT settings (Local faster-whisper)
    WHISPER_ENGINE: str = os.getenv("WHISPER_ENGINE", "local").strip()
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base").strip()
    # "es" by default; "auto" lets Whisper detect the spoken language.
    WHISPER_LANGUAGE: str = os.getenv("WHISPER_LANGUAGE", "es").strip()
    # Directory holding the pre-downloaded model (Docker: /opt/whisper-models). Empty = library default cache.
    WHISPER_MODEL_DIR: str = os.getenv("WHISPER_MODEL_DIR", "").strip()
    # Load the model in the background at startup so the first request is not slow.
    WHISPER_PRELOAD: bool = os.getenv("WHISPER_PRELOAD", "false").strip().lower() in ("1", "true", "yes", "on")

    # Provider strategy:
    # - 'auto': complexity-based cloud order (complex prompt: Gemini -> OpenRouter -> Cloudflare;
    #   simple prompt: Cloudflare -> OpenRouter -> Gemini), then LM Studio -> Ollama (No mocks)
    # - 'local': LM Studio -> Ollama
    # - 'cloud': same complexity-based order over Cloudflare, OpenRouter and Gemini
    # - specific: 'cloudflare' | 'openrouter' | 'gemini' | 'lmstudio' | 'ollama'
    DEFAULT_PROVIDER: str = os.getenv("DEFAULT_PROVIDER", "auto").strip()

    def get_cors_origins(self) -> List[str]:
        raw = getattr(self, "CORS_ORIGIN", None)
        if raw is None:
            raw = os.getenv("CORS_ORIGIN", os.getenv("CORS_ORIGINS", os.getenv("WEBAPP_ORIGIN", "http://localhost:5173")))
        if not raw:
            return ["http://localhost:5173"]
        origins = [item.strip() for item in raw.split(",") if item.strip()]
        return origins or ["http://localhost:5173"]

    def get_room_provider_order(self) -> List[str]:
        raw = getattr(self, "ROOM_PROVIDER_ORDER", None)
        if raw is None:
            raw = os.getenv("ROOM_PROVIDER_ORDER", "ollama,gemini")
        if not raw:
            return ["ollama", "gemini"]
        order = [item.strip().lower() for item in raw.split(",") if item.strip()]
        return order or ["ollama", "gemini"]

    def get_ollama_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        header_val = getattr(self, "OLLAMA_AUTH_HEADER", None)
        if header_val is None:
            header_val = os.getenv("OLLAMA_AUTH_HEADER", "")
        header_val = (header_val or "").strip()
        if header_val:
            if ":" in header_val:
                name, val = header_val.split(":", 1)
                headers[name.strip()] = val.strip()
            elif header_val.lower().startswith("bearer "):
                headers["Authorization"] = header_val
            else:
                headers["Authorization"] = f"Bearer {header_val}"

        api_key = getattr(self, "OLLAMA_API_KEY", None)
        if api_key is None:
            api_key = os.getenv("OLLAMA_API_KEY", os.getenv("OLLAMA_AUTH_TOKEN", ""))
        api_key = (api_key or "").strip()
        if api_key and "Authorization" not in headers:
            headers["Authorization"] = (
                api_key if api_key.lower().startswith("bearer ") else f"Bearer {api_key}"
            )

        return headers

    def get_provider_status(self) -> Dict[str, Any]:
        return {
            "cloudflare": {
                "configured": bool(self.CLOUDFLARE_ACCOUNT_ID and self.CLOUDFLARE_API_TOKEN),
                "model": self.CLOUDFLARE_MODEL,
                "token_preview": _mask_secret(self.CLOUDFLARE_API_TOKEN),
            },
            "openrouter": {
                "configured": bool(self.OPENROUTER_API_KEY),
                "model": self.OPENROUTER_MODEL,
                "key_preview": _mask_secret(self.OPENROUTER_API_KEY),
            },
            "gemini": {
                "configured": bool(self.GEMINI_API_KEY),
                "model": self.GEMINI_MODEL,
                "key_preview": _mask_secret(self.GEMINI_API_KEY),
            },
            "lmstudio": {
                "configured": True,
                "url": self.LMSTUDIO_URL,
                "model": self.LMSTUDIO_MODEL,
                "vision_model": self.LMSTUDIO_VISION_MODEL,
            },
            "ollama": {
                "configured": True,
                "url": self.OLLAMA_URL,
                "model": self.OLLAMA_MODEL,
                "auth_configured": bool(self.get_ollama_headers()),
            },
            "room_provider_order": self.get_room_provider_order(),
            "local_whisper": {
                "configured": True,
                "engine": self.WHISPER_ENGINE,
                "model": self.WHISPER_MODEL,
                "language": self.WHISPER_LANGUAGE,
            },
        }


settings = Settings()
