"""
Google Cloud Authentication for Private Cloud Run Services.
Generates and caches OIDC Google ID Tokens using a Service Account Key JSON (GCP_SA_KEY_JSON).
"""

import json
import logging
from typing import Any, Dict, Optional, Union
from urllib.parse import urlparse

logger = logging.getLogger("umlstudio.ai_service.gcp_auth")


def extract_default_audience(url: str) -> str:
    """Extract standard base URL suitable for Cloud Run audience from an endpoint URL."""
    if not url:
        return ""
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return url.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}"


class GoogleIdTokenIssuer:
    """Issuer for Google Cloud OIDC ID tokens using Service Account credentials."""

    def __init__(self, sa_key: Union[str, Dict[str, Any]], target_audience: str):
        if not sa_key:
            raise ValueError("GCP_SA_KEY_JSON is required for gcp-id-token authentication")
        if isinstance(sa_key, str):
            sa_key_str = sa_key.strip()
            if not sa_key_str:
                raise ValueError("GCP_SA_KEY_JSON is required for gcp-id-token authentication")
            if sa_key_str.startswith("{"):
                try:
                    self.info = json.loads(sa_key_str)
                except Exception as exc:
                    raise ValueError(f"Failed to parse GCP_SA_KEY_JSON as JSON: {exc}") from exc
            else:
                try:
                    with open(sa_key_str, "r", encoding="utf-8") as f:
                        self.info = json.load(f)
                except Exception as exc:
                    raise ValueError(
                        f"Failed to read service account key file '{sa_key_str}': {exc}"
                    ) from exc
        elif isinstance(sa_key, dict):
            self.info = dict(sa_key)
        else:
            raise TypeError("sa_key must be a JSON string, a dict, or a file path")

        if not target_audience:
            raise ValueError("A target audience is required to issue a Google ID token")

        self.target_audience = target_audience
        self._credentials = None

    def get_token(self) -> str:
        """Obtains a valid Google ID token, refreshing if necessary."""
        from google.oauth2 import service_account
        import google.auth.transport.requests

        if self._credentials is None:
            self._credentials = service_account.IDTokenCredentials.from_service_account_info(
                self.info,
                target_audience=self.target_audience,
            )

        if not self._credentials.valid:
            request = google.auth.transport.requests.Request()
            self._credentials.refresh(request)

        token = getattr(self._credentials, "token", None)
        if not token:
            raise RuntimeError("Failed to obtain Google ID token: empty token returned")
        return token
