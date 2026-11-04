"""
Unit tests for Issue #31:
- Ollama adapter auth modes: none, bearer, and gcp-id-token.
- Switching between modes via configuration only (RNF-31, RNF-34).
- Bearer token handling (from env or mocked token issuer).
- Google ID token handling (from GCP_SA_KEY_JSON or mocked token issuer).
- Mocked token issuers for both auth modes.
- Target audience derivation and error handling.
"""

import asyncio
import json
import unittest
from unittest.mock import patch, MagicMock, AsyncMock

from src.adapters.ollama import OllamaAdapter
from src.core.config import settings
from src.core.gcp_auth import GoogleIdTokenIssuer, extract_default_audience


MOCK_SA_KEY_DICT = {
    "type": "service_account",
    "project_id": "test-project-123",
    "private_key_id": "key-id-abc",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD\n-----END PRIVATE KEY-----\n",
    "client_email": "cloudrun-invoker@test-project-123.iam.gserviceaccount.com",
    "client_id": "112233445566778899",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}


class TestExtractDefaultAudience(unittest.TestCase):
    def test_extract_from_full_url(self):
        self.assertEqual(
            extract_default_audience("https://ollama-run-xyz.a.run.app/v1"),
            "https://ollama-run-xyz.a.run.app",
        )

    def test_extract_from_base_url(self):
        self.assertEqual(
            extract_default_audience("https://ollama-run-xyz.a.run.app"),
            "https://ollama-run-xyz.a.run.app",
        )

    def test_extract_from_localhost(self):
        self.assertEqual(
            extract_default_audience("http://localhost:11434/v1"),
            "http://localhost:11434",
        )

    def test_extract_empty(self):
        self.assertEqual(extract_default_audience(""), "")


class TestOllamaAuthModesConfig(unittest.TestCase):
    def test_mode_none_returns_empty_headers(self):
        with patch.object(settings, "OLLAMA_AUTH", "none"), patch.object(
            settings, "OLLAMA_API_KEY", "should-be-ignored"
        ):
            self.assertEqual(settings.get_ollama_auth_mode(), "none")
            self.assertEqual(settings.get_ollama_headers(), {})

    def test_mode_bearer_with_api_key(self):
        with patch.object(settings, "OLLAMA_AUTH", "bearer"), patch.object(
            settings, "OLLAMA_API_KEY", "secret-tunnel-key"
        ), patch.object(settings, "OLLAMA_AUTH_HEADER", ""):
            self.assertEqual(settings.get_ollama_auth_mode(), "bearer")
            headers = settings.get_ollama_headers()
            self.assertEqual(headers, {"Authorization": "Bearer secret-tunnel-key"})

    def test_mode_bearer_with_already_prefixed_token(self):
        with patch.object(settings, "OLLAMA_AUTH", "bearer"), patch.object(
            settings, "OLLAMA_API_KEY", "Bearer already-prefixed"
        ):
            headers = settings.get_ollama_headers()
            self.assertEqual(headers, {"Authorization": "Bearer already-prefixed"})

    def test_mode_bearer_with_mocked_token_issuer(self):
        mock_issuer = MagicMock(return_value="mocked-bearer-token-xyz")
        with patch.object(settings, "OLLAMA_AUTH", "bearer"), patch.object(
            settings, "OLLAMA_API_KEY", ""
        ):
            headers = settings.get_ollama_headers(token_issuer=mock_issuer)
            self.assertEqual(headers, {"Authorization": "Bearer mocked-bearer-token-xyz"})
            mock_issuer.assert_called_once()

    def test_mode_gcp_id_token_with_mocked_token_issuer(self):
        mock_issuer = MagicMock(return_value="mocked-google-id-token-abc.123")
        with patch.object(settings, "OLLAMA_AUTH", "gcp-id-token"), patch.object(
            settings, "GCP_SA_KEY_JSON", ""
        ):
            self.assertEqual(settings.get_ollama_auth_mode(), "gcp-id-token")
            headers = settings.get_ollama_headers(token_issuer=mock_issuer)
            self.assertEqual(
                headers, {"Authorization": "Bearer mocked-google-id-token-abc.123"}
            )
            mock_issuer.assert_called_once()

    def test_mode_gcp_id_token_missing_sa_key_raises_value_error(self):
        with patch.object(settings, "OLLAMA_AUTH", "gcp-id-token"), patch.object(
            settings, "GCP_SA_KEY_JSON", ""
        ), patch.object(settings, "_gcp_token_issuer", None):
            with self.assertRaises(ValueError) as ctx:
                settings.get_ollama_headers()
            self.assertIn("GCP_SA_KEY_JSON is required", str(ctx.exception))

    def test_invalid_mode_raises_value_error(self):
        with patch.object(settings, "OLLAMA_AUTH", "invalid-mode"):
            with self.assertRaises(ValueError) as ctx:
                settings.get_ollama_auth_mode()
            self.assertIn("Invalid OLLAMA_AUTH mode", str(ctx.exception))

    def test_switching_modes_via_configuration_only(self):
        """Proves RNF-31: switching between none, bearer, and gcp-id-token without code changes."""
        mock_gcp_issuer = MagicMock(return_value="id-token-from-gcp")

        # 1. Start with none
        with patch.object(settings, "OLLAMA_AUTH", "none"):
            self.assertEqual(settings.get_ollama_headers(), {})

        # 2. Switch to bearer
        with patch.object(settings, "OLLAMA_AUTH", "bearer"), patch.object(
            settings, "OLLAMA_API_KEY", "bearer-token-test"
        ):
            self.assertEqual(
                settings.get_ollama_headers(), {"Authorization": "Bearer bearer-token-test"}
            )

        # 3. Switch to gcp-id-token
        with patch.object(settings, "OLLAMA_AUTH", "gcp-id-token"):
            self.assertEqual(
                settings.get_ollama_headers(token_issuer=mock_gcp_issuer),
                {"Authorization": "Bearer id-token-from-gcp"},
            )

    def test_provider_status_reflects_auth_mode_and_configuration(self):
        with patch.object(settings, "OLLAMA_AUTH", "gcp-id-token"), patch.object(
            settings, "GCP_SA_KEY_JSON", "{\"type\":\"service_account\"}"
        ), patch.object(
            settings, "get_gcp_id_token", MagicMock(return_value="test-token")
        ):
            status = settings.get_provider_status()["ollama"]
            self.assertEqual(status["auth_mode"], "gcp-id-token")
            self.assertTrue(status["auth_configured"])

        with patch.object(settings, "OLLAMA_AUTH", "none"), patch.object(
            settings, "OLLAMA_API_KEY", ""
        ):
            status = settings.get_provider_status()["ollama"]
            self.assertEqual(status["auth_mode"], "none")
            self.assertFalse(status["auth_configured"])


class TestGoogleIdTokenIssuer(unittest.TestCase):
    def test_empty_sa_key_raises_error(self):
        with self.assertRaises(ValueError):
            GoogleIdTokenIssuer("", target_audience="https://ollama.run.app")

    def test_empty_audience_raises_error(self):
        with self.assertRaises(ValueError):
            GoogleIdTokenIssuer(MOCK_SA_KEY_DICT, target_audience="")

    def test_invalid_json_string_raises_error(self):
        with self.assertRaises(ValueError):
            GoogleIdTokenIssuer("{not-valid-json", target_audience="https://ollama.run.app")

    @patch("google.oauth2.service_account.IDTokenCredentials.from_service_account_info")
    def test_issuer_refreshes_and_returns_id_token(self, mock_from_info):
        mock_creds = MagicMock()
        mock_creds.valid = False
        mock_creds.token = "signed-google-id-token-xyz"
        mock_from_info.return_value = mock_creds

        issuer = GoogleIdTokenIssuer(
            sa_key=json.dumps(MOCK_SA_KEY_DICT),
            target_audience="https://ollama-service.a.run.app",
        )
        token = issuer.get_token()

        self.assertEqual(token, "signed-google-id-token-xyz")
        mock_from_info.assert_called_once_with(
            MOCK_SA_KEY_DICT, target_audience="https://ollama-service.a.run.app"
        )
        mock_creds.refresh.assert_called_once()

    @patch("google.oauth2.service_account.IDTokenCredentials.from_service_account_info")
    def test_issuer_skips_refresh_if_already_valid(self, mock_from_info):
        mock_creds = MagicMock()
        mock_creds.valid = True
        mock_creds.token = "still-valid-token"
        mock_from_info.return_value = mock_creds

        issuer = GoogleIdTokenIssuer(
            sa_key=MOCK_SA_KEY_DICT,
            target_audience="https://ollama-service.a.run.app",
        )
        token = issuer.get_token()

        self.assertEqual(token, "still-valid-token")
        mock_creds.refresh.assert_not_called()


class TestOllamaAdapterWithAuthModes(unittest.IsolatedAsyncioTestCase):
    async def test_adapter_attaches_bearer_header_in_requests(self):
        mock_response = MagicMock(status_code=200)
        with patch.object(settings, "OLLAMA_AUTH", "bearer"), patch.object(
            settings, "OLLAMA_API_KEY", "bearer-secret-777"
        ), patch("httpx.AsyncClient.get", AsyncMock(return_value=mock_response)) as mock_get:
            adapter = OllamaAdapter(endpoint_url="http://localhost:11434/v1")
            available = await adapter.is_available()

            self.assertTrue(available)
            mock_get.assert_called_once()
            called_headers = mock_get.call_args[1].get("headers", {})
            self.assertEqual(called_headers.get("Authorization"), "Bearer bearer-secret-777")

    async def test_adapter_attaches_gcp_id_token_header_in_requests(self):
        mock_response = MagicMock(status_code=200)
        mock_issuer = MagicMock(return_value="google-cloudrun-token-999")

        with patch.object(settings, "OLLAMA_AUTH", "gcp-id-token"), patch(
            "httpx.AsyncClient.get", AsyncMock(return_value=mock_response)
        ) as mock_get:
            adapter = OllamaAdapter(
                endpoint_url="https://ollama-run.a.run.app/v1",
                token_issuer=mock_issuer,
            )
            available = await adapter.is_available()

            self.assertTrue(available)
            mock_get.assert_called_once()
            called_headers = mock_get.call_args[1].get("headers", {})
            self.assertEqual(
                called_headers.get("Authorization"), "Bearer google-cloudrun-token-999"
            )

    async def test_adapter_completes_text_with_auth_header(self):
        mock_post = MagicMock(status_code=200)
        mock_post.json.return_value = {
            "choices": [{"message": {"content": "UML class response"}}]
        }
        mock_issuer = MagicMock(return_value="dynamic-id-token")

        with patch.object(settings, "OLLAMA_AUTH", "gcp-id-token"), patch(
            "httpx.AsyncClient.post", AsyncMock(return_value=mock_post)
        ) as mock_client_post:
            adapter = OllamaAdapter(
                endpoint_url="https://ollama-run.a.run.app/v1",
                token_issuer=mock_issuer,
            )
            text = await adapter.complete_text("Describe Class")

            self.assertEqual(text, "UML class response")
            mock_client_post.assert_called_once()
            headers = mock_client_post.call_args[1].get("headers", {})
            self.assertEqual(headers.get("Authorization"), "Bearer dynamic-id-token")

    async def test_adapter_dynamic_token_refresh(self):
        """Verifies that if the token issuer refreshes the token, requests pick up the new token."""
        mock_post = MagicMock(status_code=200)
        mock_post.json.return_value = {
            "choices": [{"message": {"content": "ok"}}]
        }

        tokens = ["init-token", "first-call-token", "second-call-token"]

        def rotating_token_issuer():
            return tokens.pop(0)

        with patch.object(settings, "OLLAMA_AUTH", "gcp-id-token"), patch(
            "httpx.AsyncClient.post", AsyncMock(return_value=mock_post)
        ) as mock_client_post:
            adapter = OllamaAdapter(
                endpoint_url="https://ollama-run.a.run.app/v1",
                token_issuer=rotating_token_issuer,
            )

            await adapter.complete_text("first call")
            h1 = mock_client_post.call_args_list[0][1].get("headers", {})
            self.assertEqual(h1.get("Authorization"), "Bearer first-call-token")

            await adapter.complete_text("second call")
            h2 = mock_client_post.call_args_list[1][1].get("headers", {})
            self.assertEqual(h2.get("Authorization"), "Bearer second-call-token")


if __name__ == "__main__":
    unittest.main()
