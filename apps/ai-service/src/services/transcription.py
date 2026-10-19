"""
Speech-to-Text Engine for UmlStudio.

Engines (WHISPER_ENGINE):
- 'local' / 'auto': faster-whisper on CPU (CTranslate2), tuned for UML dictation.
- 'stub': deterministic fixtures keyed by filename, for tests/CI only. Never implicit.

A failed transcription raises TranscriptionError: the service must never invent
a transcript, because the LLM would turn it into a convincing but wrong diagram.
"""

import io
import asyncio
import logging
import math
import re
import threading
from typing import Optional, Tuple
from ..core.config import settings

logger = logging.getLogger("umlstudio.ai_service.transcription")

_local_whisper_model = None
_load_lock = threading.Lock()

# Biases Whisper towards the vocabulary of class-diagram dictation.
UML_INITIAL_PROMPT = (
    "Diagrama de clases UML. Crea una clase con atributos y métodos. Interfaz, enumeración, "
    "clase abstracta, herencia, composición, agregación, asociación, dependencia, realización, "
    "multiplicidad uno a muchos, cero o uno, uno o más. Visibilidad pública, privada, protegida."
)

NO_SPEECH_THRESHOLD = 0.6


class TranscriptionError(RuntimeError):
    """The audio could not be transcribed (engine missing, model failure, unsupported engine)."""


def _get_local_whisper():
    """Returns the shared model, loading it once (thread-safe: concurrent first requests wait)."""
    global _local_whisper_model
    if _local_whisper_model is not None:
        return _local_whisper_model
    with _load_lock:
        if _local_whisper_model is not None:
            return _local_whisper_model
        model_size = settings.WHISPER_MODEL or "base"
        try:
            from faster_whisper import WhisperModel

            logger.info(f"Cargando modelo local faster-whisper '{model_size}' (device=cpu, compute_type=int8)...")
            _local_whisper_model = WhisperModel(
                model_size,
                device="cpu",
                compute_type="int8",
                download_root=(getattr(settings, "WHISPER_MODEL_DIR", "") or None),
            )
        except Exception as exc:
            logger.warning(f"No se pudo inicializar faster-whisper local: {exc}")
            raise TranscriptionError(
                f"No se pudo cargar el modelo de voz '{model_size}' (WHISPER_MODEL): {exc}"
            ) from exc
    return _local_whisper_model


def is_ready() -> bool:
    """True when the local model is already loaded in memory."""
    return _local_whisper_model is not None


def warm_up() -> bool:
    """Loads the model ahead of the first request. Never raises: a failure is logged and returns False."""
    try:
        _get_local_whisper()
        return True
    except Exception as exc:
        logger.warning(f"Precarga del modelo de voz falló; las peticiones devolverán 503: {exc}")
        return False


def _whisper_language() -> Optional[str]:
    lang = (getattr(settings, "WHISPER_LANGUAGE", "es") or "es").strip().lower()
    return None if lang in ("auto", "") else lang


def _transcribe_local_sync(file_bytes: bytes) -> Tuple[str, float]:
    model = _get_local_whisper()
    segments, _info = model.transcribe(
        io.BytesIO(file_bytes),
        language=_whisper_language(),
        beam_size=5,
        vad_filter=True,
        initial_prompt=UML_INITIAL_PROMPT,
        condition_on_previous_text=False,
    )

    kept = []
    for segment in segments:
        text = (segment.text or "").strip()
        if not text:
            continue
        if getattr(segment, "no_speech_prob", 0.0) > NO_SPEECH_THRESHOLD:
            continue
        kept.append(segment)

    if not kept:
        return ("", 0.0)

    full_text = " ".join(s.text.strip() for s in kept).strip()
    mean_logprob = sum(getattr(s, "avg_logprob", 0.0) for s in kept) / len(kept)
    confidence = max(0.0, min(1.0, math.exp(mean_logprob)))
    return (full_text, confidence)


_STUB_TRANSCRIPTS = (
    ("observer", "Crear patrón Observer con Subject y ConcreteObserver"),
    ("factory", "Crear patrón Factory Method con Creator y Product"),
)
_STUB_DEFAULT = "Crear patrón Strategy con Contexto y 2 estrategias"


def _stub_transcript(filename: str) -> Tuple[str, float]:
    lower_fn = (filename or "").lower()
    for marker, text in _STUB_TRANSCRIPTS:
        if marker in lower_fn:
            return (text, 1.0)
    return (_STUB_DEFAULT, 1.0)


async def transcribe_audio_bytes(file_bytes: bytes, filename: str) -> Tuple[str, float]:
    """
    Transcribes audio bytes into (text, confidence in 0..1).
    Returns ("", 0.0) when the engine ran but found no speech; raises TranscriptionError otherwise.
    """
    if not file_bytes:
        return ("", 0.0)

    engine = (settings.WHISPER_ENGINE or "local").strip().lower()

    if engine == "stub":
        return _stub_transcript(filename)

    if engine not in ("local", "auto"):
        raise TranscriptionError(
            f"Motor de voz no soportado: '{settings.WHISPER_ENGINE}'. Usa WHISPER_ENGINE=local."
        )

    try:
        logger.info("Transcribiendo audio mediante Whisper local...")
        return await asyncio.to_thread(_transcribe_local_sync, file_bytes)
    except TranscriptionError:
        raise
    except Exception as exc:
        logger.warning(f"Transcripción local falló ({exc}).")
        raise TranscriptionError(
            f"El motor de voz no pudo transcribir el audio: {exc}"
        ) from exc


_SPOKEN_BOUND = {
    "cero": "0",
    "uno": "1",
    "una": "1",
    "asterisco": "*",
    "estrella": "*",
    "n": "*",
    "muchos": "*",
}

_RANGE_SPOKEN = re.compile(
    r"\b(cero|uno|\d+)\s+punto\s+punto\s+(asterisco|estrella|muchos|uno|n|\d+)\b", re.IGNORECASE
)

_SPOKEN_PHRASES = (
    (re.compile(r"\bmuchos\s+a\s+muchos\b", re.IGNORECASE), "* a *"),
    (re.compile(r"\buno\s+a\s+muchos\b", re.IGNORECASE), "1 a *"),
    (re.compile(r"\bmuchos\s+a\s+uno\b", re.IGNORECASE), "* a 1"),
    (re.compile(r"\buno\s+a\s+uno\b", re.IGNORECASE), "1 a 1"),
    (re.compile(r"\buno\s+o\s+m[aá]s\b", re.IGNORECASE), "1..*"),
    (re.compile(r"\bcero\s+o\s+m[aá]s\b", re.IGNORECASE), "0..*"),
    (re.compile(r"\bcero\s+o\s+uno\b", re.IGNORECASE), "0..1"),
)

_DIGIT_COLON = re.compile(r"(?<=[A-Za-zÁ-ú])\s+2(?:\.(?=[A-Za-z])|:\s*)")

_FILLER_TAIL =re.compile(r"[\s,]*\b(?:muchas\s+)?gracias\b[.!\s]*$", re.IGNORECASE)


def _range_replacement(match: "re.Match[str]") -> str:
    low = _SPOKEN_BOUND.get(match.group(1).lower(), match.group(1))
    high = _SPOKEN_BOUND.get(match.group(2).lower(), match.group(2))
    return f"{low}..{high}"


def normalize_spoken_uml(text: Optional[str]) -> str:
    """Turns dictated UML ("uno a muchos", "dos puntos", "uno punto punto asterisco") into notation."""
    if not text:
        return ""
    result = re.sub(r"\s+", " ", text).strip()
    result = _RANGE_SPOKEN.sub(_range_replacement, result)
    for pattern, replacement in _SPOKEN_PHRASES:
        result = pattern.sub(replacement, result)
    result = re.sub(r"\s*\bdos\s+puntos\b\s*", ": ", result, flags=re.IGNORECASE)
    # Whisper often writes "dos puntos" as the digit: "nombre 2.string" / "saldo 2: Double"
    result = _DIGIT_COLON.sub(": ", result)
    result = re.sub(r"\s*\babre\s+par[eé]ntesis\b\s*", "(", result, flags=re.IGNORECASE)
    result = re.sub(r"\s*\bcierra\s+par[eé]ntesis\b", ")", result, flags=re.IGNORECASE)
    result = _FILLER_TAIL.sub("", result)
    return re.sub(r"\s+", " ", result).strip()
