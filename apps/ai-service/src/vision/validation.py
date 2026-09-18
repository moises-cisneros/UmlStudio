"""
UmlStudio AI Service — Vision validation gate (CU-04, Ciclo 2).

Enforces the POST /api/vision contract without new runtime dependencies:
image dimension sniffing (PNG/JPEG/WebP via stdlib struct), a structural gate
mirroring uml-model-4.schema.json, and the class-only domain guard (OMG UML
2.5: nodes class/package, the 7 class relationships). Violations map to 422
responses listing the offending element ids.
"""

import re
import struct
from typing import Dict, List, Optional, Tuple

VISION_MAX_BYTES = 10 * 1024 * 1024
VISION_MIN_WIDTH = 640
VISION_MIN_HEIGHT = 480

VISION_ACCEPTED_MIME = ("image/jpeg", "image/png", "image/webp")
VISION_ACCEPTED_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

ALLOWED_NODE_TYPES = ("class", "package")
ALLOWED_EDGE_TYPES = (
    "ClassAggregation",
    "ClassBidirectional",
    "ClassComposition",
    "ClassDependency",
    "ClassInheritance",
    "ClassRealization",
    "ClassUnidirectional",
)

_VERSION_PATTERN = re.compile(r"^4\.\d+\.\d+$")

_NODE_REQUIRED = ("data", "height", "id", "measured", "position", "type", "width")
_EDGE_REQUIRED = ("data", "id", "source", "sourceHandle", "target", "targetHandle", "type")


def detect_dimensions(payload: bytes) -> Optional[Tuple[int, int]]:
    """Return (width, height) for PNG/JPEG/WebP bytes, else None."""
    if len(payload) < 12:
        return None
    if payload[:8] == b"\x89PNG\r\n\x1a\n":
        if len(payload) < 24:
            return None
        width, height = struct.unpack(">II", payload[16:24])
        return (width, height)
    if payload[:2] == b"\xff\xd8":
        return _jpeg_dimensions(payload)
    if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return _webp_dimensions(payload)
    return None


def _jpeg_dimensions(payload: bytes) -> Optional[Tuple[int, int]]:
    offset = 2
    size = len(payload)
    while offset + 4 <= size:
        if payload[offset] != 0xFF:
            return None
        marker = payload[offset + 1]
        if marker in (0xD8, 0xD9):
            offset += 2
            continue
        if 0xD0 <= marker <= 0xD7 or marker == 0x01:
            offset += 2
            continue
        length = struct.unpack(">H", payload[offset + 2 : offset + 4])[0]
        if length < 2 or offset + 2 + length > size:
            return None
        # SOF markers (except DHT/DAC/DNL): dimensions live here.
        if marker in (
            0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
        ):
            height, width = struct.unpack(">HH", payload[offset + 5 : offset + 9])
            return (width, height)
        offset += 2 + length
    return None


def _webp_dimensions(payload: bytes) -> Optional[Tuple[int, int]]:
    if len(payload) < 30:
        return None
    chunk = payload[12:16]
    if chunk == b"VP8 " and len(payload) >= 27:
        # Lossy frame: 3-byte start code, then width/height (low 14 bits each).
        width = struct.unpack("<H", payload[23:25])[0] & 0x3FFF
        height = struct.unpack("<H", payload[25:27])[0] & 0x3FFF
        return (width, height)
    if chunk == b"VP8L" and len(payload) >= 25:
        bits = struct.unpack("<I", payload[21:25])[0]
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return (width, height)
    if chunk == b"VP8X" and len(payload) >= 27:
        width = struct.unpack("<I", payload[21:24] + b"\x00")[0] + 1
        height = struct.unpack("<I", payload[24:27] + b"\x00")[0] + 1
        return (width, height)
    return None


def validate_vision_model(model: object) -> Tuple[List[str], List[str]]:
    """
    Structural gate mirroring uml-model-4.schema.json plus the class-only
    domain guard. Returns (errors, offending_ids); empty errors means valid.
    """
    errors: List[str] = []
    offending_ids: List[str] = []

    if not isinstance(model, dict):
        return (["Extracted model must be an object."], [])

    for field in ("assessments", "edges", "id", "nodes", "title", "type", "version"):
        if field not in model:
            errors.append(f"Missing required field '{field}'.")
    if errors:
        return (errors, [])

    version = model.get("version")
    if not isinstance(version, str) or not _VERSION_PATTERN.match(version):
        errors.append("Field 'version' must match pattern '^4.\\d+.\\d+$'.")
    if model.get("type") != "ClassDiagram":
        errors.append("Field 'type' must be the constant 'ClassDiagram'.")

    nodes = model.get("nodes")
    edges = model.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        errors.append("Fields 'nodes' and 'edges' must be arrays.")
        return (errors, [])

    for node in nodes:
        if not isinstance(node, dict):
            errors.append("Every node must be an object.")
            continue
        node_id = node.get("id", "<unknown>")
        for field in _NODE_REQUIRED:
            if field not in node:
                errors.append(f"Node '{node_id}' is missing required field '{field}'.")
        node_type = node.get("type")
        if node_type not in ALLOWED_NODE_TYPES:
            errors.append(f"Node '{node_id}' has forbidden type '{node_type}'.")
            if isinstance(node_id, str):
                offending_ids.append(node_id)

    for edge in edges:
        if not isinstance(edge, dict):
            errors.append("Every edge must be an object.")
            continue
        edge_id = edge.get("id", "<unknown>")
        for field in _EDGE_REQUIRED:
            if field not in edge:
                errors.append(f"Edge '{edge_id}' is missing required field '{field}'.")
        edge_type = edge.get("type")
        if edge_type not in ALLOWED_EDGE_TYPES:
            errors.append(f"Edge '{edge_id}' has forbidden type '{edge_type}'.")
            if isinstance(edge_id, str):
                offending_ids.append(edge_id)
        data = edge.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("points"), list):
            errors.append(f"Edge '{edge_id}' must carry data.points.")

    return (errors, offending_ids)


def summarize_model(model: Dict) -> Dict[str, int]:
    """Lightweight counts for logging/telemetry (never persisted)."""
    nodes = model.get("nodes", [])
    edges = model.get("edges", [])
    return {
        "nodes": len(nodes) if isinstance(nodes, list) else 0,
        "edges": len(edges) if isinstance(edges, list) else 0,
    }
