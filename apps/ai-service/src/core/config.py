"""
UmlStudio AI Service — Core Configuration & Environment Loading.
Robustly discovers and loads .env files and manages provider settings.
"""

import os
import logging
from pathlib import Path
from typing import Dict, Any

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
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", os.getenv("LOCAL_LLM_MODEL", "gemma:2b")).strip()

    # Whisper STT settings (Local faster-whisper)
    WHISPER_ENGINE: str = os.getenv("WHISPER_ENGINE", "local").strip()
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base").strip()

    # Provider strategy:
    # - 'auto': Cloudflare -> OpenRouter -> Gemini -> LM Studio -> Ollama (No mocks)
    # - 'local': LM Studio -> Ollama
    # - 'cloud': Cloudflare -> OpenRouter -> Gemini
    # - specific: 'cloudflare' | 'openrouter' | 'gemini' | 'lmstudio' | 'ollama'
    DEFAULT_PROVIDER: str = os.getenv("DEFAULT_PROVIDER", "auto").strip()

    @classmethod
    def get_provider_status(cls) -> Dict[str, Any]:
        return {
            "cloudflare": {
                "configured": bool(cls.CLOUDFLARE_ACCOUNT_ID and cls.CLOUDFLARE_API_TOKEN),
                "model": cls.CLOUDFLARE_MODEL,
                "token_preview": _mask_secret(cls.CLOUDFLARE_API_TOKEN),
            },
            "openrouter": {
                "configured": bool(cls.OPENROUTER_API_KEY),
                "model": cls.OPENROUTER_MODEL,
                "key_preview": _mask_secret(cls.OPENROUTER_API_KEY),
            },
            "gemini": {
                "configured": bool(cls.GEMINI_API_KEY),
                "model": cls.GEMINI_MODEL,
                "key_preview": _mask_secret(cls.GEMINI_API_KEY),
            },
            "lmstudio": {
                "configured": True,
                "url": cls.LMSTUDIO_URL,
                "model": cls.LMSTUDIO_MODEL,
                "vision_model": cls.LMSTUDIO_VISION_MODEL,
            },
            "ollama": {
                "configured": True,
                "url": cls.OLLAMA_URL,
                "model": cls.OLLAMA_MODEL,
            },
            "local_whisper": {
                "configured": True,
                "engine": cls.WHISPER_ENGINE,
                "model": cls.WHISPER_MODEL,
            },
        }


settings = Settings()
