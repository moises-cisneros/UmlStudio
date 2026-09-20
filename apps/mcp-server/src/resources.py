"""
UmlStudio MCP Resources Definitions and Reader.
Exposes active diagram and OMG UML 2.5 Metamodel Schema.
"""

import json
import os
from typing import Any, Dict, List, Optional

try:
    from .store import ModelStore
except ImportError:
    from store import ModelStore

RESOURCES: List[Dict[str, Any]] = [
    {
        "uri": "umlstudio://diagram/current",
        "name": "Active UML Class Diagram",
        "description": "Grafo del diagrama de clases UML actualmente cargado",
        "mimeType": "application/json",
    },
    {
        "uri": "umlstudio://schema",
        "name": "OMG UML 2.5 Metamodel Schema",
        "description": "Esquema canónico de validación uml-model-4.schema.json",
        "mimeType": "application/json",
    },
]


def resolve_schema_path() -> Optional[str]:
    """Finds canonical uml-model-4.schema.json path across environments."""
    env_path = os.environ.get("UML_SCHEMA_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    base_dir = os.path.dirname(__file__)
    candidate_paths = [
        # Relative to monorepo root in development:
        os.path.abspath(os.path.join(base_dir, "../../../packages/core/schema/uml-model-4.schema.json")),
        # In Docker container if copied into /app/schema/:
        os.path.abspath(os.path.join(base_dir, "../schema/uml-model-4.schema.json")),
        # In Docker container if copied into /app/packages/core/schema/:
        os.path.abspath(os.path.join(base_dir, "../packages/core/schema/uml-model-4.schema.json")),
        # In Docker container root /app/uml-model-4.schema.json:
        os.path.abspath(os.path.join(base_dir, "../uml-model-4.schema.json")),
    ]

    for path in candidate_paths:
        if os.path.exists(path):
            return path

    return None


def handle_resource_read(store: ModelStore, uri: str) -> str:
    """Reads URI resources."""
    if uri == "umlstudio://diagram/current":
        return json.dumps(store.get_diagram("current"), indent=2)

    elif uri == "umlstudio://schema":
        schema_path = resolve_schema_path()
        if schema_path:
            with open(schema_path, "r", encoding="utf-8") as f:
                return f.read()
        return json.dumps(
            {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "title": "OMG UML 2.5 Class Diagram Metamodel",
                "version": "4.0.0",
                "notice": "Canonical schema loaded in fallback mode",
            },
            indent=2,
        )

    raise ValueError(f"Resource with URI '{uri}' not found.")
