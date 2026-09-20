"""
UML Expert Prompting, Metamodel Context Serialization and Tool Calling Schemas.
Conforming strictly to OMG UML 2.5 and UmlStudio schema (uml-model-4.schema.json).
"""

import json
from typing import Dict, Any, List
from ..models.uml import (
    ModelDiff,
    DiffAddBlock,
    DiffModifyBlock,
    DiffRemoveBlock,
    DiffElementAdd,
    DiffRelationshipAdd,
    DiffElementModify,
    DiffElementModifyChanges,
    DiffAttribute,
    DiffMethod,
)


def serialize_model_context(model: Dict[str, Any]) -> str:
    """
    Serializes current diagram state to provide conversational context to the LLM.
    """
    nodes = model.get("nodes", [])
    edges = model.get("edges", [])

    if not nodes and not edges:
        return "El diagrama actual está vacío."

    lines: List[str] = ["=== ELEMENTOS EXISTENTES EN EL DIAGRAMA ==="]

    for node in nodes:
        data = node.get("data", {})
        node_id = node.get("id", "")
        name = data.get("name", "Unnamed")
        stereotype = data.get("stereotype", "")
        stereo_str = f" <<{stereotype}>>" if stereotype else ""
        lines.append(f"- Elemento ID: '{node_id}', Nombre: '{name}'{stereo_str}")

        attrs = data.get("attributes", [])
        if attrs:
            attr_names = [a.get("name") if isinstance(a, dict) else str(a) for a in attrs]
            lines.append(f"  Atributos: {', '.join(attr_names)}")

        methods = data.get("methods", [])
        if methods:
            method_names = [m.get("name") if isinstance(m, dict) else str(m) for m in methods]
            lines.append(f"  Métodos: {', '.join(method_names)}")

    if edges:
        lines.append("\n=== RELACIONES EXISTENTES ===")
        for edge in edges:
            edge_id = edge.get("id", "")
            edge_type = edge.get("type", "ClassBidirectional")
            source = edge.get("source", "")
            target = edge.get("target", "")
            lines.append(f"- Relación ID: '{edge_id}': {edge_type} de '{source}' hacia '{target}'")

    return "\n".join(lines)


def build_uml_system_prompt(current_model: Dict[str, Any]) -> str:
    """
    Constructs the system prompt instructing the LLM as an OMG UML 2.5 Senior Architect.
    """
    context_str = serialize_model_context(current_model)

    return f"""Eres el Asistente Experto en Modelado de Diagramas de Clases UML para UmlStudio.
Tu misión es interpretar instrucciones en lenguaje natural del modelador y proponer modificaciones estructurales precisas.

REGLAS ESTRICTAS DE DOMINIO (OMG UML 2.5):
1. Este software es EXCLUSIVAMENTE para Diagramas de Clases UML. Queda terminantemente prohibido generar elementos de casos de uso, secuencia, actividades, BPMN o estados.
2. Tipos de elementos válidos:
   - "Class": Clases concretas, abstractas (stereotype: "<<abstract>>") o interfaces (stereotype: "<<interface>>") o enums (stereotype: "<<enumeration>>").
   - "Package": Paquetes contenedores.
3. Tipos de relaciones UML válidas:
   - "ClassInheritance": Generalización / Herencia (flecha con triángulo hueco).
   - "ClassRealization": Realización de interfaz (línea punteada con triángulo hueco).
   - "ClassAggregation": Agregación débil (rombo hueco en el origen).
   - "ClassComposition": Composición fuerte (rombo relleno negro en el origen).
   - "ClassDependency": Dependencia (flecha punteada abierta).
   - "ClassBidirectional": Asociación bidireccional simple.
   - "ClassUnidirectional": Asociación unidireccional con flecha.
4. Formato de atributos y métodos:
   - Atributos: "+ id: String", "- balance: Double", "# createdAt: Date" (+ public, - private, # protected, ~ package).
   - Métodos: "+ execute(): void", "+ calculateTotal(rate: Double): Double".

FORMATO DE SALIDA REQUERIDO:
Debes emitir un objeto JSON estricto estructurado bajo el esquema ModelDiff con las siguientes claves:
{{
  "add": {{
    "elements": [
      {{
        "name": "NombreClase",
        "type": "Class",
        "stereotype": "<<interface>>", // opcional
        "position": {{ "x": 100, "y": 100 }}, // opcional, coord de canvas
        "attributes": [{{ "name": "+ attr: Tipo" }}],
        "methods": [{{ "name": "+ method(): void" }}]
      }}
    ],
    "relationships": [
      {{
        "type": "ClassRealization",
        "source": "NombreClaseOrigen",
        "target": "NombreClaseDestino"
      }}
    ]
  }},
  "modify": {{
    "elements": []
  }},
  "remove": {{
    "elementIds": [],
    "relationshipIds": []
  }}
}}

CONTEXTO DEL DIAGRAMA ACTUAL:
{context_str}

Responde ÚNICAMENTE con el objeto JSON del ModelDiff sin bloques de markdown extraños.
"""


# Function Calling tool schema for OpenAI & Claude
UML_DIFF_TOOL_SCHEMA = {
    "name": "apply_model_diff",
    "description": "Propose changes to the UML Class Diagram according to OMG UML 2.5 standard.",
    "parameters": {
        "type": "object",
        "properties": {
            "add": {
                "type": "object",
                "properties": {
                    "elements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string", "enum": ["Class", "Package"]},
                                "stereotype": {"type": "string"},
                                "attributes": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {"name": {"type": "string"}},
                                        "required": ["name"],
                                    },
                                },
                                "methods": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {"name": {"type": "string"}},
                                        "required": ["name"],
                                    },
                                },
                            },
                            "required": ["name"],
                        },
                    },
                    "relationships": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "ClassInheritance",
                                        "ClassRealization",
                                        "ClassAggregation",
                                        "ClassComposition",
                                        "ClassDependency",
                                        "ClassBidirectional",
                                        "ClassUnidirectional",
                                    ],
                                },
                                "source": {"type": "string"},
                                "target": {"type": "string"},
                            },
                            "required": ["type", "source", "target"],
                        },
                    },
                },
            },
            "modify": {
                "type": "object",
                "properties": {
                    "elements": {"type": "array", "items": {"type": "object"}},
                },
            },
            "remove": {
                "type": "object",
                "properties": {
                    "elementIds": {"type": "array", "items": {"type": "string"}},
                    "relationshipIds": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "required": [],
    },
}


def parse_and_validate_diff_payload(raw_json_or_dict: Any) -> ModelDiff:
    """
    Parses and sanitizes arbitrary JSON or dictionary output into a valid ModelDiff instance.
    """
    if isinstance(raw_json_or_dict, str):
        clean_text = raw_json_or_dict.strip()
        if clean_text.startswith("```"):
            clean_text = clean_text.split("```")[1]
            if clean_text.startswith("json"):
                clean_text = clean_text[4:]
        data = json.loads(clean_text.strip())
    elif isinstance(raw_json_or_dict, dict):
        data = raw_json_or_dict
    else:
        raise ValueError(f"Formato no procesable: {type(raw_json_or_dict)}")

    if "diff" in data and isinstance(data["diff"], dict):
        data = data["diff"]

    add_block = None
    if "add" in data and isinstance(data["add"], dict):
        raw_add = data["add"]
        elements = []
        for el in raw_add.get("elements", []):
            if isinstance(el, dict) and "name" in el:
                attrs = []
                for a in el.get("attributes", []):
                    attr_name = a.get("name") if isinstance(a, dict) else str(a)
                    attrs.append(DiffAttribute(name=attr_name))

                methods = []
                for m in el.get("methods", []):
                    m_name = m.get("name") if isinstance(m, dict) else str(m)
                    methods.append(DiffMethod(name=m_name))

                elements.append(
                    DiffElementAdd(
                        name=el["name"],
                        type=el.get("type", "Class"),
                        stereotype=el.get("stereotype"),
                        position=el.get("position"),
                        attributes=attrs if attrs else None,
                        methods=methods if methods else None,
                    )
                )

        rels = []
        for r in raw_add.get("relationships", []):
            if isinstance(r, dict) and "type" in r and "source" in r and "target" in r:
                rels.append(
                    DiffRelationshipAdd(
                        type=r["type"],
                        source=r["source"],
                        target=r["target"],
                    )
                )
        add_block = DiffAddBlock(elements=elements, relationships=rels)

    modify_block = None
    if "modify" in data and isinstance(data["modify"], dict):
        raw_mod = data["modify"]
        mods = []
        for m in raw_mod.get("elements", []):
            if isinstance(m, dict) and "id" in m and "changes" in m:
                mods.append(
                    DiffElementModify(
                        id=m["id"],
                        changes=DiffElementModifyChanges(**m["changes"]),
                    )
                )
        modify_block = DiffModifyBlock(elements=mods)

    remove_block = None
    if "remove" in data and isinstance(data["remove"], dict):
        raw_rem = data["remove"]
        remove_block = DiffRemoveBlock(
            elementIds=raw_rem.get("elementIds"),
            relationshipIds=raw_rem.get("relationshipIds"),
        )

    return ModelDiff(add=add_block, modify=modify_block, remove=remove_block)
