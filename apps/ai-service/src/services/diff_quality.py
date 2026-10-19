"""
Deterministic quality gate for LLM-proposed ModelDiffs.

Free-tier and small local models often answer a rich domain prompt with a token
gesture (one bare class, no relationships). This module detects that, produces
actionable feedback for one repair round, and ranks diffs so a retry can never make
the result worse.
"""

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from ..models.uml import ModelDiff
from .prompting import PROMPT_EXAMPLE_CLASS_NAMES

# Prompts that describe a domain instead of dictating a precise edit.
_DOMAIN_CUES = re.compile(
    r"\b(sistema|aplicaci[oó]n|m[oó]dulo|modelo de|gesti[oó]n|plataforma|tienda|biblioteca|hospital|"
    r"escuela|universidad|banco|inventario|reserva|taller|domain|system|application|platform|store)\b",
    re.IGNORECASE,
)
# Leading verbs that dictate a precise edit of the existing model: never a domain description.
_MODIFY_VERBS = re.compile(
    r"^\s*(quita|elimina|borra|renombra|cambia|modifica|remove|delete|rename|change)\b",
    re.IGNORECASE,
)
# Leading verbs that may introduce a whole domain ("Crea un sistema de ..."): complex only with a cue.
_CREATE_VERBS = re.compile(r"^\s*(agrega|a[nñ]ade|crea|add)\b", re.IGNORECASE)
CREATE_MIN_WORDS = 6

# Wording that states how many instances relate: the answer must then carry multiplicities.
_CARDINALITY_CUES = re.compile(
    r"\b(muchos?|muchas?|varios?|varias?|al menos|uno o m[aá]s|cero o|[uú]nic[oa]|exactamente|"
    r"many|several|at least|exactly)\b",
    re.IGNORECASE,
)
_MULTIPLICITY_RELATIONSHIPS = (
    "ClassBidirectional",
    "ClassUnidirectional",
    "ClassAggregation",
    "ClassComposition",
)

EMPTY_DIFF_SCORE = -(10**6)

COMPLEX_MIN_WORDS = 14
MIN_CLASSES_FOR_COMPLEX = 3
COPY_MIN_CLASSES = 3
MIN_TOKEN_LENGTH = 4


def _word_count(text: str) -> int:
    return len(re.findall(r"\w+", text or ""))


def is_complex_prompt(prompt: str) -> bool:
    """True when the prompt describes a domain/system rather than a precise one-line edit."""
    text = (prompt or "").strip()
    if not text:
        return False
    if _MODIFY_VERBS.match(text):
        return False
    words = _word_count(text)
    has_cue = bool(_DOMAIN_CUES.search(text))
    if _CREATE_VERBS.match(text):
        return has_cue and words >= CREATE_MIN_WORDS
    if words >= COMPLEX_MIN_WORDS:
        return True
    return has_cue and words >= CREATE_MIN_WORDS


def _is_empty(diff: ModelDiff) -> bool:
    add, modify, remove = diff.add, diff.modify, diff.remove
    return not (
        (add and (add.elements or add.relationships))
        or (modify and (modify.elements or modify.relationships))
        or (remove and (remove.elementIds or remove.relationshipIds))
    )


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", (text or "").lower())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def _name_tokens(name: str) -> List[str]:
    """'OrdenTrabajo' -> ['orden', 'trabajo']; tokens shorter than MIN_TOKEN_LENGTH are ignored."""
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name or "")
    parts = re.split(r"[\s_\-]+", spaced)
    return [_fold(p) for p in parts if len(p) >= MIN_TOKEN_LENGTH]


def _find_example_copies(
    prompt: str, diff: ModelDiff, current_model: Optional[Dict[str, Any]]
) -> List[str]:
    """
    Names of added classes that exist only because a system-prompt example used them and that
    the user never mentioned. Returns [] unless there are enough of them to call it a copy.
    """
    elements = list(diff.add.elements or []) if diff.add else []
    if len(elements) < COPY_MIN_CLASSES:
        return []
    context = _fold(prompt) + " " + " ".join(_existing_names(current_model))
    suspects = []
    for el in elements:
        canonical = re.sub(r"[^a-z0-9]", "", _fold(el.name))
        if canonical not in PROMPT_EXAMPLE_CLASS_NAMES:
            continue
        tokens = _name_tokens(el.name) or [canonical]
        if any(token in context for token in tokens):
            continue
        suspects.append(el.name)
    if len(suspects) >= COPY_MIN_CLASSES and len(suspects) * 2 >= len(elements):
        return suspects
    return []


def strip_example_copies(
    prompt: str, diff: ModelDiff, current_model: Optional[Dict[str, Any]] = None
) -> Tuple[ModelDiff, List[str]]:
    """Removes classes (and their relationships) copied from prompt examples. Returns (diff, removed)."""
    removed = _find_example_copies(prompt, diff, current_model)
    if not removed:
        return diff, []
    gone = {name.lower() for name in removed}
    add = diff.add
    kept_elements = [e for e in (add.elements or []) if e.name.lower() not in gone]
    kept_rels = [
        r for r in (add.relationships or []) if r.source.lower() not in gone and r.target.lower() not in gone
    ]
    cleaned = diff.model_copy(deep=True)
    if kept_elements or kept_rels:
        cleaned.add.elements = kept_elements
        cleaned.add.relationships = kept_rels
    else:
        cleaned.add = None
    return cleaned, removed


def _existing_names(current_model: Optional[Dict[str, Any]]) -> set:
    names = set()
    for node in (current_model or {}).get("nodes", []) or []:
        if not isinstance(node, dict):
            continue
        data = node.get("data") or {}
        for value in (data.get("name"), node.get("id")):
            if value:
                names.add(str(value).lower())
    return names


def assess_diff(
    prompt: str, diff: ModelDiff, current_model: Optional[Dict[str, Any]] = None
) -> List[str]:
    """Returns human-readable issues (Spanish, fed back to the LLM). Empty list = acceptable."""
    if _is_empty(diff):
        if _word_count(prompt) >= 4:
            return [
                "El diff está vacío: no propusiste ningún cambio. Interpreta la solicitud "
                "e incluye clases, atributos y relaciones."
            ]
        return []

    issues: List[str] = []
    copied = _find_example_copies(prompt, diff, current_model)
    if copied:
        issues.append(
            f"Copiaste clases de los ejemplos del sistema ({', '.join(copied)}) que el usuario no "
            "mencionó. Ignora los ejemplos y modela únicamente el dominio que describe el usuario."
        )
    elements = list(diff.add.elements or []) if diff.add else []
    relationships = list(diff.add.relationships or []) if diff.add else []
    existing = _existing_names(current_model)

    seen = set()
    duplicated = set()
    for el in elements:
        key = el.name.strip().lower()
        if key in seen:
            duplicated.add(el.name)
        seen.add(key)
    if duplicated:
        issues.append(
            f"Hay clases duplicadas en el diff ({', '.join(sorted(duplicated))}): une cada una en una sola."
        )

    self_loops = [r for r in relationships if r.source.strip().lower() == r.target.strip().lower()]
    if self_loops:
        names = ", ".join(sorted({r.source for r in self_loops}))
        issues.append(
            f"Hay relaciones de una clase a sí misma ({names}); elimínalas salvo que el "
            "usuario pidiera una relación reflexiva."
        )

    associations = [r for r in relationships if r.type in _MULTIPLICITY_RELATIONSHIPS]
    if (
        associations
        and _CARDINALITY_CUES.search(prompt or "")
        and not any(r.sourceMultiplicity or r.targetMultiplicity for r in associations)
    ):
        issues.append(
            "El usuario indicó cardinalidades (muchos, al menos uno, único...) pero ninguna relación "
            "tiene multiplicidad. Completa sourceMultiplicity/targetMultiplicity (1, 0..1, 1..*, 0..*)."
        )

    inheritance_sources: Dict[str, set] = {}
    for rel in relationships:
        if rel.type == "ClassInheritance":
            inheritance_sources.setdefault(rel.source.strip().lower(), set()).add(rel.target.strip().lower())
    inverted = sorted(src for src, targets in inheritance_sources.items() if len(targets) >= 2)
    if inverted:
        issues.append(
            f"Posible herencia invertida: {', '.join(inverted)} aparece heredando de varias clases a la "
            "vez. Recuerda que 'source HEREDA DE target': la subclase es el source y la superclase el target."
        )

    if is_complex_prompt(prompt) and elements:
        total_classes = len(elements)
        if not existing and total_classes < MIN_CLASSES_FOR_COMPLEX:
            issues.append(
                f"El usuario describió un dominio y propusiste muy pocas clases ({total_classes}). "
                "Infiere las entidades restantes del dominio."
            )
        if total_classes >= 2 and not relationships:
            issues.append(
                "Las clases no tienen relaciones entre sí. Añade las relaciones (herencia, "
                "composición, asociación...) con sus multiplicidades."
            )
        bare = [e for e in elements if not (e.attributes or e.methods)]
        non_enum_bare = [e for e in bare if (e.stereotype or "").lower() not in ("<<enumeration>>",)]
        if total_classes >= 3 and len(non_enum_bare) * 2 > total_classes:
            issues.append(
                f"La mayoría de las clases no tiene atributos ni métodos ({len(non_enum_bare)} de "
                f"{total_classes}). Infiere atributos tipados y métodos de negocio razonables."
            )

    return issues


def score_diff(prompt: str, diff: ModelDiff, current_model: Optional[Dict[str, Any]] = None) -> int:
    """Higher is better. An empty answer always loses; then fewer issues, then more modeled content."""
    if _is_empty(diff):
        return EMPTY_DIFF_SCORE
    issues = assess_diff(prompt, diff, current_model)
    content = 0
    if diff.add:
        content += len(diff.add.elements or []) + len(diff.add.relationships or [])
        content += sum(len(e.attributes or []) + len(e.methods or []) for e in diff.add.elements or [])
    if diff.modify:
        content += len(diff.modify.elements or []) + len(diff.modify.relationships or [])
    if diff.remove:
        content += len(diff.remove.elementIds or []) + len(diff.remove.relationshipIds or [])
    return -1000 * len(issues) + content


def build_repair_feedback(issues: List[str]) -> str:
    bullets = "\n".join(f"- {issue}" for issue in issues)
    return (
        "[REVISIÓN AUTOMÁTICA] Tu respuesta anterior tiene problemas que debes corregir:\n"
        f"{bullets}\n"
        "Vuelve a responder con el diff COMPLETO y corregido (no solo la diferencia)."
    )
