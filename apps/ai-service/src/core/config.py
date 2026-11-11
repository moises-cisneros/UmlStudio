"""
UmlStudio AI Service — Core Configuration & Environment Loading.
Robustly discovers and loads .env files and manages provider settings.
"""

import os
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

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
    CLOUDFLARE_BASE_URL: str = os.getenv(
        "CLOUDFLARE_BASE_URL", "https://api.cloudflare.com/client/v4"
    ).strip().rstrip("/")

    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "").strip()
    OPENROUTER_MODEL: str = os.getenv(
        "OPENROUTER_MODEL",
        "qwen/qwen-2.5-coder-32b-instruct,meta-llama/llama-3.1-8b-instruct:free,liquid/lfm-2.5-2.6b:free",
    ).strip()

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()

    # Optional OpenAI-compatible bridge for a cloud Agent AI provider.
    # Both URL and model must be set; leaving either empty preserves the existing cloud cascade.
    VERTEX_BRIDGE_URL: str = os.getenv("VERTEX_BRIDGE_URL", "").strip()
    VERTEX_BRIDGE_MODEL: str = os.getenv("VERTEX_BRIDGE_MODEL", "").strip()
    VERTEX_BRIDGE_API_KEY: str = os.getenv("VERTEX_BRIDGE_API_KEY", "").strip()

    # LM Studio settings (:1234)
    LMSTUDIO_URL: str = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1").strip()
    LMSTUDIO_MODEL: str = os.getenv("LMSTUDIO_MODEL", "qwen3-4b-toolcalling-codex").strip()
    LMSTUDIO_VISION_MODEL: str = os.getenv("LMSTUDIO_VISION_MODEL", "qwen3-vl-4b-instruct").strip()

    # Ollama settings (:11434 / Cloud Run)
    OLLAMA_URL: str = os.getenv(
        "OLLAMA_URL", os.getenv("LOCAL_LLM_URL", "http://localhost:11434/v1")
    ).strip()
    OLLAMA_MODEL: str = os.getenv(
        "OLLAMA_MODEL", os.getenv("LOCAL_LLM_MODEL", "qwen2.5:7b-instruct")
    ).strip()
    # Auth modes: 'none' | 'bearer' | 'gcp-id-token'
    OLLAMA_AUTH: str = os.getenv("OLLAMA_AUTH", "").strip().lower()
    OLLAMA_API_KEY: str = os.getenv("OLLAMA_API_KEY", os.getenv("OLLAMA_AUTH_TOKEN", "")).strip()
    OLLAMA_AUTH_HEADER: str = os.getenv("OLLAMA_AUTH_HEADER", "").strip()
    # Google Cloud Run service account key JSON and audience
    GCP_SA_KEY_JSON: str = os.getenv("GCP_SA_KEY_JSON", "").strip()
    GCP_TARGET_AUDIENCE: str = os.getenv(
        "GCP_TARGET_AUDIENCE", os.getenv("OLLAMA_GCP_AUDIENCE", "")
    ).strip()
    _gcp_token_issuer: Any = None

    # Room provider order when no specific provider is requested:
    # Comma-separated list of providers tried in sequence (e.g. "cloudflare,ollama,gemini").
    ROOM_PROVIDER_ORDER: str = os.getenv(
        "ROOM_PROVIDER_ORDER", "cloudflare,ollama,gemini"
    ).strip()

    # Dedicated Room AI endpoint; no default or provider fallback.
    ROOM_AI_SELF_HOSTED_URL: str = os.getenv("ROOM_AI_SELF_HOSTED_URL", "").strip()
    ROOM_AI_SELF_HOSTED_MODEL: str = os.getenv("ROOM_AI_SELF_HOSTED_MODEL", "").strip()
    ROOM_AI_TOKENIZER_FILE: str = os.getenv("ROOM_AI_TOKENIZER_FILE", "").strip()
    ROOM_AI_TOKENIZER_MODEL: str = os.getenv("ROOM_AI_TOKENIZER_MODEL", "").strip()
    # Kept separate from general Ollama timeouts because a scale-to-zero Room endpoint can cold start.
    ROOM_AI_REQUEST_TIMEOUT_SECONDS: float = float(
        os.getenv("ROOM_AI_REQUEST_TIMEOUT_SECONDS", "45")
    )

    # Whisper STT settings (Local faster-whisper)
    WHISPER_ENGINE: str = os.getenv("WHISPER_ENGINE", "local").strip()
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base").strip()
    # "es" by default; "auto" lets Whisper detect the spoken language.
    WHISPER_LANGUAGE: str = os.getenv("WHISPER_LANGUAGE", "es").strip()
    # Directory holding the pre-downloaded model (Docker: /opt/whisper-models). Empty = library default cache.
    WHISPER_MODEL_DIR: str = os.getenv("WHISPER_MODEL_DIR", "").strip()
    # Load the model in the background at startup so the first request is not slow.
    WHISPER_PRELOAD: bool = (
        os.getenv("WHISPER_PRELOAD", "false").strip().lower() in ("1", "true", "yes", "on")
    )

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
            raw = os.getenv(
                "CORS_ORIGIN",
                os.getenv("CORS_ORIGINS", os.getenv("WEBAPP_ORIGIN", "")),
            )
        default_origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "https://umlstudio.pages.dev",
        ]
        if not raw:
            return default_origins
        origins = [item.strip() for item in raw.split(",") if item.strip()]
        return origins or default_origins

    def get_room_provider_order(self) -> List[str]:
        raw = getattr(self, "ROOM_PROVIDER_ORDER", None)
        if raw is None:
            raw = os.getenv("ROOM_PROVIDER_ORDER", "cloudflare,ollama,gemini")
        if not raw:
            return ["cloudflare", "ollama", "gemini"]
        order = [item.strip().lower() for item in raw.split(",") if item.strip()]
        return order or ["cloudflare", "ollama", "gemini"]

    def get_ollama_auth_mode(self) -> str:
        raw = getattr(self, "OLLAMA_AUTH", None)
        if raw is None:
            raw = os.getenv("OLLAMA_AUTH", "")
        raw = (raw or "").strip().lower()
        if raw in ("none", "bearer", "gcp-id-token"):
            return raw
        if raw:
            raise ValueError(
                f"Invalid OLLAMA_AUTH mode '{raw}'. Allowed modes are 'none', 'bearer', or 'gcp-id-token'."
            )
        # Backward compatibility when OLLAMA_AUTH is unset:
        api_key = getattr(self, "OLLAMA_API_KEY", None)
        if api_key is None:
            api_key = os.getenv("OLLAMA_API_KEY", os.getenv("OLLAMA_AUTH_TOKEN", ""))
        header_val = getattr(self, "OLLAMA_AUTH_HEADER", None)
        if header_val is None:
            header_val = os.getenv("OLLAMA_AUTH_HEADER", "")
        if (api_key and api_key.strip()) or (header_val and header_val.strip()):
            return "bearer"
        return "none"

    def get_gcp_target_audience(self, target_url: Optional[str] = None) -> str:
        aud = getattr(self, "GCP_TARGET_AUDIENCE", None)
        if aud is None:
            aud = os.getenv("GCP_TARGET_AUDIENCE", os.getenv("OLLAMA_GCP_AUDIENCE", ""))
        aud = (aud or "").strip()
        if aud:
            return aud
        from .gcp_auth import extract_default_audience

        url = target_url or getattr(self, "OLLAMA_URL", "") or os.getenv("OLLAMA_URL", "")
        return extract_default_audience(url)

    def get_gcp_id_token(
        self, token_issuer: Optional[Any] = None, target_url: Optional[str] = None
    ) -> str:
        if token_issuer is not None:
            return token_issuer() if callable(token_issuer) else token_issuer.get_token()

        sa_key = getattr(self, "GCP_SA_KEY_JSON", None)
        if sa_key is None:
            sa_key = os.getenv("GCP_SA_KEY_JSON", "")
        sa_key = (sa_key or "").strip()
        if not sa_key:
            raise ValueError("GCP_SA_KEY_JSON is required when OLLAMA_AUTH is 'gcp-id-token'")

        audience = self.get_gcp_target_audience(target_url=target_url)
        from .gcp_auth import GoogleIdTokenIssuer

        if (
            self._gcp_token_issuer is None
            or getattr(self._gcp_token_issuer, "target_audience", None) != audience
        ):
            self._gcp_token_issuer = GoogleIdTokenIssuer(sa_key=sa_key, target_audience=audience)
        return self._gcp_token_issuer.get_token()

    def get_ollama_headers(
        self, token_issuer: Optional[Any] = None, target_url: Optional[str] = None
    ) -> Dict[str, str]:
        mode = self.get_ollama_auth_mode()
        if mode == "none":
            return {}

        headers: Dict[str, str] = {}
        header_val = getattr(self, "OLLAMA_AUTH_HEADER", None)
        if header_val is None:
            header_val = os.getenv("OLLAMA_AUTH_HEADER", "")
        header_val = (header_val or "").strip()
        if header_val:
            if ":" in header_val:
                name, val = header_val.split(":", 1)
                headers[name.strip()] = val.strip()

        if mode == "bearer":
            token = ""
            if token_issuer is not None:
                token = token_issuer() if callable(token_issuer) else token_issuer.get_token()
            else:
                api_key = getattr(self, "OLLAMA_API_KEY", None)
                if api_key is None:
                    api_key = os.getenv("OLLAMA_API_KEY", os.getenv("OLLAMA_AUTH_TOKEN", ""))
                token = (api_key or "").strip()
                if not token and header_val and ":" not in header_val:
                    token = header_val

            if token:
                auth_val = token if token.lower().startswith("bearer ") else f"Bearer {token}"
                headers["Authorization"] = auth_val

        elif mode == "gcp-id-token":
            token = self.get_gcp_id_token(token_issuer=token_issuer, target_url=target_url)
            if token:
                auth_val = token if token.lower().startswith("bearer ") else f"Bearer {token}"
                headers["Authorization"] = auth_val

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
            "vertex_bridge": {
                "configured": bool(self.VERTEX_BRIDGE_URL and self.VERTEX_BRIDGE_MODEL),
                "url": self.VERTEX_BRIDGE_URL,
                "model": self.VERTEX_BRIDGE_MODEL,
                "auth_configured": bool(self.VERTEX_BRIDGE_API_KEY),
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
                "auth_mode": self.get_ollama_auth_mode(),
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
