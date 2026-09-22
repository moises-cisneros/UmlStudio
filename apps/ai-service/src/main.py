"""
UmlStudio AI Service — FastAPI REST Application (:8001).
Unified Multi-Adapter Architecture for OMG UML 2.5.
"""

import asyncio
import json
import os
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .vision.providers import get_vision_provider
from .vision.validation import (
    VISION_ACCEPTED_EXTENSIONS,
    VISION_ACCEPTED_MIME,
    VISION_MAX_BYTES,
    VISION_MIN_HEIGHT,
    VISION_MIN_WIDTH,
    detect_dimensions,
    validate_vision_model,
)
from .models.uml import (
    ChatRequest,
    ChatResponse,
    TranscribeResponse,
    AuditRequest,
    AuditResponse,
    SolidViolation,
    PatternSuggestion,
    ProductivityAuditRequest,
    ProductivityAuditResponse,
)
from .services.pipeline import AIPipeline
from .services.transcription import transcribe_audio_bytes

app = FastAPI(
    title="UmlStudio AI Service",
    description="Production Multi-Adapter AI Service for UML Class Diagram Modeling and Analysis",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "umlstudio-ai-service", "version": "2.0.0"}


@app.get("/api/providers")
async def get_providers() -> Dict[str, Any]:
    """
    Returns configured LLM providers with masked credentials.
    """
    return {
        "default": settings.DEFAULT_PROVIDER,
        "providers": settings.get_provider_status(),
    }


@app.post("/api/chat", response_model=ChatResponse, response_model_exclude_none=True)
async def process_chat(request: ChatRequest) -> ChatResponse:
    """
    Text-based chat endpoint:
    Natural language instruction -> LLM diff generation -> ModelDiff.
    """
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="El prompt no puede estar vacío.")

    try:
        return await AIPipeline.process_text(
            prompt=request.prompt,
            current_model=request.model or {},
            provider=request.provider,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except RuntimeError as r_err:
        if "No hay modelos" in str(r_err):
            from .models.uml import ModelDiff, DiffAddBlock
            return ChatResponse(
                provider="none",
                diff=ModelDiff(add=DiffAddBlock(elements=[], relationships=[])),
                message=str(r_err),
            )
        raise HTTPException(
            status_code=502,
            detail=f"Fallo en pipeline de IA: {str(r_err)}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Fallo en pipeline de IA: {str(exc)}",
        )


@app.post("/api/chat/voice", response_model=ChatResponse, response_model_exclude_none=True)
async def process_voice_chat(
    file: UploadFile = File(...),
    model: Optional[str] = Form(None),
    provider: Optional[str] = Form(None),
) -> ChatResponse:
    """
    Unified voice chat endpoint:
    Audio recording -> Whisper STT -> Transcribed Text -> LLM diff generation -> ModelDiff.
    """
    if not file:
        raise HTTPException(status_code=400, detail="Archivo de audio requerido.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="El archivo de audio está vacío.")

    model_dict = {}
    if model:
        try:
            model_dict = json.loads(model)
        except Exception:
            model_dict = {}

    try:
        return await AIPipeline.process_voice(
            audio_bytes=file_bytes,
            filename=file.filename or "voice.webm",
            current_model=model_dict,
            provider=provider,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except RuntimeError as r_err:
        if "No hay modelos" in str(r_err):
            from .models.uml import ModelDiff, DiffAddBlock
            return ChatResponse(
                provider="none",
                diff=ModelDiff(add=DiffAddBlock(elements=[], relationships=[])),
                message=str(r_err),
            )
        raise HTTPException(
            status_code=502,
            detail=f"Fallo en pipeline de voz y LLM: {str(r_err)}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Fallo en pipeline de voz y LLM: {str(exc)}",
        )


@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(file: UploadFile = File(...)) -> TranscribeResponse:
    """
    Audio transcription endpoint (Whisper).
    """
    if not file:
        raise HTTPException(status_code=400, detail="Archivo de audio requerido.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="El archivo de audio está vacío.")

    text, confidence = await transcribe_audio_bytes(file_bytes, file.filename or "audio.webm")

    return TranscribeResponse(
        text=text,
        confidence=confidence,
    )


@app.post("/api/audit", response_model=AuditResponse)
async def audit_diagram(request: AuditRequest) -> AuditResponse:
    """
    Analyzes model for Object-Oriented SOLID design smells (SRP, God Class).
    """
    model = request.model or {}
    nodes: List[Dict[str, Any]] = model.get("nodes", [])

    violations: List[SolidViolation] = []
    suggestions: List[PatternSuggestion] = []

    for node in nodes:
        data = node.get("data", {})
        name = data.get("name", "Unnamed")
        methods = data.get("methods", [])
        attrs = data.get("attributes", [])

        if len(methods) > 7 or (len(methods) + len(attrs)) > 12:
            violations.append(
                SolidViolation(
                    principle="Single Responsibility Principle (SRP)",
                    severity="warning",
                    element_id=node.get("id"),
                    element_name=name,
                    message=f"La clase '{name}' posee {len(methods)} métodos y {len(attrs)} atributos, sugiriendo un God Class / Acumulador de responsabilidades.",
                    suggestion="Considera extraer responsabilidades auxiliares en clases colaboradoras o aplicar el patrón Facade/Strategy.",
                )
            )

    has_classes = any(n.get("data", {}).get("type") == "Class" for n in nodes)
    if has_classes and len(nodes) >= 2:
        suggestions.append(
            PatternSuggestion(
                pattern_name="Strategy",
                gof_category="Behavioral",
                confidence=0.85,
                description="Permite intercambiar algoritmos encapsulándolos en clases independientes detrás de una interfaz común.",
            )
        )

    summary = (
        f"Auditoría completada sobre {len(nodes)} nodo(s). "
        f"{len(violations)} advertencia(s) detectada(s)."
    )

    return AuditResponse(
        violations=violations,
        suggestions=suggestions,
        summary=summary,
    )


@app.post("/api/audit/productivity", response_model=ProductivityAuditResponse)
@app.post("/audit/productivity", response_model=ProductivityAuditResponse)
async def audit_productivity(
    request: ProductivityAuditRequest,
) -> ProductivityAuditResponse:
    """
    Evaluates collaboration telemetry, contention collisions and lock bottlenecks,
    providing heuristic diagnosis and GoF pattern recommendations to improve team dynamics.
    """
    bottlenecks = request.bottlenecks or []
    recommendations: List[str] = []
    pattern_suggestions: List[PatternSuggestion] = []

    high_contention_nodes = [
        b
        for b in bottlenecks
        if b.get("contentionCount", 0) > 0
        or b.get("averageLockDurationMs", 0) > 45000
    ]

    if not high_contention_nodes:
        diagnosis = (
            "Flujo de diseño óptimo. No se detectan disputas de contención "
            "crítica ni cuellos de botella."
        )
        recommendations.append(
            "Mantener el nivel actual de desacoplamiento modular entre clases."
        )
        status = request.fluency_status or "green"
    else:
        status = (
            "red"
            if any(b.get("contentionCount", 0) >= 3 for b in high_contention_nodes)
            else "yellow"
        )
        node_names = ", ".join(
            f"'{b.get('nodeName', b.get('nodeId'))}'" for b in high_contention_nodes
        )
        diagnosis = (
            f"Se detectó fricción colaborativa sobre {len(high_contention_nodes)} clase(s): {node_names}. "
            "La alta contención simultánea sugiere acumulación de responsabilidades o dependencia cruzada."
        )

        for b in high_contention_nodes:
            name = b.get("nodeName", b.get("nodeId"))
            recommendations.append(
                f"Desacoplar '{name}': extraer métodos auxiliares a clases colaboradoras para permitir edición paralela."
            )

        pattern_suggestions.append(
            PatternSuggestion(
                pattern_name="Facade",
                gof_category="Structural",
                confidence=0.90,
                description="Provee una interfaz unificada sobre un conjunto de interfaces en un subsistema, reduciendo la contención de edición directa.",
            )
        )
        pattern_suggestions.append(
            PatternSuggestion(
                pattern_name="Strategy",
                gof_category="Behavioral",
                confidence=0.85,
                description="Encapsula familias de algoritmos intercambiables para que colaboradores trabajen en estrategias aisladas sin bloquear la clase de contexto.",
            )
        )

    return ProductivityAuditResponse(
        diagnosis=diagnosis,
        recommendations=recommendations,
        pattern_suggestions=pattern_suggestions,
        fluency_status=status,
    )


VISION_PROVIDER_TIMEOUT_S = 10.0


def _vision_error(
    status_code: int, message: str, hint: str, extra: Optional[Dict[str, Any]] = None
) -> None:
    detail: Dict[str, Any] = {"message": message, "hint": hint}
    if extra:
        detail.update(extra)
    raise HTTPException(status_code=status_code, detail=detail)


@app.post("/api/vision")
async def extract_vision(image: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Vision import endpoint:
    Diagram photo (JPG/PNG/WebP) -> provider extraction -> validated UMLModel
    plus per-element confidence for preview-with-confirmation.
    """
    filename = image.filename or "upload"
    mime = (image.content_type or "").split(";")[0].strip().lower()
    ext = f".{filename.rsplit('.', 1)[-1].lower()}" if "." in filename else ""

    if mime not in VISION_ACCEPTED_MIME and ext not in VISION_ACCEPTED_EXTENSIONS:
        _vision_error(
            422,
            f"Unsupported image format '{mime or ext or 'unknown'}'.",
            "Use JPG, PNG, or WebP with a minimum resolution of 640x480.",
            {"accepted": list(VISION_ACCEPTED_MIME)},
        )

    payload = await image.read()
    if len(payload) > VISION_MAX_BYTES:
        _vision_error(
            413,
            f"Image is {len(payload) / 1048576:.1f}MB; the limit is 10MB.",
            "Compress or resize the photo below 10MB and try again.",
            {"max_bytes": VISION_MAX_BYTES},
        )

    dimensions = detect_dimensions(payload)
    if dimensions is None:
        _vision_error(
            422,
            "The image content could not be decoded as JPG, PNG, or WebP.",
            "Use JPG, PNG, or WebP with a minimum resolution of 640x480.",
        )
    width, height = dimensions
    if width < VISION_MIN_WIDTH or height < VISION_MIN_HEIGHT:
        _vision_error(
            422,
            f"Image is {width}x{height}; the minimum is 640x480.",
            "Retake or upscale the photo to at least 640x480 and try again.",
            {"min_width": VISION_MIN_WIDTH, "min_height": VISION_MIN_HEIGHT},
        )

    provider_name = os.getenv("AI_PROVIDER", "stub")
    try:
        provider = get_vision_provider(provider_name)
    except ValueError as val_err:
        _vision_error(422, str(val_err), "Set AI_PROVIDER=stub in this slice.")

    try:
        result = await asyncio.wait_for(
            provider.extract(payload, mime or "image/png"),
            timeout=VISION_PROVIDER_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        _vision_error(
            504,
            "Vision provider timed out after 10s.",
            "Retry in a few seconds; the request is safe to repeat.",
        )

    errors, offending_ids = validate_vision_model(result.model)
    if errors:
        _vision_error(
            422,
            "Extracted model failed validation.",
            "UmlStudio only supports UML Class Diagrams (OMG UML 2.5).",
            {"errors": errors, "offending_ids": offending_ids},
        )

    return {"model": result.model, "confidence": result.confidence}
