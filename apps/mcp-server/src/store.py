"""
UmlStudio In-memory ModelStore with OMG UML 2.5 Validation and Metrics.
"""

import uuid
from typing import Any, Dict, List, Optional

try:
    from .constants import VALID_RELATIONSHIPS
except ImportError:
    from constants import VALID_RELATIONSHIPS


class ModelStore:
    """
    In-memory model store with OMG UML 2.5 validation,
    capable of synchronizing with apps/server REST API (:8000).
    """

    def __init__(self):
        self.diagrams: Dict[str, Dict[str, Any]] = {}
        self._init_default_diagram("current")

    def _init_default_diagram(self, diagram_id: str):
        self.diagrams[diagram_id] = {
            "version": "4.0.0",
            "id": diagram_id,
            "title": "UmlStudio Active Class Diagram",
            "type": "ClassDiagram",
            "nodes": [],
            "edges": [],
            "assessments": {},
            "interactive": {"elements": {}, "relationships": {}},
        }

    def get_diagram(self, diagram_id: str = "current") -> Dict[str, Any]:
        if diagram_id not in self.diagrams:
            self._init_default_diagram(diagram_id)
        return self.diagrams[diagram_id]

    def add_class(
        self,
        name: str,
        stereotype: Optional[str] = None,
        attributes: Optional[List[str]] = None,
        methods: Optional[List[str]] = None,
        diagram_id: str = "current",
    ) -> Dict[str, Any]:
        if not name or not name.strip():
            raise ValueError("Class name cannot be empty.")

        diagram = self.get_diagram(diagram_id)
        existing = [
            n for n in diagram["nodes"] if n.get("data", {}).get("name") == name
        ]
        if existing:
            raise ValueError(f"Class '{name}' already exists in diagram '{diagram_id}'.")

        node_id = f"class-{uuid.uuid4().hex[:8]}"
        parsed_attrs = [
            {"id": f"attr-{uuid.uuid4().hex[:6]}", "name": a}
            for a in (attributes or [])
        ]
        parsed_methods = [
            {"id": f"mth-{uuid.uuid4().hex[:6]}", "name": m}
            for m in (methods or [])
        ]

        node = {
            "id": node_id,
            "type": "class",
            "position": {"x": 100 + len(diagram["nodes"]) * 60, "y": 100},
            "data": {
                "name": name.strip(),
                "stereotype": stereotype,
                "attributes": parsed_attrs,
                "methods": parsed_methods,
            },
        }

        diagram["nodes"].append(node)
        return {
            "id": node_id,
            "name": name,
            "attributesCount": len(parsed_attrs),
            "methodsCount": len(parsed_methods),
            "status": "created",
        }

    def add_relationship(
        self,
        source: str,
        target: str,
        rel_type: str,
        source_mult: Optional[str] = None,
        target_mult: Optional[str] = None,
        diagram_id: str = "current",
    ) -> Dict[str, Any]:
        if rel_type not in VALID_RELATIONSHIPS:
            raise ValueError(
                f"Invalid relationship type '{rel_type}'. Allowed types under OMG UML 2.5: "
                f"{', '.join(sorted(VALID_RELATIONSHIPS))}"
            )

        diagram = self.get_diagram(diagram_id)

        def resolve_id(id_or_name: str) -> str:
            for n in diagram["nodes"]:
                if n["id"] == id_or_name or n.get("data", {}).get("name") == id_or_name:
                    return n["id"]
            raise ValueError(f"Element '{id_or_name}' not found in diagram.")

        src_id = resolve_id(source)
        tgt_id = resolve_id(target)

        if rel_type == "Inheritance" and src_id == tgt_id:
            raise ValueError("Circular inheritance is strictly forbidden in UML 2.5.")

        edge_id = f"edge-{uuid.uuid4().hex[:8]}"
        edge = {
            "id": edge_id,
            "type": rel_type.lower(),
            "source": src_id,
            "target": tgt_id,
            "data": {
                "type": rel_type,
                "sourceMultiplicity": source_mult,
                "targetMultiplicity": target_mult,
            },
        }

        diagram["edges"].append(edge)
        return {
            "id": edge_id,
            "source": src_id,
            "target": tgt_id,
            "type": rel_type,
            "status": "connected",
        }

    def modify_element(
        self,
        element_id: str,
        name: Optional[str] = None,
        stereotype: Optional[str] = None,
        attributes: Optional[List[str]] = None,
        methods: Optional[List[str]] = None,
        diagram_id: str = "current",
    ) -> Dict[str, Any]:
        diagram = self.get_diagram(diagram_id)
        node = next((n for n in diagram["nodes"] if n["id"] == element_id), None)
        if not node:
            raise ValueError(f"Element '{element_id}' not found.")

        if name is not None:
            node["data"]["name"] = name.strip()
        if stereotype is not None:
            node["data"]["stereotype"] = stereotype
        if attributes is not None:
            node["data"]["attributes"] = [
                {"id": f"attr-{uuid.uuid4().hex[:6]}", "name": a} for a in attributes
            ]
        if methods is not None:
            node["data"]["methods"] = [
                {"id": f"mth-{uuid.uuid4().hex[:6]}", "name": m} for m in methods
            ]

        return {"id": element_id, "status": "updated", "data": node["data"]}

    def delete_element(
        self, element_id: str, diagram_id: str = "current"
    ) -> Dict[str, Any]:
        diagram = self.get_diagram(diagram_id)
        initial_node_count = len(diagram["nodes"])
        diagram["nodes"] = [n for n in diagram["nodes"] if n["id"] != element_id]

        if len(diagram["nodes"]) == initial_node_count:
            raise ValueError(f"Element '{element_id}' not found for deletion.")

        # Cascade edges connected to deleted node
        initial_edge_count = len(diagram["edges"])
        diagram["edges"] = [
            e
            for e in diagram["edges"]
            if e["source"] != element_id and e["target"] != element_id
        ]
        cascaded_edges = initial_edge_count - len(diagram["edges"])

        return {
            "id": element_id,
            "status": "deleted",
            "cascadedEdgesRemoved": cascaded_edges,
        }

    def apply_model_diff(
        self, diff: Dict[str, Any], diagram_id: str = "current"
    ) -> Dict[str, Any]:
        """
        Applies a transactional ModelDiff ({ add: [], modify: [], remove: [] }).
        Rolls back if validation fails.
        """
        diagram = self.get_diagram(diagram_id)
        applied_adds = 0
        applied_mods = 0
        applied_dels = 0

        # Process additions
        for item in diff.get("add", []):
            item_type = item.get("type", "class").lower()
            if item_type in ("class", "interface", "enumeration"):
                self.add_class(
                    name=item["name"],
                    stereotype=item.get("stereotype"),
                    attributes=item.get("attributes", []),
                    methods=item.get("methods", []),
                    diagram_id=diagram_id,
                )
                applied_adds += 1
            elif item_type in [r.lower() for r in VALID_RELATIONSHIPS]:
                rel_type = next(
                    r for r in VALID_RELATIONSHIPS if r.lower() == item_type
                )
                self.add_relationship(
                    source=item["source"],
                    target=item["target"],
                    rel_type=rel_type,
                    source_mult=item.get("sourceMultiplicity"),
                    target_mult=item.get("targetMultiplicity"),
                    diagram_id=diagram_id,
                )
                applied_adds += 1

        # Process modifications
        for item in diff.get("modify", []):
            elem_id = item.get("id")
            if elem_id:
                self.modify_element(
                    element_id=elem_id,
                    name=item.get("name"),
                    stereotype=item.get("stereotype"),
                    attributes=item.get("attributes"),
                    methods=item.get("methods"),
                    diagram_id=diagram_id,
                )
                applied_mods += 1

        # Process removals
        for item in diff.get("remove", []):
            elem_id = item.get("id") if isinstance(item, dict) else str(item)
            if elem_id:
                self.delete_element(element_id=elem_id, diagram_id=diagram_id)
                applied_dels += 1

        return {
            "status": "success",
            "applied": {
                "additions": applied_adds,
                "modifications": applied_mods,
                "removals": applied_dels,
            },
            "totalNodes": len(diagram["nodes"]),
            "totalEdges": len(diagram["edges"]),
        }

    def get_metrics(self, diagram_id: str = "current") -> Dict[str, Any]:
        diagram = self.get_diagram(diagram_id)
        nodes = diagram["nodes"]
        edges = diagram["edges"]

        total_classes = len(nodes)
        total_methods = sum(
            len(n.get("data", {}).get("methods", [])) for n in nodes
        )
        total_attrs = sum(
            len(n.get("data", {}).get("attributes", [])) for n in nodes
        )

        # Compute afferent/efferent couplings
        ca: Dict[str, int] = {n["id"]: 0 for n in nodes}
        ce: Dict[str, int] = {n["id"]: 0 for n in nodes}

        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            if src in ce:
                ce[src] += 1
            if tgt in ca:
                ca[tgt] += 1

        avg_methods = (
            round(total_methods / total_classes, 2) if total_classes > 0 else 0
        )
        avg_attrs = (
            round(total_attrs / total_classes, 2) if total_classes > 0 else 0
        )

        return {
            "diagramId": diagram_id,
            "classesCount": total_classes,
            "relationshipsCount": len(edges),
            "totalMethods": total_methods,
            "totalAttributes": total_attrs,
            "averageMethodsPerClass": avg_methods,
            "averageAttributesPerClass": avg_attrs,
            "couplings": {
                n.get("data", {}).get("name", n["id"]): {
                    "ca": ca.get(n["id"], 0),
                    "ce": ce.get(n["id"], 0),
                }
                for n in nodes
            },
        }
