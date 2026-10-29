"""Contract tests for the server-only Room voice transcription endpoint."""

import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.core.config import settings
from src.main import app


INTERNAL_PATH = "/internal/v1/transcribe"
PUBLIC_PATH = "/api/transcribe"


class TestInternalTranscription(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_internal_endpoint_requires_server_token_and_returns_transcript(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True), patch(
            "src.main.transcribe_audio_bytes",
            new=AsyncMock(return_value=("pregunta transcrita", 0.91)),
        ) as transcribe:
            response = self.client.post(
                INTERNAL_PATH,
                headers={"X-Internal-Token": "test-secret"},
                files={"file": ("question.webm", b"audio", "audio/webm")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"text": "pregunta transcrita", "confidence": 0.91})
        transcribe.assert_awaited_once()

    def test_internal_endpoint_rejects_missing_or_invalid_token(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True):
            missing = self.client.post(
                INTERNAL_PATH,
                files={"file": ("question.webm", b"audio", "audio/webm")},
            )
            invalid = self.client.post(
                INTERNAL_PATH,
                headers={"X-Internal-Token": "wrong"},
                files={"file": ("question.webm", b"audio", "audio/webm")},
            )

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(invalid.status_code, 401)

    def test_internal_endpoint_rejects_browser_origin_even_with_server_token(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True):
            response = self.client.post(
                INTERNAL_PATH,
                headers={
                    "X-Internal-Token": "test-secret",
                    "Origin": "http://localhost:5173",
                },
                files={"file": ("question.webm", b"audio", "audio/webm")},
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "Browser access is not allowed"})

    def test_existing_public_transcription_route_remains_unchanged(self):
        with patch.object(
            settings, "AI_INTERNAL_TOKEN", "test-secret", create=True
        ), patch(
            "src.main.transcribe_audio_bytes",
            new=AsyncMock(return_value=("public transcript", 0.8)),
        ) as transcribe:
            response = self.client.post(
                PUBLIC_PATH,
                files={"file": ("question.webm", b"audio", "audio/webm")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"text": "public transcript", "confidence": 0.8})
        transcribe.assert_awaited_once()

    def test_existing_internal_room_route_still_rejects_browser_origin(self):
        with patch.object(settings, "AI_INTERNAL_TOKEN", "test-secret", create=True):
            response = self.client.post(
                "/internal/v1/room/respond",
                headers={
                    "X-Internal-Token": "test-secret",
                    "Origin": "http://localhost:5173",
                },
                json={},
            )

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
