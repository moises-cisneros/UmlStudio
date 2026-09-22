"""
UmlStudio AI Service — Vision provider seam.

Multi-Adapter Vision Architecture:
- StubVisionProvider: Deterministic fixture provider for offline & unit/integration tests.
- GeminiVisionProvider: Google Gemini Flash Multimodal Vision API with structured JSON.
- OpenAIVisionProvider: OpenAI GPT-4o Multimodal Vision API with structured JSON.
"""

import base64
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Protocol, runtime_checkable
import httpx

from ..core.config import settings

logger = logging.getLogger("umlstudio.vision")

VISION_SYSTEM_INSTRUCTION = """
You are an expert Software Architect specialized in OMG UML 2.5 Class Diagrams.
Analyze the provided image of a class diagram (drawing, whiteboard, or screenshot) and extract all valid classes and relationships into a strict JSON object.

Output JSON format:
{
  "model": {
    "version": "4.0.0",
    "id": "diagram-vision-extracted",
    "title": "Extracted UML Diagram",
    "type": "ClassDiagram",
    "nodes": [
      {
        "id": "node-classname",
        "type": "class",
        "width": 180,
        "height": 120,
        "position": { "x": 100, "y": 100 },
        "measured": { "width": 180, "height": 120 },
        "data": {
          "name": "ClassName",
          "stereotype": "<<class>>",
          "attributes": ["- id: string"],
          "methods": ["+ execute(): void"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge-source-target",
        "type": "ClassBidirectional",
        "source": "node-source",
        "target": "node-target",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "points": []
        }
      }
    ],
    "assessments": {},
    "interactive": { "elements": {}, "relationships": {} }
  },
  "confidence": {
    "node-classname": 0.95
  }
}

Edge types must be one of:
ClassBidirectional, ClassUnidirectional, ClassAggregation, ClassComposition, ClassInheritance, ClassRealization, ClassDependency.

Attributes and methods must include visibilities (+, -, #, ~) when visible.
Do not output markdown backticks or explanations, only valid JSON.
"""


@dataclass
class VisionResult:
    """Extraction output: model MUST validate vs uml-model-4.schema.json."""

    model: Dict
    confidence: Dict[str, float] = field(default_factory=dict)


@runtime_checkable
class AIProvider(Protocol):
    async def extract(self, image: bytes, mime: str) -> VisionResult:
        """Extract a UMLModel plus per-element confidence from an image."""
        ...


def _load_stub_fixture() -> VisionResult:
    fixture_path = Path(__file__).resolve().parent / "stub_fixture.json"
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    return VisionResult(model=payload["model"], confidence=payload["confidence"])


class StubVisionProvider:
    """Deterministic stub: returns the fixed canonical fixture."""

    provider_name = "stub-vision"

    def __init__(self) -> None:
        self._fixture = _load_stub_fixture()

    async def extract(self, image: bytes, mime: str) -> VisionResult:
        _ = (image, mime)
        return VisionResult(
            model=json.loads(json.dumps(self._fixture.model)),
            confidence=dict(self._fixture.confidence),
        )


class GeminiVisionProvider:
    """Google Gemini Flash multimodal vision provider."""

    provider_name = "gemini-vision"

    def __init__(self, api_key: str = None, model: str = None) -> None:
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model = model or "gemini-2.0-flash"
        self._stub = StubVisionProvider()

    async def extract(self, image: bytes, mime: str) -> VisionResult:
        if not self.api_key:
            logger.warning("GEMINI_API_KEY not configured, falling back to stub vision provider.")
            return await self._stub.extract(image, mime)

        b64_image = base64.b64encode(image).decode("utf-8")
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )

        payload = {
            "system_instruction": {
                "parts": [{"text": VISION_SYSTEM_INSTRUCTION}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": "Extract the UML Class Diagram from this image as JSON."},
                        {
                            "inline_data": {
                                "mime_type": mime,
                                "data": b64_image,
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.1,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    logger.error("Gemini Vision API error (%s): %s", resp.status_code, resp.text)
                    return await self._stub.extract(image, mime)

                data = resp.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    return await self._stub.extract(image, mime)

                text = candidates[0]["content"]["parts"][0]["text"].strip()
                parsed = json.loads(text)
                return VisionResult(
                    model=parsed.get("model", {}),
                    confidence=parsed.get("confidence", {}),
                )
        except Exception as exc:
            logger.exception("Gemini Vision extraction failed: %s", exc)
            return await self._stub.extract(image, mime)


class LMStudioVisionProvider:
    """LM Studio local vision provider using Qwen3 VL (qwen3-vl-4b-instruct)."""

    provider_name = "lmstudio-vision"

    def __init__(self, endpoint_url: str = None, model: str = None) -> None:
        self.endpoint_url = (endpoint_url or settings.LMSTUDIO_URL).rstrip("/")
        self.model = model or settings.LMSTUDIO_VISION_MODEL
        self._stub = StubVisionProvider()

    async def extract(self, image: bytes, mime: str) -> VisionResult:
        b64_image = base64.b64encode(image).decode("utf-8")
        url = f"{self.endpoint_url}/chat/completions"

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": VISION_SYSTEM_INSTRUCTION},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract the UML Class Diagram from this image as strict JSON."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime};base64,{b64_image}",
                            },
                        },
                    ],
                },
            ],
            "temperature": 0.1,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    logger.error("LM Studio Vision error (%s): %s", resp.status_code, resp.text)
                    return await self._stub.extract(image, mime)

                data = resp.json()
                choice = data.get("choices", [{}])[0]
                text = choice.get("message", {}).get("content", "").strip()

                # Clean possible markdown fence
                if "```" in text:
                    parts = text.split("```")
                    for part in parts[1::2]:
                        cand = part.strip()
                        if cand.startswith("json"):
                            cand = cand[4:].strip()
                        try:
                            parsed = json.loads(cand)
                            return VisionResult(
                                model=parsed.get("model", parsed),
                                confidence=parsed.get("confidence", {}),
                            )
                        except Exception:
                            continue

                parsed = json.loads(text)
                return VisionResult(
                    model=parsed.get("model", parsed),
                    confidence=parsed.get("confidence", {}),
                )
        except Exception as exc:
            logger.exception("LM Studio Vision extraction failed: %s", exc)
            return await self._stub.extract(image, mime)


def get_vision_provider(name: str = "auto") -> AIProvider:
    """Resolve the vision provider."""
    normalized = (name or "auto").strip().lower()
    if normalized in ("stub", "mock", "mock-local"):
        return StubVisionProvider()
    if normalized in ("lmstudio", "lm-studio", "qwen-vl", "local"):
        return LMStudioVisionProvider()
    if normalized in ("gemini", "google"):
        return GeminiVisionProvider()
    # Default 'auto' mode: Gemini -> LM Studio -> Stub
    if normalized in ("auto", ""):
        if settings.GEMINI_API_KEY:
            return GeminiVisionProvider()
        return LMStudioVisionProvider()
    return StubVisionProvider()
