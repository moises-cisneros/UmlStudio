"""
Shared UML text normalization used by the text, voice and vision pipelines:
relationship-type aliases and multiplicity phrases (spoken or written).
"""

import re
import unicodedata
from typing import Any, Optional

# Canonical OMG UML 2.5 relationship types with LLM-friendly aliases
REL_TYPE_ALIASES = {
    "classinheritance": "ClassInheritance",
    "inheritance": "ClassInheritance",
    "generalization": "ClassInheritance",
    "generalización": "ClassInheritance",
    "generalizacion": "ClassInheritance",
    "extends": "ClassInheritance",
    "herencia": "ClassInheritance",
    "classrealization": "ClassRealization",
    "realization": "ClassRealization",
    "realización": "ClassRealization",
    "realizacion": "ClassRealization",
    "implements": "ClassRealization",
    "classaggregation": "ClassAggregation",
    "aggregation": "ClassAggregation",
    "agregación": "ClassAggregation",
    "agregacion": "ClassAggregation",
    "classcomposition": "ClassComposition",
    "composition": "ClassComposition",
    "composición": "ClassComposition",
    "composicion": "ClassComposition",
    "classdependency": "ClassDependency",
    "dependency": "ClassDependency",
    "dependencia": "ClassDependency",
    "classbidirectional": "ClassBidirectional",
    "bidirectional": "ClassBidirectional",
    "bidireccional": "ClassBidirectional",
    "association": "ClassBidirectional",
    "asociación": "ClassBidirectional",
    "asociacion": "ClassBidirectional",
    "classunidirectional": "ClassUnidirectional",
    "unidirectional": "ClassUnidirectional",
    "unidireccional": "ClassUnidirectional",
}

DEFAULT_RELATIONSHIP_TYPE = "ClassBidirectional"


def normalize_relationship_type(raw: Any) -> str:
    """Maps any alias (English/Spanish, with or without the Class prefix) to a canonical type."""
    if not raw or not isinstance(raw, str):
        return DEFAULT_RELATIONSHIP_TYPE
    key = raw.strip().lower().replace("-", "").replace("_", "").replace(" ", "")
    return REL_TYPE_ALIASES.get(key, DEFAULT_RELATIONSHIP_TYPE)


def _fold(text: str) -> str:
    """Lowercase + strip accents so 'más' and 'mas' compare equal."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


_WORD_BOUNDS = {
    "0": "0",
    "cero": "0",
    "zero": "0",
    "1": "1",
    "uno": "1",
    "una": "1",
    "one": "1",
}
_MANY_WORDS = {"*", "n", "m", "muchos", "muchas", "many", "varios", "varias", "infinito", "infinite"}

_PHRASES = {
    "cero o uno": "0..1",
    "zero or one": "0..1",
    "opcional": "0..1",
    "optional": "0..1",
    "uno o mas": "1..*",
    "one or more": "1..*",
    "uno o muchos": "1..*",
    "al menos uno": "1..*",
    "at least one": "1..*",
    "cero o mas": "0..*",
    "cero o muchos": "0..*",
    "zero or more": "0..*",
    "muchos": "*",
    "muchas": "*",
    "many": "*",
    "varios": "*",
    "varias": "*",
}

_RANGE_RE = re.compile(r"^(\d+|n|m)\s*\.\.\s*(\d+|n|m|\*)$")
_INT_RE = re.compile(r"^\d+$")


def normalize_multiplicity(raw: Any) -> Optional[str]:
    """
    Normalizes written or spoken multiplicities into UML notation
    ('1', '0..1', '1..*', '0..*', '*'). Returns None when it is not a multiplicity.
    """
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return str(raw) if raw >= 0 else None
    if not isinstance(raw, str):
        return None

    text = _fold(raw).strip()
    if not text:
        return None

    if text in _PHRASES:
        return _PHRASES[text]
    if text in _WORD_BOUNDS:
        return _WORD_BOUNDS[text]
    if text in _MANY_WORDS:
        return "*"

    compact = text.replace(" ", "")
    match = _RANGE_RE.match(compact)
    if match:
        low, high = match.group(1), match.group(2)
        low = "*" if low in ("n", "m") else low
        high = "*" if high in ("n", "m", "*") else high
        if low == "*":
            return "*"
        return f"{low}..{high}"
    if _INT_RE.match(compact):
        return compact
    return None
