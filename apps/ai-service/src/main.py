"""
UmlStudio AI Service — FastAPI REST Application (:8001).
Unified Multi-Adapter Architecture for OMG UML 2.5.
"""

import asyncio
import json
import logging
import os
import sys
import time
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Configure stdout logging so server logs are clearly visible in the console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("umlstudio.ai_service")
logger.setLevel(logging.INFO)

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

    if high_contention_nodes:
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
    else:
        # Check for structural model bottlenecks
        model = request.model or {}
        nodes = model.get("nodes", []) if isinstance(model, dict) else []
        edges = model.get("edges", []) if isinstance(model, dict) else []

        structural_bottlenecks = []
        if isinstance(nodes, list):
            for n in nodes:
                if not isinstance(n, dict):
                    continue
                name = n.get("name") or n.get("title") or n.get("id") or "Clase"
                methods = n.get("methods") or []
                attributes = n.get("attributes") or []
                node_id = n.get("id")

                connected_edges = 0
                if isinstance(edges, list) and node_id:
                    connected_edges = sum(
                        1
                        for e in edges
                        if isinstance(e, dict)
                        and (e.get("source") == node_id or e.get("target") == node_id)
                    )

                if len(methods) >= 6 or len(attributes) >= 6 or connected_edges >= 5:
                    structural_bottlenecks.append(
                        {
                            "name": name,
                            "methods_count": len(methods),
                            "attributes_count": len(attributes),
                            "edges_count": connected_edges,
                        }
                    )

        if structural_bottlenecks:
            is_critical = any(
                b["methods_count"] >= 9 or b["attributes_count"] >= 9
                for b in structural_bottlenecks
            )
            status = "red" if is_critical else "yellow"
            names = ", ".join(f"'{b['name']}'" for b in structural_bottlenecks)
            diagnosis = (
                f"Se detectaron cuellos de botella de diseño arquitectónico en {len(structural_bottlenecks)} clase(s): {names}. "
                "La concentración excesiva de responsabilidades o acoplamiento genera fricción y riesgo de regresiones."
            )
            for b in structural_bottlenecks:
                recommendations.append(
                    f"Desacoplar '{b['name']}': segmentar sus {b['methods_count']} métodos y {b['attributes_count']} atributos en clases colaboradoras especializadas."
                )

            pattern_suggestions.append(
                PatternSuggestion(
                    pattern_name="Facade",
                    gof_category="Structural",
                    confidence=0.92,
                    description="Oculta la complejidad de subsistemas y delega llamadas a clases más pequeñas para eliminar clases monolíticas (God Classes).",
                )
            )
            pattern_suggestions.append(
                PatternSuggestion(
                    pattern_name="Strategy",
                    gof_category="Behavioral",
                    confidence=0.88,
                    description="Aísla variaciones de comportamiento en algoritmos encapsulados para evitar clases masivas con condicionales múltiples.",
                )
            )
        else:
            status = request.fluency_status or "green"
            diagnosis = (
                "Flujo de diseño continuo y arquitectura equilibrada. No se detectan disputas de contención "
                "ni sobrecargas de responsabilidades en el modelo."
            )
            recommendations.append(
                "Mantener la modularidad, alta cohesión y bajo acoplamiento observados en las clases del diagrama."
            )
            pattern_suggestions.append(
                PatternSuggestion(
                    pattern_name="Factory Method",
                    gof_category="Creational",
                    confidence=0.85,
                    description="Delega la instanciación de clases derivadas a métodos especializados, preservando el bajo acoplamiento del modelo.",
                )
            )

    return ProductivityAuditResponse(
        diagnosis=diagnosis,
        recommendations=recommendations,
        pattern_suggestions=pattern_suggestions,
        fluency_status=status,
    )


VISION_PROVIDER_TIMEOUT_S = 90.0


def _vision_error(
    status_code: int, message: str, hint: str, extra: Optional[Dict[str, Any]] = None
) -> None:
    detail: Dict[str, Any] = {"message": message, "hint": hint}
    if extra:
        detail.update(extra)
    logger.warning("[Vision Error] HTTP %s: %s (hint: %s)", status_code, message, hint)
    raise HTTPException(status_code=status_code, detail=detail)


@app.post("/api/vision")
async def extract_vision(image: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Vision import endpoint:
    Diagram photo (JPG/PNG/WebP) -> provider extraction -> validated UMLModel
    plus per-element confidence for preview-with-confirmation.
    """
    t0 = time.time()
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
    logger.info(
        "[Vision] Received diagram photo '%s': mime=%s, %d bytes, %dx%d px",
        filename, mime, len(payload), width, height
    )

    if (width < VISION_MIN_WIDTH and height < VISION_MIN_HEIGHT) or (max(width, height) < 480 or min(width, height) < 200):
        _vision_error(
            422,
            f"Image is {width}x{height}; the minimum is 640x480.",
            "Retake or upscale the photo to at least 640x480 and try again.",
            {"min_width": VISION_MIN_WIDTH, "min_height": VISION_MIN_HEIGHT},
        )

    provider_name = os.getenv("AI_PROVIDER", settings.DEFAULT_PROVIDER or "auto")
    try:
        provider = get_vision_provider(provider_name)
    except ValueError as val_err:
        _vision_error(422, str(val_err), "Set AI_PROVIDER=stub in this slice.")

    logger.info("[Vision] Calling vision provider chain (primary: %s)...", provider_name)
    try:
        result = await asyncio.wait_for(
            provider.extract(payload, mime or "image/png"),
            timeout=VISION_PROVIDER_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        _vision_error(
            504,
            f"Vision provider timed out after {int(VISION_PROVIDER_TIMEOUT_S)}s.",
            "Retry in a few seconds; the request is safe to repeat.",
        )
    except Exception as exc:
        _vision_error(
            502,
            f"Fallo en extracción de visión: {str(exc)}",
            "Verifica la conexión a los proveedores de IA o la legibilidad de la imagen.",
        )

    errors, offending_ids = validate_vision_model(result.model)
    if errors:
        _vision_error(
            422,
            "Extracted model failed validation.",
            "UmlStudio only supports UML Class Diagrams (OMG UML 2.5).",
            {"errors": errors, "offending_ids": offending_ids},
        )

    elapsed = time.time() - t0
    num_nodes = len(result.model.get("nodes", []))
    num_edges = len(result.model.get("edges", []))
    logger.info(
        "[Vision] Extraction successful in %.2fs: %d classes, %d relationships",
        elapsed, num_nodes, num_edges
    )

    return {"model": result.model, "confidence": result.confidence}


@app.post("/api/audit/productivity", response_model=ProductivityAuditResponse)
async def audit_productivity(
    request: ProductivityAuditRequest,
) -> ProductivityAuditResponse:
    """Audit productivity and bottlenecks for UML modeling dynamics (CU-10).

    Analyzes bottlenecks if present and provides decoupling recommendations.
    If no bottlenecks are detected, no recommendations or GoF patterns are suggested.

    Args:
        request: Productivity audit request containing bottlenecks and metrics.

    Returns:
        ProductivityAuditResponse: Heuristic diagnosis and patterns if applicable.
    """
    if not request.bottlenecks:
        return ProductivityAuditResponse(
            diagnosis="No se detectaron cuellos de botella en el sistema.",
            recommendations=[],
            pattern_suggestions=[],
            fluency_status=request.fluency_status or "green",
        )

    recommendations: List[str] = []
    for b in request.bottlenecks:
        node_name = b.get("nodeName") or b.get("nodeId", "Nodo")
        contention = b.get("contentionCount", 0)
        avg_lock = round(b.get("averageLockDurationMs", 0) / 1000)

        if contention > 0:
            recommendations.append(
                f"Resolver contención en '{node_name}' ({contention} colisiones): "
                "desacoplar métodos concurrentes mediante eventos o mediadores."
            )
        else:
            recommendations.append(
                f"Optimizar retención en '{node_name}' (bloqueo medio de {avg_lock}s): "
                "particionar la clase para permitir edición concurrente."
            )

    pattern_suggestions: List[PatternSuggestion] = [
        PatternSuggestion(
            pattern_name="Mediator",
            gof_category="Behavioral",
            confidence=0.92,
            description=(
                "Centraliza las interacciones complejas para desacoplar clases con "
                "alta contención de bloqueos."
            ),
        ),
        PatternSuggestion(
            pattern_name="Observer",
            gof_category="Behavioral",
            confidence=0.88,
            description=(
                "Permite suscripción reactiva a cambios sin bloquear la entidad "
                "principal en ediciones simultáneas."
            ),
        ),
    ]

    diagnosis = (
        f"Se detectaron {len(request.bottlenecks)} cuellos de botella activos en el "
        "diagrama. Se recomienda refactorizar los nodos congestionados."
    )

    return ProductivityAuditResponse(
        diagnosis=diagnosis,
        recommendations=recommendations,
        pattern_suggestions=pattern_suggestions,
        fluency_status=request.fluency_status or "yellow",
    )

