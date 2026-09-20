"""
UmlStudio MCP Tools Definitions and Execution Dispatcher.
Conforms to Model Context Protocol specification 2024-11-05.
"""

import json
from typing import Any, Dict, List, Optional

try:
    from .store import ModelStore
except ImportError:
    from store import ModelStore

TOOLS: List[Dict[str, Any]] = [
    {
        "name": "read_diagram",
        "description": "Lee y devuelve el modelo completo del diagrama de clases UML activo conforme a OMG UML 2.5.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "diagram_id": {
                    "type": "string",
                    "description": "ID del diagrama (o 'current' para el activo)",
                    "default": "current",
                }
            },
        },
    },
    {
        "name": "list_elements",
        "description": "Lista los elementos (clases, interfaces, relaciones) del diagrama actual.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "diagram_id": {
                    "type": "string",
                    "default": "current",
                },
                "element_type": {
                    "type": "string",
                    "description": "Filtrar por tipo (class, edge, etc.)",
                },
            },
        },
    },
    {
        "name": "add_class",
        "description": "Agrega una nueva clase UML al diagrama validando reglas OMG UML 2.5.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Nombre de la clase"},
                "stereotype": {
                    "type": "string",
                    "description": "Estereotipo opcional (entity, service, dto)",
                },
                "attributes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Lista de atributos UML (+ id: UUID)",
                },
                "methods": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Lista de métodos UML (+ calculate(): double)",
                },
                "diagram_id": {"type": "string", "default": "current"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "add_relationship",
        "description": "Agrega una relación UML entre dos clases (Association, Aggregation, Composition, Inheritance, Dependency, Realization, AssociationClass).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Nombre o ID de la clase origen",
                },
                "target": {
                    "type": "string",
                    "description": "Nombre o ID de la clase destino",
                },
                "rel_type": {
                    "type": "string",
                    "description": "Tipo de relación UML 2.5",
                },
                "source_mult": {
                    "type": "string",
                    "description": "Multiplicidad origen (ej. 1, 0..*)",
                },
                "target_mult": {
                    "type": "string",
                    "description": "Multiplicidad destino (ej. 0..*, 1..1)",
                },
                "diagram_id": {"type": "string", "default": "current"},
            },
            "required": ["source", "target", "rel_type"],
        },
    },
    {
        "name": "modify_element",
        "description": "Modifica atributos, métodos o nombre de una clase existente.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "element_id": {
                    "type": "string",
                    "description": "ID del elemento a modificar",
                },
                "name": {"type": "string"},
                "stereotype": {"type": "string"},
                "attributes": {"type": "array", "items": {"type": "string"}},
                "methods": {"type": "array", "items": {"type": "string"}},
                "diagram_id": {"type": "string", "default": "current"},
            },
            "required": ["element_id"],
        },
    },
    {
        "name": "delete_element",
        "description": "Elimina un elemento del diagrama y remueve en cascada sus relaciones huérfanas.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "element_id": {
                    "type": "string",
                    "description": "ID del elemento a eliminar",
                },
                "diagram_id": {"type": "string", "default": "current"},
            },
            "required": ["element_id"],
        },
    },
    {
        "name": "apply_model_diff",
        "description": "Aplica una mutación transaccional por lotes (ModelDiff: add, modify, remove) al diagrama.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "diff": {
                    "type": "object",
                    "description": "Bloque ModelDiff con add, modify, remove",
                },
                "diagram_id": {"type": "string", "default": "current"},
            },
            "required": ["diff"],
        },
    },
    {
        "name": "get_metrics",
        "description": "Calcula métricas de diseño orientado a objetos (Ca, Ce, Clases, Métodos) del diagrama.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "diagram_id": {"type": "string", "default": "current"},
            },
        },
    },
]


def handle_tool_call(store: ModelStore, name: str, args: Dict[str, Any]) -> str:
    """Dispatches tool execution against the store and returns stringified content."""
    diagram_id = args.get("diagram_id", "current")

    if name == "read_diagram":
        return json.dumps(store.get_diagram(diagram_id), indent=2)

    elif name == "list_elements":
        diag = store.get_diagram(diagram_id)
        elem_type = args.get("element_type")
        nodes = diag["nodes"]
        edges = diag["edges"]
        if elem_type == "class":
            return json.dumps([n["data"]["name"] for n in nodes], indent=2)
        elif elem_type == "edge":
            return json.dumps(edges, indent=2)
        return json.dumps(
            {
                "classes": [
                    {
                        "id": n["id"],
                        "name": n["data"].get("name"),
                        "methods": len(n["data"].get("methods", [])),
                    }
                    for n in nodes
                ],
                "relationships": [
                    {
                        "id": e["id"],
                        "type": e["data"].get("type"),
                        "source": e["source"],
                        "target": e["target"],
                    }
                    for e in edges
                ],
            },
            indent=2,
        )

    elif name == "add_class":
        result = store.add_class(
            name=args["name"],
            stereotype=args.get("stereotype"),
            attributes=args.get("attributes"),
            methods=args.get("methods"),
            diagram_id=diagram_id,
        )
        return json.dumps(result, indent=2)

    elif name == "add_relationship":
        result = store.add_relationship(
            source=args["source"],
            target=args["target"],
            rel_type=args["rel_type"],
            source_mult=args.get("source_mult"),
            target_mult=args.get("target_mult"),
            diagram_id=diagram_id,
        )
        return json.dumps(result, indent=2)

    elif name == "modify_element":
        result = store.modify_element(
            element_id=args["element_id"],
            name=args.get("name"),
            stereotype=args.get("stereotype"),
            attributes=args.get("attributes"),
            methods=args.get("methods"),
            diagram_id=diagram_id,
        )
        return json.dumps(result, indent=2)

    elif name == "delete_element":
        result = store.delete_element(
            element_id=args["element_id"], diagram_id=diagram_id
        )
        return json.dumps(result, indent=2)

    elif name == "apply_model_diff":
        result = store.apply_model_diff(
            diff=args["diff"], diagram_id=diagram_id
        )
        return json.dumps(result, indent=2)

    elif name == "get_metrics":
        result = store.get_metrics(diagram_id=diagram_id)
        return json.dumps(result, indent=2)

    else:
        raise ValueError(f"Herramienta desconocida '{name}'.")
