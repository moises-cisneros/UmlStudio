"""
UmlStudio AI Pipeline — Unified Multimodal Pipeline.
Handles natural language text and speech-to-text voice preprocessing
feeding directly into the auto-adaptive LLM diff generation pipeline.
"""

import json
import logging
from typing import Dict, Any, Optional

from ..models.uml import ChatResponse, ModelDiff
from ..adapters import get_adapter
from .transcription import transcribe_audio_bytes

logger = logging.getLogger("umlstudio.ai_service.pipeline")


class AIPipeline:
    """
    Unified AI Pipeline for UmlStudio.
    - Text: Prompt + Metamodel -> LLM -> ModelDiff
    - Voice: Audio Bytes -> Whisper STT -> Transcribed Text -> LLM -> ModelDiff
    """

    @classmethod
    async def process_text(
        cls,
        prompt: str,
        current_model: Optional[Dict[str, Any]] = None,
        provider: Optional[str] = None,
    ) -> ChatResponse:
        clean_prompt = (prompt or "").strip()
        if not clean_prompt:
            raise ValueError("El texto de instrucción no puede estar vacío.")

        adapter = get_adapter(provider)
        diff = await adapter.generate_diff(clean_prompt, current_model or {})

        elements_count = len(diff.add.elements) if diff.add and diff.add.elements else 0
        message = (
            f"Propuesta generada ({elements_count} elemento(s)) mediante '{adapter.provider_name}' "
            f"conforme al estándar OMG UML 2.5."
        )

        return ChatResponse(
            provider=adapter.provider_name,
            diff=diff,
            message=message,
        )

    @classmethod
    async def process_voice(
        cls,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        current_model: Optional[Dict[str, Any]] = None,
        provider: Optional[str] = None,
    ) -> ChatResponse:
        if not audio_bytes:
            raise ValueError("El archivo de audio recibido está vacío.")

        # Step 1: Pre-processing audio to text via Whisper
        logger.info(f"Pipeline de voz: transcribiendo {len(audio_bytes)} bytes con Whisper...")
        transcribed_text, confidence = await transcribe_audio_bytes(audio_bytes, filename)

        if not transcribed_text or not transcribed_text.strip():
            raise ValueError("No se pudo extraer texto audible de la grabación de voz.")

        logger.info(f"Pipeline de voz: audio transcrito con éxito -> '{transcribed_text}'")

        # Step 2: Feed transcribed text directly into the LLM pipeline
        response = await cls.process_text(transcribed_text, current_model, provider)
        response.transcript = transcribed_text
        return response
