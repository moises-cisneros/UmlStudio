"""
FastMCP Framework Adapter for UmlStudio.
Registers tools and resources on FastMCP instance when the library is present.
"""

import json
from typing import Any, Dict, List, Optional

try:
    from .constants import SERVER_NAME
    from .resources import handle_resource_read
    from .store import ModelStore
except ImportError:
    from constants import SERVER_NAME
    from resources import handle_resource_read
    from store import ModelStore

try:
    from fastmcp import FastMCP
    HAS_FASTMCP = True
except ImportError:
    HAS_FASTMCP = False
    FastMCP = None


def create_fastmcp_app(store: ModelStore) -> Optional[Any]:
    """Builds and configures a FastMCP application instance if installed."""
    if not HAS_FASTMCP:
        return None

    mcp = FastMCP(
        SERVER_NAME,
        instructions="UmlStudio OMG UML 2.5 Class Diagram Modeling Server",
    )

    @mcp.tool()
    def read_diagram(diagram_id: str = "current") -> str:
        """Lee y devuelve el modelo completo del diagrama de clases UML activo conforme a OMG UML 2.5."""
        return json.dumps(store.get_diagram(diagram_id), indent=2)

    @mcp.tool()
    def list_elements(diagram_id: str = "current", element_type: Optional[str] = None) -> Any:
        """Lista los elementos (clases, interfaces, relaciones) del diagrama actual."""
        diag = store.get_diagram(diagram_id)
        if element_type == "class":
            return [n["data"]["name"] for n in diag["nodes"]]
        if element_type == "edge":
            return diag["edges"]
        return {
            "classes": [
                {
                    "id": n["id"],
                    "name": n["data"].get("name"),
                    "methods": len(n["data"].get("methods", [])),
                }
                for n in diag["nodes"]
            ],
            "relationships": [
                {
                    "id": e["id"],
                    "type": e["data"].get("type"),
                    "source": e["source"],
                    "target": e["target"],
                }
                for e in diag["edges"]
            ],
        }

    @mcp.tool()
    def add_class(
        name: str,
        stereotype: Optional[str] = None,
        attributes: Optional[List[str]] = None,
        methods: Optional[List[str]] = None,
        diagram_id: str = "current",
    ) -> Dict[str, Any]:
        """Crea e incorpora una nueva clase o interfaz en el diagrama activo."""
        return store.add_class(
            name=name,
            stereotype=stereotype,
            attributes=attributes,
            methods=methods,
            diagram_id=diagram_id,
        )

    @mcp.tool()
    def add_relationship(
        source: str,
        target: str,
        rel_type: str,
        source_mult: Optional[str] = None,
        target_mult: Optional[str] = None,
        diagram_id: str = "current",
    ) -> Dict[str, Any]:
        """Crea una relacion conforme a OMG UML 2.5 entre dos clases."""
        return store.add_relationship(
            source=source,
            target=target,
            rel_type=rel_type,
            source_mult=source_mult,
            target_mult=target_mult,
            diagram_id=diagram_id,
        )

    @mcp.tool()
    def modify_element(
        element_id: str,
        name: Optional[str] = None,
        stereotype: Optional[str] = None,
        attributes: Optional[List[str]] = None,
        methods: Optional[List[str]] = None,
        diagram_id: str = "current",
    ) -> Dict[str, Any]:
        """Modifica propiedades, atributos o metodos de una clase o interfaz existente."""
        return store.modify_element(
            element_id=element_id,
            name=name,
            stereotype=stereotype,
            attributes=attributes,
            methods=methods,
            diagram_id=diagram_id,
        )

    @mcp.tool()
    def delete_element(element_id: str, diagram_id: str = "current") -> Dict[str, Any]:
        """Elimina una clase o arista del diagrama activo y purga dependencias."""
        return store.delete_element(element_id=element_id, diagram_id=diagram_id)

    @mcp.tool()
    def apply_model_diff(diff: Dict[str, Any], diagram_id: str = "current") -> Dict[str, Any]:
        """Aplica un lote atomico y transaccional de mutaciones sobre el diagrama."""
        return store.apply_model_diff(diff=diff, diagram_id=diagram_id)

    @mcp.tool()
    def get_metrics(diagram_id: str = "current") -> Dict[str, Any]:
        """Calcula metricas orientadas a objetos sobre el diagrama de clases activo."""
        return store.get_metrics(diagram_id=diagram_id)

    @mcp.resource("umlstudio://diagram/current")
    def resource_current_diagram() -> str:
        """Modelo del diagrama activo en formato JSON."""
        return json.dumps(store.get_diagram("current"), indent=2)

    @mcp.resource("umlstudio://schema")
    def resource_schema() -> str:
        """Metamodelo OMG UML 2.5 canonico v4.0.0."""
        return handle_resource_read(store, "umlstudio://schema")

    return mcp
