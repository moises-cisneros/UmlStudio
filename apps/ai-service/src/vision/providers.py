"""
UmlStudio AI Service — Vision provider seam.

Multi-Adapter Vision Architecture:
- StubVisionProvider: Deterministic fixture provider for offline & unit/integration tests.
- CloudflareVisionProvider: Cloudflare Workers AI multimodal LLaMA 3.2 Vision + Meta license negotiation.
- OpenRouterVisionProvider: OpenRouter free multimodal pool (Gemini Flash, LLaMA 3.2 Vision).
- GeminiVisionProvider: Google Gemini Flash Multimodal Vision API.
- LMStudioVisionProvider: Local Qwen3-VL in LM Studio (:1234).
- ChainedVisionProvider: Automatic fallback chain.
"""

import ast
import base64
import io
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, Tuple, runtime_checkable
import httpx
from PIL import Image

from ..core.config import settings
from ..core.uml_text import normalize_multiplicity

logger = logging.getLogger("umlstudio.vision")
logger.setLevel(logging.INFO)


def _optimize_image_for_vision(image_bytes: bytes, max_dim: int = 1200) -> Tuple[bytes, str]:
    """
    Downscale and optimize large images for faster, reliable vision processing.
    Preserves aspect ratio, reduces payload size while keeping UML diagram text crisp.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            w, h = img.size
            if max(w, h) <= max_dim:
                return image_bytes, img.format or "PNG"
            scale = max_dim / max(w, h)
            new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
            resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            out_buf = io.BytesIO()
            if img.format == "PNG" or img.mode in ("RGBA", "P"):
                resized.save(out_buf, format="PNG", optimize=True)
                return out_buf.getvalue(), "PNG"
            resized.convert("RGB").save(out_buf, format="JPEG", quality=85, optimize=True)
            return out_buf.getvalue(), "JPEG"
    except Exception as exc:
        logger.warning("[Vision] Image optimization skipped: %s", exc)
        return image_bytes, "PNG"


VALID_EDGE_TYPES = {
    "ClassBidirectional",
    "ClassUnidirectional",
    "ClassAggregation",
    "ClassComposition",
    "ClassInheritance",
    "ClassRealization",
    "ClassDependency",
}

VISION_SYSTEM_INSTRUCTION = """
You are an expert Software Architect specialized in OMG UML 2.5 Class Diagrams.
Analyze the provided image of a UML class diagram with extreme attention to detail.
Extract ALL classes, attributes, methods, visibilities, and relationships into a strict JSON object.

Output JSON format:
{
  "model": {
    "version": "4.0.0",
    "id": "diagram-vision-extracted",
    "title": "Extracted UML Diagram",
    "type": "ClassDiagram",
    "nodes": [
      {
        "id": "node-classa",
        "type": "class",
        "width": 180,
        "height": 120,
        "position": { "x": 100, "y": 100 },
        "measured": { "width": 180, "height": 120 },
        "data": {
          "name": "Class A",
          "attributes": [
            { "id": "attr-node-classa-1", "name": "- id: string" },
            { "id": "attr-node-classa-2", "name": "+ attribute0: int" }
          ],
          "methods": [
            { "id": "meth-node-classa-1", "name": "+ Operation(): void" }
          ]
        }
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "type": "ClassBidirectional",
        "source": "node-classa",
        "target": "node-classb",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "label": "asocia",
          "sourceMultiplicity": "*",
          "targetMultiplicity": "*",
          "sourceRole": "role a",
          "targetRole": "role b",
          "associationClassNodeId": null,
          "points": []
        }
      }
    ],
    "assessments": {},
    "interactive": { "elements": {}, "relationships": {} }
  },
  "confidence": {
    "node-classa": 0.95
  }
}

CRITICAL RULES:
1. STEREOTYPE: Do NOT write '<<class>>' for regular classes. In UML 2.5, standard classes do not need any stereotype. Only use stereotypes if explicitly written in the box (e.g. '<<interface>>' or '<<enumeration>>').
2. UNIQUE NODE IDS: Every node MUST have a unique ID derived from its own name (e.g. 'node-classa', 'node-classb', 'node-classc', 'node-classd', 'node-classe', 'node-classf'). NEVER assign the same ID to multiple nodes!
3. ROLES VS ATTRIBUTES: Texts floating outside boxes near the ends of relationship lines (such as 'role a', 'role b', '1', '*', '0..1', '0..*') are RELATIONSHIP ROLES and MULTIPLICITIES belonging to edges. DO NOT put them inside class 'attributes'!
4. EXHAUSTIVE RELATIONSHIP SCANNING: Inspect EVERY line and every pair of classes systematically. Do not stop at 2 or 3 lines if there are more:
   - ClassInheritance: Solid line ending in a HOLLOW/WHITE CLOSED TRIANGLE pointing to the superclass (Generalization/Inheritance).
   - ClassComposition: Solid line with a FILLED/SOLID BLACK DIAMOND attached to the whole/composite class.
   - ClassAggregation: Solid line with a HOLLOW/WHITE UNFILLED DIAMOND attached to the whole/composite class.
   - ClassRealization: DASHED/DOTTED line ending in a HOLLOW/WHITE CLOSED TRIANGLE pointing to an interface/target (Implementation).
   - ClassDependency: DASHED/DOTTED line ending in an OPEN ARROW (-->) pointing to the target.
   - ClassUnidirectional: Solid line ending in an OPEN ARROW (-->) without any diamonds.
   - ClassBidirectional: Plain solid line with NO arrows and NO diamonds on either end.
5. NO SELF-LOOPS: Never create an edge where source equals target unless it is genuinely a reflexive line looping back to the same class.
6. Layout: Position nodes logically in a grid matching their visual layout in the image (e.g. top row: Class A, Class B, Class E; bottom row: Class C, Class D, Class F).
7. EDGE DIRECTION: "source" and "target" follow UML semantics, not reading order:
   - ClassInheritance: source = the subclass (the end WITHOUT the triangle), target = the superclass (the triangle end).
   - ClassRealization: source = the implementing class, target = the interface (the triangle end).
   - ClassComposition / ClassAggregation: source = the whole (the diamond end), target = the part.
   - ClassDependency / ClassUnidirectional: source = the end without the arrowhead, target = the arrowhead end.
   - ClassBidirectional: any order. Multiplicity and role text printed near one end belongs to that end: sourceMultiplicity/sourceRole near the source class, targetMultiplicity/targetRole near the target class. Multiplicities use UML notation: "1", "0..1", "1..*", "0..*", "*".
8. HAND-DRAWN AND PHOTOGRAPHED DIAGRAMS: the image may be hand-drawn on paper or a whiteboard, a phone photo (skewed, shadows, glare), or a screenshot from tools such as draw.io, StarUML, PlantUML or Visual Paradigm. Tolerate wobbly lines and rotated text. If a character is hard to read, give your best reading instead of dropping the member.
9. LANGUAGE: names and notation may be in Spanish or English (herencia, composición, agregación, realización, dependencia). Keep every class, attribute and method name exactly as written; do not translate or "fix" them.
10. ABSTRACT AND STATIC: an ITALIC class name or the tag {abstract} means stereotype "<<abstract>>"; an italic method is abstract ("isAbstract": true). An UNDERLINED member is static: keep its text unchanged. Only use "<<interface>>" or "<<enumeration>>" when the box says so (enum literals go in "attributes").
11. COMPLETENESS: first count the class boxes, then output exactly one node per box, including boxes that only show a name. Never invent classes or relationships that are not drawn and never merge two boxes. A box linked by a dashed line to the middle of an association line is an association class: set that association edge's "associationClassNodeId" to the box's node id.
12. SCOPE: only UML class diagram content belongs in the output. Ignore titles, legends, watermarks and comment notes. If the image is not a class diagram, return empty "nodes" and "edges" arrays.
13. Output ONLY the JSON object. Do not include markdown backticks or commentary.
"""


def _normalize_edge_type(raw_type: Any, edge_data: Optional[Dict[str, Any]] = None) -> str:
    """Normalize any natural language, abbreviated, or alternative UML edge type to canonical OMG UML 2.5 type."""
    if not raw_type:
        return "ClassBidirectional"
    clean = str(raw_type).strip().lower().replace("-", "_").replace(" ", "_")
    if clean in ("classbidirectional", "bidirectional", "association", "asociacion", "association_bidirectional", "plain"):
        return "ClassBidirectional"
    if clean in ("classunidirectional", "unidirectional", "directed_association", "asociacion_unidireccional", "directed", "arrow"):
        return "ClassUnidirectional"
    if clean in ("classinheritance", "inheritance", "herencia", "generalization", "generalizacion", "is_a", "extends", "subclass"):
        return "ClassInheritance"
    if clean in ("classcomposition", "composition", "composicion", "composite", "strong_aggregation"):
        return "ClassComposition"
    if clean in ("classaggregation", "aggregation", "agregacion", "shared_aggregation", "has_a"):
        return "ClassAggregation"
    if clean in ("classrealization", "realization", "realizacion", "implementation", "implementacion", "implements"):
        return "ClassRealization"
    if clean in ("classdependency", "dependency", "dependencia", "depends_on", "uses"):
        return "ClassDependency"

    # Exact case check
    if str(raw_type) in VALID_EDGE_TYPES:
        return str(raw_type)

    # Substring heuristic checks
    if "inherit" in clean or "general" in clean or "extend" in clean or "herenc" in clean:
        return "ClassInheritance"
    if "composit" in clean:
        return "ClassComposition"
    if "aggregat" in clean:
        return "ClassAggregation"
    if "realiz" in clean or "implement" in clean:
        return "ClassRealization"
    if "depend" in clean:
        return "ClassDependency"
    if "unidirect" in clean or "direct" in clean:
        return "ClassUnidirectional"

    return "ClassBidirectional"



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


_VISIBILITY_SYMBOLS = {
    "public": "+", "publico": "+", "público": "+", "+": "+",
    "private": "-", "privado": "-", "-": "-",
    "protected": "#", "protegido": "#", "#": "#",
    "package": "~", "paquete": "~", "~": "~",
}
_MEMBER_PREFIX = ("+", "-", "#", "~")
_ROLE_PLACEHOLDER_RE = re.compile(r"^[+\-#~]?\s*role[\s_]*[ab]$", re.IGNORECASE)
_MULTIPLICITY_TEXT_RE = re.compile(r"^[+\-#~]?\s*(\d+(\.\.(\d+|\*))?|\*)$")
_KNOWN_STEREOTYPES = {"interface", "abstract", "enumeration", "association", "datatype", "utility"}


def _visibility_symbol(raw: Any) -> str:
    return _VISIBILITY_SYMBOLS.get(str(raw or "").strip().lower(), "+")


def _format_attribute(raw: Any) -> str:
    """Accepts 'name', '- name: Type' or {name,type,visibility} and returns UML notation."""
    if isinstance(raw, dict):
        name = str(raw.get("name") or "").strip()
        if not name:
            return ""
        if name.startswith(_MEMBER_PREFIX) or ":" in name:
            return name if name.startswith(_MEMBER_PREFIX) else f"{_visibility_symbol(raw.get('visibility'))} {name}"
        vis = _visibility_symbol(raw.get("visibility"))
        attr_type = str(raw.get("type") or "").strip()
        return f"{vis} {name}: {attr_type}" if attr_type else f"{vis} {name}"
    return str(raw).strip()


def _format_method(raw: Any) -> str:
    """Accepts '+ run(): void' or {name,returnType,visibility,parameters} and returns UML notation."""
    if not isinstance(raw, dict):
        return str(raw).strip()
    name = str(raw.get("name") or "").strip()
    if not name:
        return ""
    vis = _visibility_symbol(raw.get("visibility"))
    if name.startswith(_MEMBER_PREFIX):
        return name
    if "(" in name:
        return f"{vis} {name}"
    params = raw.get("parameters") or raw.get("params") or []
    rendered = []
    for param in params if isinstance(params, list) else []:
        if isinstance(param, dict):
            p_name = str(param.get("name") or "arg")
            p_type = str(param.get("type") or "").strip()
            rendered.append(f"{p_name}: {p_type}" if p_type else p_name)
        else:
            rendered.append(str(param))
    ret = str(raw.get("returnType") or raw.get("return_type") or raw.get("type") or "void").strip()
    return f"{vis} {name}({', '.join(rendered)}): {ret}"


def _normalize_stereotype(raw: Any, is_abstract: bool = False) -> Optional[str]:
    text = str(raw or "").strip()
    text = text.strip("«»<>").strip()
    lowered = text.lower()
    if lowered in ("", "class", "none", "null"):
        return "<<abstract>>" if is_abstract else None
    if lowered == "enum":
        lowered = "enumeration"
    if lowered in _KNOWN_STEREOTYPES:
        return f"<<{lowered}>>"
    return f"<<{text}>>"


def _is_noise_member(name: str) -> bool:
    """Roles/multiplicities floating near edges that a model mistook for attributes."""
    stripped = name.strip()
    return bool(_ROLE_PLACEHOLDER_RE.match(stripped) or _MULTIPLICITY_TEXT_RE.match(stripped))


def _first_present(mapping: Dict[str, Any], keys: Tuple[str, ...]) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, "", []):
            return value
    return None


def _edge_end_value(edge: Dict[str, Any], edge_data: Dict[str, Any], keys: Tuple[str, ...]) -> Optional[str]:
    value = _first_present(edge_data, keys) or _first_present(edge, keys)
    return str(value).strip() if value not in (None, "") else None


def _normalize_uml_model(raw_data: Any) -> VisionResult:
    """Normalize extracted model dictionary or class list into strict uml-model-4 structure."""
    confidence: Dict[str, float] = {}
    if isinstance(raw_data, list):
        raw_nodes: List[Dict[str, Any]] = []
        raw_edges: List[Dict[str, Any]] = []
        class_name_to_id: Dict[str, str] = {}
        for idx, item in enumerate(raw_data):
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or f"Class{idx + 1}")
            node_id = str(item.get("id") or f"node-{name.lower()}")
            class_name_to_id[name] = node_id
            class_name_to_id[name.lower()] = node_id
            raw_nodes.append({
                "id": node_id,
                "name": name,
                "attributes": item.get("attributes") or [],
                "methods": item.get("methods") or [],
            })
        for idx, item in enumerate(raw_data):
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "")
            src_id = class_name_to_id.get(name) or f"node-{name.lower()}"
            assocs = item.get("associations") or item.get("relationships") or {}
            if isinstance(assocs, dict):
                for assoc_name, assoc_data in assocs.items():
                    if isinstance(assoc_data, dict):
                        tgt_name = str(assoc_data.get("target") or assoc_data.get("to") or "")
                        tgt_id = class_name_to_id.get(tgt_name) or (f"node-{tgt_name.lower()}" if tgt_name else None)
                        if tgt_id and tgt_id != src_id:
                            raw_edges.append({
                                "id": f"edge-{src_id}-{tgt_id}",
                                "type": "ClassBidirectional",
                                "source": src_id,
                                "target": tgt_id,
                                "label": assoc_name if assoc_name != f"{name}_{tgt_name}_Assoc" else None,
                            })
            elif isinstance(assocs, list):
                for assoc_item in assocs:
                    if isinstance(assoc_item, dict):
                        tgt_name = str(assoc_item.get("target") or assoc_item.get("to") or "")
                        tgt_id = class_name_to_id.get(tgt_name) or (f"node-{tgt_name.lower()}" if tgt_name else None)
                        if tgt_id and tgt_id != src_id:
                            raw_edges.append({
                                "id": f"edge-{src_id}-{tgt_id}",
                                "type": assoc_item.get("type") or "ClassBidirectional",
                                "source": src_id,
                                "target": tgt_id,
                                "label": assoc_item.get("label"),
                                "sourceMultiplicity": assoc_item.get("sourceMultiplicity"),
                                "targetMultiplicity": assoc_item.get("targetMultiplicity"),
                            })
        model = {"nodes": raw_nodes, "edges": raw_edges}
    elif isinstance(raw_data, dict):
        model = raw_data.get("model", raw_data)
        if not isinstance(model, dict):
            model = {}
        supplied_confidence = raw_data.get("confidence", {})
        confidence = dict(supplied_confidence) if isinstance(supplied_confidence, dict) else {}
        raw_nodes = _first_present(model, ("nodes", "classes", "elements")) or []
        raw_edges = _first_present(
            model, ("edges", "relationships", "relations", "connections", "links", "associations")
        ) or []
    else:
        return VisionResult(model={"version": "4.0.0", "id": "diagram-empty", "title": "Empty", "type": "ClassDiagram", "nodes": [], "edges": []})

    normalized_nodes: List[Dict[str, Any]] = []
    nodes_by_name: Dict[str, Dict[str, Any]] = {}
    class_name_to_id: Dict[str, str] = {}
    used_node_ids = set()

    def register_alias(alias: Any, node_id: str) -> None:
        text = str(alias or "").strip()
        if not text:
            return
        class_name_to_id.setdefault(text, node_id)
        class_name_to_id.setdefault(text.lower(), node_id)

    for i, node in enumerate(raw_nodes):
        if not isinstance(node, dict):
            continue
        data = node.get("data", {})
        if not isinstance(data, dict):
            data = {}
        name = str(data.get("name") or node.get("name") or f"Class{i + 1}").strip()
        clean_name_id = f"node-{name.lower().replace(' ', '')}"
        raw_id = str(node.get("id") or clean_name_id)

        attributes = data.get("attributes") or node.get("attributes") or []
        if not isinstance(attributes, list):
            attributes = [attributes]
        methods = data.get("methods") or node.get("methods") or []
        if not isinstance(methods, list):
            methods = [methods]

        member_attrs: List[str] = []
        for a in attributes:
            attr_name = _format_attribute(a)
            if attr_name and not _is_noise_member(attr_name):
                member_attrs.append(attr_name)

        member_methods: List[Tuple[str, bool]] = []
        for m in methods:
            meth_name = _format_method(m)
            if meth_name:
                member_methods.append((meth_name, bool(m.get("isAbstract", False)) if isinstance(m, dict) else False))

        # Same class drawn/extracted twice (case-insensitive): merge members instead of duplicating the box
        existing = nodes_by_name.get(name.lower())
        if existing is not None:
            existing_attr_names = {a["name"] for a in existing["data"]["attributes"]}
            for attr_name in member_attrs:
                if attr_name not in existing_attr_names:
                    existing["data"]["attributes"].append(
                        {"id": f"attr-{existing['id']}-{len(existing['data']['attributes']) + 1}", "name": attr_name}
                    )
                    existing_attr_names.add(attr_name)
            existing_meth_names = {m["name"] for m in existing["data"]["methods"]}
            for meth_name, is_abs in member_methods:
                if meth_name not in existing_meth_names:
                    item: Dict[str, Any] = {
                        "id": f"meth-{existing['id']}-{len(existing['data']['methods']) + 1}",
                        "name": meth_name,
                    }
                    if is_abs:
                        item["isAbstract"] = True
                    existing["data"]["methods"].append(item)
                    existing_meth_names.add(meth_name)
            register_alias(raw_id, existing["id"])
            register_alias(clean_name_id, existing["id"])
            continue

        # Models sometimes repeat ids across different classes: keep ids globally unique
        if raw_id in used_node_ids:
            node_id = clean_name_id
            suffix = 2
            while node_id in used_node_ids:
                node_id = f"{clean_name_id}-{suffix}"
                suffix += 1
        else:
            node_id = raw_id
        used_node_ids.add(node_id)

        grid_index = len(normalized_nodes)
        default_x = 80 + (grid_index % 3) * 280
        default_y = 100 + (grid_index // 3) * 220
        pos = node.get("position", {})
        pos_x = float(pos.get("x", default_x)) if isinstance(pos, dict) else default_x
        pos_y = float(pos.get("y", default_y)) if isinstance(pos, dict) else default_y

        is_abstract = bool(data.get("isAbstract") or node.get("isAbstract"))
        stereotype = _normalize_stereotype(data.get("stereotype") or node.get("stereotype"), is_abstract)

        normalized_attrs = [
            {"id": f"attr-{node_id}-{k + 1}", "name": attr_name} for k, attr_name in enumerate(member_attrs)
        ]
        normalized_methods = []
        for k, (meth_name, is_abs) in enumerate(member_methods):
            meth_item: Dict[str, Any] = {"id": f"meth-{node_id}-{k + 1}", "name": meth_name}
            if is_abs:
                meth_item["isAbstract"] = True
            normalized_methods.append(meth_item)

        width = float(node.get("width") or 180)
        # Compute height dynamically if default or too small to fit compartments
        raw_height = float(node.get("height") or 120)
        min_required_height = 50.0 + max(1, len(normalized_attrs)) * 22.0 + max(1, len(normalized_methods)) * 22.0
        height = max(raw_height, min_required_height)

        register_alias(name, node_id)
        register_alias(clean_name_id, node_id)
        register_alias(raw_id, node_id)
        class_name_to_id[node_id] = node_id

        node_data: Dict[str, Any] = {
            "name": name,
            "attributes": normalized_attrs,
            "methods": normalized_methods,
        }
        if stereotype:
            node_data["stereotype"] = stereotype

        normalized_node = {
            "id": node_id,
            "type": "class" if node.get("type") != "package" else "package",
            "width": width,
            "height": height,
            "position": {"x": pos_x, "y": pos_y},
            "measured": {"width": width, "height": height},
            "data": node_data,
        }
        normalized_nodes.append(normalized_node)
        nodes_by_name[name.lower()] = normalized_node
        if node_id not in confidence:
            # A box with no members is more likely a partial read than a rich one
            confidence[node_id] = 0.92 if (normalized_attrs or normalized_methods) else 0.65

    valid_node_ids = {n["id"] for n in normalized_nodes}

    def resolve(ref: str) -> Optional[str]:
        ref = (ref or "").strip()
        if not ref:
            return None
        resolved = class_name_to_id.get(ref) or class_name_to_id.get(ref.lower())
        if resolved is None and ref in valid_node_ids:
            resolved = ref
        return resolved

    normalized_edges: List[Dict[str, Any]] = []
    used_edge_ids = set()
    seen_edge_keys = set()
    for j, edge in enumerate(raw_edges):
        if not isinstance(edge, dict):
            continue
        edge_data = edge.get("data", {})
        if not isinstance(edge_data, dict):
            edge_data = {}

        raw_type = edge.get("type") or edge_data.get("type") or "ClassBidirectional"
        edge_type = _normalize_edge_type(raw_type, edge_data)

        raw_source = str(_first_present(edge, ("source", "from", "src", "origin")) or "")
        raw_target = str(_first_present(edge, ("target", "to", "dst", "destination")) or "")
        source = resolve(raw_source)
        target = resolve(raw_target)
        if not source or not target:
            logger.warning("[Vision] Dropping edge %r -> %r: endpoint does not match any extracted class", raw_source, raw_target)
            continue

        # Prevent hallucinated self-loops
        if source == target:
            continue

        edge_key = (edge_type, source, target)
        if edge_key in seen_edge_keys:
            continue
        seen_edge_keys.add(edge_key)

        edge_id = str(edge.get("id") or f"edge-{j + 1}")
        if edge_id in used_edge_ids:
            base_id, suffix = edge_id, 2
            while edge_id in used_edge_ids:
                edge_id = f"{base_id}-{suffix}"
                suffix += 1
        used_edge_ids.add(edge_id)

        label = _edge_end_value(edge, edge_data, ("label", "name", "verb"))
        src_mult = normalize_multiplicity(
            _edge_end_value(edge, edge_data, ("sourceMultiplicity", "source_multiplicity", "multiplicityA", "multiplicity_a"))
        )
        tgt_mult = normalize_multiplicity(
            _edge_end_value(edge, edge_data, ("targetMultiplicity", "target_multiplicity", "multiplicityB", "multiplicity_b"))
        )
        src_role = _edge_end_value(edge, edge_data, ("sourceRole", "source_role", "roleA", "role_a"))
        tgt_role = _edge_end_value(edge, edge_data, ("targetRole", "target_role", "roleB", "role_b"))
        raw_assoc_class = (
            edge_data.get("associationClassNodeId")
            or edge.get("associationClassNodeId")
            or edge_data.get("intermediateClass")
            or edge.get("intermediateClass")
            or edge_data.get("associationClass")
            or edge.get("associationClass")
            or None
        )
        assoc_class_id = resolve(str(raw_assoc_class)) or str(raw_assoc_class) if raw_assoc_class else None

        normalized_edges.append({
            "id": edge_id,
            "type": edge_type,
            "source": source,
            "target": target,
            "sourceHandle": str(edge.get("sourceHandle") or "right"),
            "targetHandle": str(edge.get("targetHandle") or "left"),
            "data": {
                "label": label,
                "sourceMultiplicity": src_mult,
                "targetMultiplicity": tgt_mult,
                "sourceRole": src_role,
                "targetRole": tgt_role,
                "associationClassNodeId": str(assoc_class_id) if assoc_class_id else None,
                "points": edge_data.get("points", []),
            },
        })
        if edge_id not in confidence:
            confidence[edge_id] = 0.88

    final_model = {
        "version": "4.0.0",
        "id": str(model.get("id") or "diagram-vision-extracted"),
        "title": str(model.get("title") or "Extracted UML Diagram"),
        "type": "ClassDiagram",
        "nodes": normalized_nodes,
        "edges": normalized_edges,
        "assessments": model.get("assessments", {}),
        "interactive": model.get("interactive", {"elements": {}, "relationships": {}}),
    }

    return VisionResult(model=final_model, confidence=confidence)


_TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")


def _closers_for(prefix: str) -> Optional[str]:
    """Closing brackets needed to balance `prefix`, or None if it ends inside a string."""
    stack: List[str] = []
    in_string = False
    escaped = False
    for ch in prefix:
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append(ch)
        elif ch in "}]" and stack:
            stack.pop()
    if in_string:
        return None
    return "".join("}" if opener == "{" else "]" for opener in reversed(stack))


def _repair_truncated_json(text: str) -> Optional[Any]:
    """Recovers the complete leading part of a JSON document cut off by a token limit."""
    starts = [i for i in (text.find("{"), text.find("[")) if i != -1]
    if not starts:
        return None
    body = text[min(starts):]
    boundaries = [i for i, ch in enumerate(body) if ch in "}]"]
    for index in reversed(boundaries[-300:]):
        prefix = body[: index + 1]
        closers = _closers_for(prefix)
        if closers is None:
            continue
        try:
            parsed = json.loads(_TRAILING_COMMA_RE.sub(r"\1", prefix + closers))
        except Exception:
            continue
        if isinstance(parsed, (dict, list)):
            return parsed
    return None


def _loads_lenient(text: str) -> Optional[Any]:
    """json.loads that also tolerates trailing commas and Python-style dict/list literals."""
    for candidate in (text, _TRAILING_COMMA_RE.sub(r"\1", text)):
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, (dict, list)):
            return parsed
    try:
        parsed = ast.literal_eval(_TRAILING_COMMA_RE.sub(r"\1", text))
    except Exception:
        return None
    return parsed if isinstance(parsed, (dict, list)) else None


def _parse_vision_json(content: Any) -> Optional[VisionResult]:
    """Parse vision result from dict, list, or raw string."""
    if not content:
        return None
    if isinstance(content, (dict, list)):
        return _normalize_uml_model(content)

    if not isinstance(content, str):
        return None

    cleaned = content.strip()
    candidates: List[str] = []

    # Markdown code fences (with or without a language tag)
    if "```" in cleaned:
        for part in cleaned.split("```")[1::2]:
            cand = part.strip()
            if cand.lower().startswith("json"):
                cand = cand[4:].strip()
            candidates.append(cand)
    candidates.append(cleaned)

    # Outermost braces/brackets, e.g. JSON surrounded by prose
    start_brace, end_brace = cleaned.find("{"), cleaned.rfind("}")
    start_bracket, end_bracket = cleaned.find("["), cleaned.rfind("]")
    if start_brace != -1 and end_brace > start_brace:
        candidates.append(cleaned[start_brace : end_brace + 1])
    if start_bracket != -1 and end_bracket > start_bracket:
        candidates.append(cleaned[start_bracket : end_bracket + 1])

    for cand in candidates:
        parsed = _loads_lenient(cand)
        if parsed is not None:
            return _normalize_uml_model(parsed)

    # Last resort: the answer was cut off by a token limit
    for cand in candidates:
        repaired = _repair_truncated_json(cand)
        if repaired is not None:
            logger.warning("[Vision] Recovered a truncated JSON response")
            return _normalize_uml_model(repaired)

    return None


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


class CloudflareVisionProvider:
    """Cloudflare Workers AI multimodal vision provider using @cf/meta/llama-3.2-11b-vision-instruct."""

    provider_name = "cloudflare-vision"

    def __init__(self, account_id: str = None, api_token: str = None, model: str = None) -> None:
        self.account_id = account_id or settings.CLOUDFLARE_ACCOUNT_ID
        self.api_token = api_token or settings.CLOUDFLARE_API_TOKEN
        self.model = model or "@cf/meta/llama-3.2-11b-vision-instruct"
        self.text_model = settings.CLOUDFLARE_MODEL or "@cf/meta/llama-3.1-8b-instruct"

    async def _accept_agreement(self, client: httpx.AsyncClient, url: str, headers: Dict[str, str]) -> bool:
        """Submit the required 'agree' prompt for Meta LLaMA Community License."""
        try:
            logger.info("[Cloudflare Vision] Submitting Meta license agreement ('agree')...")
            agree_resp = await client.post(url, headers=headers, json={"prompt": "agree"})
            if agree_resp.status_code in (200, 403) and "agree" in agree_resp.text.lower():
                logger.info("[Cloudflare Vision] License terms acknowledged.")
                return True
        except Exception as exc:
            logger.warning("[Cloudflare Vision] Agreement submission failed: %s", exc)
        return False

    async def _convert_text_to_schema(self, client: httpx.AsyncClient, headers: Dict[str, str], text: str) -> Optional[VisionResult]:
        """Convert natural language OCR extraction into strict UMLModel JSON using text LLM."""
        try:
            text_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.text_model}"
            payload = {
                "messages": [
                    {"role": "system", "content": VISION_SYSTEM_INSTRUCTION},
                    {
                        "role": "user",
                        "content": (
                            "Convert this extracted UML class diagram description into the strict JSON schema. "
                            "Extract all classes, intermediate/association classes (such as Producto_Venta_Assoc), "
                            f"attributes, methods, visibilities, and relationships:\n\n{text}"
                        ),
                    },
                ],
                "max_tokens": 3000,
            }
            logger.info("[Cloudflare Vision] Structuring natural language OCR into UML JSON via %s...", self.text_model)
            resp = await client.post(text_url, headers=headers, json=payload)
            if resp.status_code == 200:
                raw_result = resp.json().get("result", {})
                raw_response = ""
                if "choices" in raw_result and raw_result["choices"]:
                    raw_response = raw_result["choices"][0].get("message", {}).get("content", "")
                elif "response" in raw_result:
                    raw_response = raw_result.get("response") or ""
                return _parse_vision_json(raw_response)
            else:
                logger.warning("[Cloudflare Vision] Text-to-schema failed (HTTP %s): %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.warning("[Cloudflare Vision] Text-to-schema structuring failed: %s", exc)
        return None

    async def extract(self, image: bytes, mime: str) -> Optional[VisionResult]:
        if not self.account_id or not self.api_token:
            logger.warning("[Cloudflare Vision] Missing credentials (ACCOUNT_ID or API_TOKEN).")
            return None

        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        # Send original uncompressed image bytes directly as requested
        image_ints = list(image)
        prompt = (
            f"{VISION_SYSTEM_INSTRUCTION}\n\n"
            "Analyze the image and return the JSON object representing the UML diagram directly starting with {:\n{"
        )
        payload = {
            "prompt": prompt,
            "image": image_ints,
            "max_tokens": 4096,
        }

        try:
            logger.info("[Cloudflare Vision] Sending uncompressed %d bytes to %s...", len(image), self.model)
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                logger.info("[Cloudflare Vision] HTTP response status: %s", resp.status_code)

                # Check if model agreement required (403)
                if resp.status_code == 403 and "Model Agreement" in resp.text:
                    agreed = await self._accept_agreement(client, url, headers)
                    if agreed:
                        resp = await client.post(url, headers=headers, json=payload)
                        logger.info("[Cloudflare Vision] Post-agreement HTTP response: %s", resp.status_code)

                if resp.status_code == 200:
                    data = resp.json()
                    raw_content = data.get("result", {}).get("response") or ""

                    logger.info("==================== [CLOUDFLARE VISION RAW RESPONSE] ====================")
                    logger.info("%s", raw_content)
                    logger.info("==========================================================================")

                    res = _parse_vision_json(raw_content)
                    if res and res.model.get("nodes"):
                        logger.info(
                            "[Cloudflare Vision] Successfully extracted %d classes and %d relationships directly",
                            len(res.model["nodes"]), len(res.model.get("edges", []))
                        )
                        return res

                    # If model returned natural language text instead of direct JSON, structure it via text LLM
                    if isinstance(raw_content, str) and len(raw_content) > 30:
                        logger.info(
                            "[Cloudflare Vision] Model output is descriptive text (%d chars). Converting to UML schema...",
                            len(raw_content)
                        )
                        structured = await self._convert_text_to_schema(client, headers, raw_content)
                        if structured and structured.model.get("nodes"):
                            logger.info(
                                "[Cloudflare Vision] Structured %d classes and %d relationships via text LLM",
                                len(structured.model["nodes"]), len(structured.model.get("edges", []))
                            )
                            return structured
                else:
                    logger.warning(
                        "[Cloudflare Vision] Error (HTTP %s): %s", resp.status_code, resp.text[:300]
                    )
        except Exception as exc:
            logger.warning("[Cloudflare Vision] Request failed: %s (%s)", type(exc).__name__, exc)

        return None


class OpenRouterVisionProvider:
    """OpenRouter multimodal vision provider with free multimodal models."""

    provider_name = "openrouter-vision"

    def __init__(self, api_key: str = None, model: str = None) -> None:
        self.api_key = api_key or settings.OPENROUTER_API_KEY
        self.model = model or "google/gemini-2.0-flash-exp:free"

    async def extract(self, image: bytes, mime: str) -> Optional[VisionResult]:
        if not self.api_key:
            return None

        b64_image = base64.b64encode(image).decode("utf-8")
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "UmlStudio",
        }

        candidate_models = [
            "openrouter/free",
            "google/gemma-4-31b-it:free",
            "qwen/qwen3.8-27b:free",
            "nex-agi/nex-n2.5-pro:free",
            "google/gemini-2.0-flash-001",
            "meta-llama/llama-3.2-11b-vision-instruct:free",
        ]

        for model_name in candidate_models:
            payload = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": VISION_SYSTEM_INSTRUCTION},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract the UML Class Diagram from this image as strict JSON starting with {."},
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
                logger.info("[OpenRouter Vision] Attempting high-capacity model %s...", model_name)
                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        choices = data.get("choices", [])
                        if choices:
                            raw_content = choices[0].get("message", {}).get("content", "")
                            logger.info("==================== [OPENROUTER VISION RAW RESPONSE] ====================")
                            logger.info("%s", raw_content)
                            logger.info("==========================================================================")
                            res = _parse_vision_json(raw_content)
                            if res and res.model.get("nodes"):
                                logger.info("[OpenRouter Vision] Succeeded with model %s", model_name)
                                return res
                    else:
                        logger.warning(
                            "[OpenRouter Vision] %s error (HTTP %s): %s",
                            model_name,
                            resp.status_code,
                            resp.text[:200],
                        )
            except Exception as exc:
                logger.warning("[OpenRouter Vision] Attempt %s failed: %s", model_name, exc)

        return None


class GeminiVisionProvider:
    """Google Gemini Flash multimodal vision provider."""

    provider_name = "gemini-vision"

    def __init__(self, api_key: str = None, model: str = None) -> None:
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model = model or getattr(settings, "GEMINI_MODEL", None) or os.getenv("GEMINI_MODEL") or "gemini-2.5-flash"

    async def extract(self, image: bytes, mime: str) -> Optional[VisionResult]:
        if not self.api_key:
            return None

        b64_image = base64.b64encode(image).decode("utf-8")
        # Prioritize gemini-2.5-flash first to avoid 503 high demand spikes on preview models
        primary = "gemini-2.5-flash" if self.model in ("gemini-3.6-flash", "gemini-2.0-flash", "gemini-1.5-flash") else self.model
        candidate_models = [primary, "gemini-2.5-flash", "gemini-3.6-flash"]
        seen_models = []

        payload = {
            "system_instruction": {
                "parts": [{"text": VISION_SYSTEM_INSTRUCTION}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": "Extract the UML Class Diagram from this image as strict JSON."},
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

        for model_name in candidate_models:
            if not model_name or model_name in seen_models:
                continue
            seen_models.append(model_name)
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model_name}:generateContent?key={self.api_key}"
            )

            try:
                logger.info("[Gemini Vision] Calling Gemini API (%s)...", model_name)
                async with httpx.AsyncClient(timeout=35.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code != 200:
                        logger.warning("[Gemini Vision] %s error (HTTP %s): %s", model_name, resp.status_code, resp.text[:200])
                        continue

                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        continue

                    text = candidates[0]["content"]["parts"][0]["text"].strip()
                    logger.info("==================== [GEMINI VISION RAW RESPONSE] ====================")
                    logger.info("%s", text)
                    logger.info("======================================================================")

                    res = _parse_vision_json(text)
                    if res and res.model.get("nodes"):
                        logger.info("[Gemini Vision] Succeeded with %d nodes, %d edges", len(res.model["nodes"]), len(res.model.get("edges", [])))
                        return res
            except Exception as exc:
                logger.warning("[Gemini Vision] Attempt %s failed: %s", model_name, exc)

        return None

        return None


class LMStudioVisionProvider:
    """LM Studio local vision provider using Qwen3 VL (qwen3-vl-4b-instruct)."""

    provider_name = "lmstudio-vision"

    def __init__(self, endpoint_url: str = None, model: str = None) -> None:
        self.endpoint_url = (endpoint_url or settings.LMSTUDIO_URL).rstrip("/")
        self.model = model or settings.LMSTUDIO_VISION_MODEL

    async def extract(self, image: bytes, mime: str) -> Optional[VisionResult]:
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
            logger.info("[LM Studio Vision] Calling %s at %s...", self.model, self.endpoint_url)
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choice = data.get("choices", [{}])[0]
                    text = choice.get("message", {}).get("content", "").strip()
                    res = _parse_vision_json(text)
                    if res and res.model.get("nodes"):
                        logger.info("[LM Studio Vision] Succeeded with %d nodes", len(res.model["nodes"]))
                        return res
        except Exception as exc:
            logger.debug("[LM Studio Vision] Extraction failed: %s", exc)

        return None


class ChainedVisionProvider:
    """Chains multiple vision providers in priority order, falling back to stub fixture."""

    provider_name = "chained-vision"

    def __init__(self, providers: list[Any]) -> None:
        self.providers = providers
        self._stub = StubVisionProvider()

    async def extract(self, image: bytes, mime: str) -> VisionResult:
        errors: list[str] = []
        for provider in self.providers:
            p_name = getattr(provider, "provider_name", type(provider).__name__)
            try:
                logger.info("[Vision Chain] Attempting provider: %s...", p_name)
                res = await provider.extract(image, mime)
                if res and res.model and res.model.get("nodes"):
                    logger.info(
                        "[Vision Chain] Provider %s succeeded with %d classes and %d relationships",
                        p_name, len(res.model.get("nodes", [])), len(res.model.get("edges", []))
                    )
                    return res
                logger.warning("[Vision Chain] Provider %s did not extract any valid classes", p_name)
            except Exception as exc:
                errors.append(f"{p_name}: {exc}")
                logger.warning("[Vision Chain] Provider %s encountered an error: %s", p_name, exc)

        allow_stub = os.getenv("ALLOW_VISION_STUB_FALLBACK", "false").lower() in ("1", "true")
        if not self.providers or allow_stub:
            logger.info("[Vision Chain] All configured vision providers failed or unavailable, using stub fixture.")
            return await self._stub.extract(image, mime)

        err_msg = "; ".join(errors) if errors else "No se detectaron clases en la imagen."
        raise RuntimeError(f"Los proveedores de visión no pudieron extraer clases válidas del diagrama: {err_msg}")


def get_vision_provider(name: str = "auto") -> AIProvider:
    """Resolve the vision provider."""
    normalized = (name or "auto").strip().lower()
    if normalized in ("stub", "mock", "mock-local"):
        return StubVisionProvider()
    if normalized in ("cloudflare", "cf", "llama-vision"):
        return ChainedVisionProvider([CloudflareVisionProvider()])
    if normalized in ("openrouter", "or"):
        return ChainedVisionProvider([OpenRouterVisionProvider()])
    if normalized in ("gemini", "google"):
        return ChainedVisionProvider([GeminiVisionProvider()])
    if normalized in ("lmstudio", "lm-studio", "qwen-vl", "local"):
        return ChainedVisionProvider([LMStudioVisionProvider()])

    # Default 'auto' mode: Prioritize high-capacity multimodal models first:
    # 1. Google Gemini Direct (Gemini 2.0 Flash)
    # 2. OpenRouter Multimodal Pool (openrouter/free, Gemma 4 31B, Qwen 3.8 27B)
    # 3. Cloudflare Workers AI (LLaMA 3.2 11B Vision)
    # 4. LM Studio / Local
    chain = []
    if settings.GEMINI_API_KEY:
        chain.append(GeminiVisionProvider())
    if settings.OPENROUTER_API_KEY:
        chain.append(OpenRouterVisionProvider())
    if settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_API_TOKEN:
        chain.append(CloudflareVisionProvider())
    chain.append(LMStudioVisionProvider())

    return ChainedVisionProvider(chain)
