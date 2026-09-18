"""
UmlStudio AI Service — Vision provider seam (CU-04, Ciclo 2).

The provider stays interchangeable behind the AIProvider protocol. This slice
ships StubVisionProvider (fixed schema-valid fixture); a real Vision backend
(Gemini/OpenAI) is swapped later via AI_PROVIDER / AI_API_KEY with no contract
change, per the ai-integration skill.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Protocol, runtime_checkable


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


def get_vision_provider(name: str = "stub") -> AIProvider:
    """Resolve the vision provider. Only the stub exists in this slice."""
    normalized = (name or "stub").strip().lower()
    if normalized in ("stub", "mock", "mock-local"):
        return StubVisionProvider()
    raise ValueError(
        f"Unknown vision provider '{name}'. Available in this slice: 'stub'."
    )
