"""
Voice pipeline: honest transcription (no invented transcripts), Whisper tuning,
spoken-UML normalization, low-confidence handling and HTTP error mapping.
"""

import asyncio
import math
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.core.config import settings
from src.models.uml import ModelDiff, DiffAddBlock, DiffElementAdd
from src.services import transcription
from src.services.pipeline import AIPipeline
from src.services.transcription import (
    TranscriptionError,
    normalize_spoken_uml,
    transcribe_audio_bytes,
)


class _FakeSegment:
    def __init__(self, text, avg_logprob=-0.1, no_speech_prob=0.01):
        self.text = text
        self.avg_logprob = avg_logprob
        self.no_speech_prob = no_speech_prob


class _FakeWhisper:
    def __init__(self, segments, language_probability=0.97):
        self._segments = segments
        self._info = SimpleNamespace(language="es", language_probability=language_probability)
        self.kwargs = None

    def transcribe(self, audio, **kwargs):
        self.kwargs = kwargs
        return iter(self._segments), self._info


class TestNormalizeSpokenUml(unittest.TestCase):
    def test_symbol_words(self):
        self.assertEqual(
            normalize_spoken_uml("clase cliente con atributo nombre dos puntos string"),
            "clase cliente con atributo nombre: string",
        )

    def test_multiplicity_phrases(self):
        cases = {
            "relación uno a muchos entre cliente y pedido": "relación 1 a * entre cliente y pedido",
            "relación muchos a muchos entre alumno y curso": "relación * a * entre alumno y curso",
            "relación uno a uno entre persona y pasaporte": "relación 1 a 1 entre persona y pasaporte",
            "multiplicidad uno punto punto asterisco": "multiplicidad 1..*",
            "multiplicidad cero punto punto uno": "multiplicidad 0..1",
            "multiplicidad cero punto punto asterisco": "multiplicidad 0..*",
            "con multiplicidad uno o más": "con multiplicidad 1..*",
        }
        for spoken, expected in cases.items():
            with self.subTest(spoken=spoken):
                self.assertEqual(normalize_spoken_uml(spoken), expected)

    def test_whisper_renders_dos_puntos_as_a_digit(self):
        cases = {
            "Crea una clase cliente con atributos nombre 2.string y edad 2.int.": (
                "Crea una clase cliente con atributos nombre: string y edad: int."
            ),
            "atributo saldo 2: Double": "atributo saldo: Double",
            "método calcular 2.Double": "método calcular: Double",
        }
        for spoken, expected in cases.items():
            with self.subTest(spoken=spoken):
                self.assertEqual(normalize_spoken_uml(spoken), expected)

    def test_real_numbers_are_not_mistaken_for_dos_puntos(self):
        for text in (
            "Crea 2 clases",
            "la versión 2.0 del sistema",
            "una clase con 2 atributos",
            "multiplicidad 2..5",
        ):
            with self.subTest(text=text):
                self.assertEqual(normalize_spoken_uml(text), text)

    def test_whitespace_and_trailing_filler_are_cleaned(self):
        self.assertEqual(
            normalize_spoken_uml("  crea   una clase   Auto.  Gracias. "),
            "crea una clase Auto.",
        )

    def test_plain_text_is_untouched(self):
        text = "Agrega una clase Vendedor que hereda de Empleado"
        self.assertEqual(normalize_spoken_uml(text), text)

    def test_empty(self):
        self.assertEqual(normalize_spoken_uml(""), "")
        self.assertEqual(normalize_spoken_uml(None), "")


class TestTranscribeAudioBytes(unittest.TestCase):
    def _run(self, *args, **kwargs):
        return asyncio.run(transcribe_audio_bytes(*args, **kwargs))

    def test_empty_bytes_return_empty(self):
        self.assertEqual(self._run(b"", "a.webm"), ("", 0.0))

    def test_local_whisper_is_tuned_for_uml_dictation(self):
        fake = _FakeWhisper([_FakeSegment("Crea una clase Cliente"), _FakeSegment("con nombre")])
        with patch.object(transcription, "_get_local_whisper", return_value=fake), patch.object(
            settings, "WHISPER_ENGINE", "local"
        ), patch.object(settings, "WHISPER_LANGUAGE", "es", create=True):
            text, conf = self._run(b"\x00\x01audio", "voice.webm")
        self.assertEqual(text, "Crea una clase Cliente con nombre")
        self.assertTrue(fake.kwargs["vad_filter"])
        self.assertEqual(fake.kwargs["language"], "es")
        self.assertIn("clase", fake.kwargs["initial_prompt"].lower())
        self.assertIn("multiplicidad", fake.kwargs["initial_prompt"].lower())

    def test_language_auto_detects(self):
        fake = _FakeWhisper([_FakeSegment("create a class")])
        with patch.object(transcription, "_get_local_whisper", return_value=fake), patch.object(
            settings, "WHISPER_ENGINE", "local"
        ), patch.object(settings, "WHISPER_LANGUAGE", "auto", create=True):
            self._run(b"\x00audio", "voice.webm")
        self.assertIsNone(fake.kwargs["language"])

    def test_confidence_is_derived_from_the_model_not_hardcoded(self):
        good = _FakeWhisper([_FakeSegment("hola", avg_logprob=-0.05)])
        poor = _FakeWhisper([_FakeSegment("hola", avg_logprob=-1.4)])
        with patch.object(settings, "WHISPER_ENGINE", "local"):
            with patch.object(transcription, "_get_local_whisper", return_value=good):
                _, c_good = self._run(b"\x00audio", "v.webm")
            with patch.object(transcription, "_get_local_whisper", return_value=poor):
                _, c_poor = self._run(b"\x00audio", "v.webm")
        self.assertAlmostEqual(c_good, math.exp(-0.05), places=2)
        self.assertLess(c_poor, c_good)
        self.assertGreaterEqual(c_poor, 0.0)
        self.assertLessEqual(c_good, 1.0)

    def test_segments_that_are_mostly_silence_are_dropped(self):
        fake = _FakeWhisper(
            [_FakeSegment("ruido fantasma", no_speech_prob=0.97), _FakeSegment("Crea una clase")]
        )
        with patch.object(transcription, "_get_local_whisper", return_value=fake), patch.object(
            settings, "WHISPER_ENGINE", "local"
        ):
            text, _ = self._run(b"\x00audio", "v.webm")
        self.assertEqual(text, "Crea una clase")

    def test_failure_raises_instead_of_inventing_a_transcript(self):
        with patch.object(
            transcription, "_get_local_whisper", side_effect=RuntimeError("model missing")
        ), patch.object(settings, "WHISPER_ENGINE", "local"):
            with self.assertRaises(TranscriptionError) as ctx:
                self._run(b"\x00audio", "observer.webm")
        self.assertIn("model missing", str(ctx.exception))

    def test_unusable_audio_raises_when_no_speech_is_found(self):
        fake = _FakeWhisper([_FakeSegment("", no_speech_prob=0.99)])
        with patch.object(transcription, "_get_local_whisper", return_value=fake), patch.object(
            settings, "WHISPER_ENGINE", "local"
        ):
            text, conf = self._run(b"\x00audio", "v.webm")
        self.assertEqual((text, conf), ("", 0.0))

    def test_stub_engine_is_explicit_and_fixture_driven(self):
        with patch.object(settings, "WHISPER_ENGINE", "stub"):
            text, conf = self._run(b"\x00audio", "observer.webm")
        self.assertEqual(text, "Crear patrón Observer con Subject y ConcreteObserver")
        self.assertEqual(conf, 1.0)


class TestVoicePackaging(unittest.TestCase):
    """requirements.txt must pin what faster-whisper needs at runtime."""

    def _requirements(self):
        from pathlib import Path

        path = Path(__file__).resolve().parents[2] / "requirements.txt"
        return [l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]

    def test_faster_whisper_is_bounded(self):
        self.assertTrue(any(l.startswith("faster-whisper") and "<2" in l for l in self._requirements()))

    def test_pyav_is_capped_below_19(self):
        # PyAV 19 dropped av.open(metadata_errors=...), which faster-whisper 1.2.x still passes.
        self.assertTrue(any(l.startswith("av") and "<19" in l for l in self._requirements()))


class _WhisperLoadingTestCase(unittest.TestCase):
    """Resets the module-level model cache around each test."""

    def setUp(self):
        self._saved = (transcription._local_whisper_model,)
        transcription._local_whisper_model = None

    def tearDown(self):
        (transcription._local_whisper_model,) = self._saved


class TestWhisperModelLoading(_WhisperLoadingTestCase):
    def test_concurrent_first_requests_load_the_model_once(self):
        import threading
        import time

        calls = []

        def slow_model(*args, **kwargs):
            calls.append((args, kwargs))
            time.sleep(0.15)
            return _FakeWhisper([])

        results = []
        with patch("faster_whisper.WhisperModel", side_effect=slow_model):
            threads = [
                threading.Thread(target=lambda: results.append(transcription._get_local_whisper()))
                for _ in range(2)
            ]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        self.assertEqual(len(calls), 1)
        self.assertIs(results[0], results[1])

    def test_download_root_comes_from_whisper_model_dir(self):
        with patch("faster_whisper.WhisperModel", return_value=_FakeWhisper([])) as ctor, patch.object(
            settings, "WHISPER_MODEL_DIR", "/opt/whisper-models", create=True
        ):
            transcription._get_local_whisper()
        self.assertEqual(ctor.call_args.kwargs["download_root"], "/opt/whisper-models")

    def test_empty_model_dir_means_default_cache(self):
        with patch("faster_whisper.WhisperModel", return_value=_FakeWhisper([])) as ctor, patch.object(
            settings, "WHISPER_MODEL_DIR", "", create=True
        ):
            transcription._get_local_whisper()
        self.assertIsNone(ctor.call_args.kwargs["download_root"])

    def test_load_failure_is_a_transcription_error_naming_whisper_model(self):
        with patch("faster_whisper.WhisperModel", side_effect=RuntimeError("no network")), patch.object(
            settings, "WHISPER_MODEL", "base"
        ):
            with self.assertRaises(TranscriptionError) as ctx:
                transcription._get_local_whisper()
        message = str(ctx.exception)
        self.assertIn("WHISPER_MODEL", message)
        self.assertIn("no network", message)

    def test_warm_up_failure_is_logged_and_does_not_raise(self):
        with patch("faster_whisper.WhisperModel", side_effect=RuntimeError("oom")):
            with self.assertLogs("umlstudio.ai_service.transcription", level="WARNING"):
                self.assertFalse(transcription.warm_up())
            self.assertFalse(transcription.is_ready())

    def test_warm_up_success_marks_ready(self):
        self.assertFalse(transcription.is_ready())
        with patch("faster_whisper.WhisperModel", return_value=_FakeWhisper([])):
            self.assertTrue(transcription.warm_up())
        self.assertTrue(transcription.is_ready())


class TestVoiceReadinessApi(_WhisperLoadingTestCase):
    @classmethod
    def setUpClass(cls):
        from src.main import app

        cls.app = app
        cls.client = TestClient(app)

    def test_providers_exposes_voice_ready(self):
        body = self.client.get("/api/providers").json()
        self.assertIs(body["voice"]["ready"], False)
        transcription._local_whisper_model = _FakeWhisper([])
        self.assertIs(self.client.get("/api/providers").json()["voice"]["ready"], True)

    def test_model_load_failure_returns_503_naming_whisper_model_after_failed_warm_up(self):
        with patch("faster_whisper.WhisperModel", side_effect=RuntimeError("oom")), patch.object(
            settings, "WHISPER_ENGINE", "local"
        ):
            self.assertFalse(transcription.warm_up())
            res = self.client.post(
                "/api/transcribe", files={"file": ("a.webm", b"\x00audio", "audio/webm")}
            )
        self.assertEqual(res.status_code, 503)
        self.assertIn("WHISPER_MODEL", res.json()["detail"])

    def test_lifespan_warms_up_in_background_only_when_preload_is_on(self):
        import threading

        warmed = threading.Event()

        def fake_warm_up():
            warmed.set()
            return True

        with patch("src.main.warm_up", fake_warm_up), patch.object(
            settings, "WHISPER_PRELOAD", True, create=True
        ):
            with TestClient(self.app) as client:
                self.assertEqual(client.get("/health").status_code, 200)
                self.assertTrue(warmed.wait(timeout=2))

        warmed.clear()
        with patch("src.main.warm_up", fake_warm_up), patch.object(
            settings, "WHISPER_PRELOAD", False, create=True
        ):
            with TestClient(self.app) as client:
                client.get("/health")
                self.assertFalse(warmed.wait(timeout=0.3))


def _diff_with_class(name="Cliente"):
    return ModelDiff(
        add=DiffAddBlock(
            elements=[DiffElementAdd(name=name, attributes=[{"name": "+ nombre: String"}])],
            relationships=[],
        )
    )


class _Adapter:
    provider_name = "scripted"

    def __init__(self):
        self.prompts = []

    async def generate_diff(self, prompt, current_model):
        self.prompts.append(prompt)
        return _diff_with_class()


class TestProcessVoice(unittest.TestCase):
    def _process(self, transcript, confidence=0.95):
        adapter = _Adapter()

        async def fake_transcribe(_b, _f):
            return (transcript, confidence)

        with patch("src.services.pipeline.transcribe_audio_bytes", fake_transcribe), patch(
            "src.adapters.get_adapter", return_value=adapter
        ):
            response = asyncio.run(AIPipeline.process_voice(b"\x00audio", "v.webm", {}, None))
        return response, adapter

    def test_transcript_is_normalized_before_reaching_the_llm(self):
        response, adapter = self._process("relación uno a muchos entre cliente y pedido")
        self.assertIn("1 a *", adapter.prompts[0])
        self.assertEqual(response.transcript, "relación 1 a * entre cliente y pedido")

    def test_empty_transcript_is_rejected(self):
        with self.assertRaises(ValueError):
            self._process("   ")

    def test_very_low_confidence_is_rejected_with_a_helpful_message(self):
        with self.assertRaises(ValueError) as ctx:
            self._process("clase algo", confidence=0.05)
        self.assertIn("claridad", str(ctx.exception))

    def test_transcription_failure_propagates_as_transcription_error(self):
        async def boom(_b, _f):
            raise TranscriptionError("sin motor de voz")

        with patch("src.services.pipeline.transcribe_audio_bytes", boom):
            with self.assertRaises(TranscriptionError):
                asyncio.run(AIPipeline.process_voice(b"\x00audio", "v.webm", {}, None))


class TestVoiceHttpEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from src.main import app

        cls.client = TestClient(app)

    def test_chat_voice_happy_path(self):
        adapter = _Adapter()

        async def fake_transcribe(_b, _f):
            return ("Crea una clase Cliente con nombre", 0.93)

        with patch("src.services.pipeline.transcribe_audio_bytes", fake_transcribe), patch(
            "src.adapters.get_adapter", return_value=adapter
        ):
            res = self.client.post(
                "/api/chat/voice",
                files={"file": ("voice.webm", b"\x1aE\xdf\xa3audio", "audio/webm")},
            )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["transcript"], "Crea una clase Cliente con nombre")
        self.assertEqual(body["diff"]["add"]["elements"][0]["name"], "Cliente")

    def test_chat_voice_empty_file_is_400(self):
        res = self.client.post(
            "/api/chat/voice", files={"file": ("voice.webm", b"", "audio/webm")}
        )
        self.assertEqual(res.status_code, 400)

    def test_chat_voice_transcription_failure_is_503_not_a_fake_diff(self):
        async def boom(_b, _f):
            raise TranscriptionError("sin motor de voz")

        with patch("src.services.pipeline.transcribe_audio_bytes", boom):
            res = self.client.post(
                "/api/chat/voice", files={"file": ("voice.webm", b"\x00audio", "audio/webm")}
            )
        self.assertEqual(res.status_code, 503)
        self.assertIn("voz", res.json()["detail"].lower())

    def test_transcribe_endpoint_failure_is_503(self):
        async def boom(_b, _f):
            raise TranscriptionError("sin motor de voz")

        with patch("src.main.transcribe_audio_bytes", boom):
            res = self.client.post(
                "/api/transcribe", files={"file": ("a.webm", b"\x00audio", "audio/webm")}
            )
        self.assertEqual(res.status_code, 503)

    def test_transcribe_endpoint_returns_text_and_confidence(self):
        async def ok(_b, _f):
            return ("hola mundo", 0.9)

        with patch("src.main.transcribe_audio_bytes", ok):
            res = self.client.post(
                "/api/transcribe", files={"file": ("a.webm", b"\x00audio", "audio/webm")}
            )
        self.assertEqual(res.json(), {"text": "hola mundo", "confidence": 0.9})


if __name__ == "__main__":
    unittest.main()
