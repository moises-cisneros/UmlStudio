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

    # API Keys
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "").strip()
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "").strip()

    # Model identifiers
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o").strip()
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219").strip()

    # Local LLM settings (Ollama / vLLM)
    LOCAL_LLM_URL: str = os.getenv("LOCAL_LLM_URL", "http://localhost:11434/v1").strip()
    LOCAL_LLM_MODEL: str = os.getenv("LOCAL_LLM_MODEL", "gemma:2b").strip()

    # Provider strategy: auto (cascading fallback) or specific provider
    DEFAULT_PROVIDER: str = os.getenv("DEFAULT_PROVIDER", "auto").strip()

    @classmethod
    def get_provider_status(cls) -> Dict[str, Any]:
        return {
            "gemini": {
                "configured": bool(cls.GEMINI_API_KEY),
                "model": cls.GEMINI_MODEL,
                "key_preview": _mask_secret(cls.GEMINI_API_KEY),
            },
            "openai": {
                "configured": bool(cls.OPENAI_API_KEY),
                "model": cls.OPENAI_MODEL,
                "key_preview": _mask_secret(cls.OPENAI_API_KEY),
            },
            "anthropic": {
                "configured": bool(cls.ANTHROPIC_API_KEY),
                "model": cls.ANTHROPIC_MODEL,
                "key_preview": _mask_secret(cls.ANTHROPIC_API_KEY),
            },
            "groq_whisper": {
                "configured": bool(cls.GROQ_API_KEY),
                "model": "whisper-large-v3",
                "key_preview": _mask_secret(cls.GROQ_API_KEY),
            },
            "openai_whisper": {
                "configured": bool(cls.OPENAI_API_KEY),
                "model": "whisper-1",
                "key_preview": _mask_secret(cls.OPENAI_API_KEY),
            },
            "local_gemma": {
                "url": cls.LOCAL_LLM_URL,
                "model": cls.LOCAL_LLM_MODEL,
            },
            "mock": {
                "configured": True,
                "model": "mock-local",
            },
        }


settings = Settings()
