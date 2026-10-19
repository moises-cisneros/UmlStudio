"""
UmlStudio AI Pipeline — Unified Multimodal Pipeline.
Handles natural language text and speech-to-text voice preprocessing
feeding directly into the auto-adaptive LLM diff generation pipeline.
"""

import json
import logging
from typing import Dict, Any, Optional

from ..models.uml import ChatResponse, ModelDiff
from .diff_quality import assess_diff, build_repair_feedback, score_diff, strip_example_copies
from .transcription import normalize_spoken_uml, transcribe_audio_bytes

MIN_TRANSCRIPT_CONFIDENCE = 0.2
MAX_REPAIR_ROUNDS = 1

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

        # Log Phase 1: Input instruction and diagram context
        existing_classes = [
            n.get("data", {}).get("name")
            for n in (current_model or {}).get("nodes", [])
            if isinstance(n, dict) and n.get("data", {}).get("name")
        ]
        print(f"\n{'='*25} [FASE 1: ENTRADA Y CONTEXTO DEL DIAGRAMA] {'='*25}")
        print(f"  * Prompt Recibido: \"{clean_prompt}\"")
        print(
            f"  * Clases Existentes en el Diagrama ({len(existing_classes)}): "
            f"{existing_classes if existing_classes else '(Diagrama vacío)'}"
        )
        print(f"  * Proveedor Solicitado: {provider or 'default'}")
        print(f"{'='*70}\n")

        from ..adapters import get_adapter

        adapter = get_adapter(provider)
        diff = await adapter.generate_diff(clean_prompt, current_model or {})
        diff = await cls._repair_if_needed(adapter, clean_prompt, current_model or {}, diff)

        adds_count = len(diff.add.elements) if diff.add and diff.add.elements else 0
        rels_count = len(diff.add.relationships) if diff.add and diff.add.relationships else 0
        mods_count = len(diff.modify.elements) if diff.modify and diff.modify.elements else 0
        rems_count = (
            (len(diff.remove.elementIds or []) + len(diff.remove.relationshipIds or []))
            if diff.remove
            else 0
        )

        parts = []
        if adds_count:
            parts.append(f"{adds_count} clase(s)")
        if rels_count:
            parts.append(f"{rels_count} relación(es)")
        if mods_count:
            parts.append(f"{mods_count} modificación(es)")
        if rems_count:
            parts.append(f"{rems_count} eliminación(es)")

        summary = ", ".join(parts) if parts else "0 cambios estructurales"
        print(f"[AI-SERVICE] <<< Diff Generado: {summary}\n")

        if not parts:
            message = (
                f"El modelo '{adapter.provider_name}' no pudo interpretar la solicitud y no propuso cambios. "
                "Reformúlala con más detalle o prueba con otro proveedor de IA."
            )
        else:
            message = (
                f"Propuesta generada ({summary}) mediante '{adapter.provider_name}' "
                f"conforme al estándar OMG UML 2.5."
            )

        return ChatResponse(
            provider=adapter.provider_name,
            diff=diff,
            message=message,
        )

    @classmethod
    async def _repair_if_needed(cls, adapter, prompt: str, current_model: Dict[str, Any], diff: ModelDiff) -> ModelDiff:
        """
        One bounded self-correction round: if the quality gate finds problems, ask the model again
        with explicit feedback and keep whichever diff scores better. Failures never lose the first diff.
        """
        best = diff
        for _ in range(MAX_REPAIR_ROUNDS):
            issues = assess_diff(prompt, best, current_model)
            if not issues:
                break
            logger.info("Diff con %d problema(s); reintentando con retroalimentación: %s", len(issues), issues)
            repair_prompt = f"{prompt}\n\n{build_repair_feedback(issues)}"
            try:
                candidate = await adapter.generate_diff(repair_prompt, current_model)
            except Exception as exc:
                logger.warning("Reintento de reparación falló (%s); se conserva el primer resultado.", exc)
                break
            if score_diff(prompt, candidate, current_model) > score_diff(prompt, best, current_model):
                best = candidate
        cleaned, removed = strip_example_copies(prompt, best, current_model)
        if removed:
            logger.warning("Descartadas clases copiadas de los ejemplos del prompt: %s", removed)
        return cleaned

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
        if confidence < MIN_TRANSCRIPT_CONFIDENCE:
            raise ValueError(
                "No se entendió el audio con suficiente claridad. Habla más cerca del micrófono "
                "o reduce el ruido de fondo e inténtalo de nuevo."
            )
        transcribed_text = normalize_spoken_uml(transcribed_text)
        if not transcribed_text:
            raise ValueError("No se pudo extraer texto audible de la grabación de voz.")

        logger.info(f"Pipeline de voz: audio transcrito con éxito -> '{transcribed_text}'")

        # Step 2: Feed transcribed text directly into the LLM pipeline
        response = await cls.process_text(transcribed_text, current_model, provider)
        response.transcript = transcribed_text
        return response
