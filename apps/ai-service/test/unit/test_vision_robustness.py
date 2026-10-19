"""
Image -> class diagram: resilience of the extraction normalizer against the messy
output real vision models produce (alternative keys, dangling edges, duplicates,
truncated JSON, structured members) plus prompt and validation guarantees.
"""

import json
import unittest

from src.vision.providers import (
    VISION_SYSTEM_INSTRUCTION,
    _normalize_uml_model,
    _parse_vision_json,
)
from src.vision.validation import validate_vision_model


def _names(result):
    return [n["data"]["name"] for n in result.model["nodes"]]


def _edges(result):
    return [
        (e["type"], e["source"], e["target"], e["data"]["sourceMultiplicity"], e["data"]["targetMultiplicity"])
        for e in result.model["edges"]
    ]


FENCED_WITH_PROSE = (
    "Aquí está el diagrama:\n```json\n"
    + json.dumps(
        {
            "classes": [
                {"name": "Cliente", "attributes": ["- id: int", "+ nombre: String"], "methods": ["+ comprar(): void"]},
                {"name": "Pedido", "attributes": ["- fecha: Date"]},
                {"name": "Producto"},
            ],
            "relationships": [
                {"from": "Cliente", "to": "Pedido", "type": "association", "sourceMultiplicity": "1", "targetMultiplicity": "0..*"},
                {"source": "Pedido", "target": "Producto", "type": "composition", "targetMultiplicity": "1..n"},
            ],
        }
    )
    + "\n```\nEspero que sirva."
)


class TestEdgeExtraction(unittest.TestCase):
    def test_from_to_keys_are_not_silently_dropped(self):
        result = _parse_vision_json(FENCED_WITH_PROSE)
        self.assertEqual(
            _edges(result),
            [
                ("ClassBidirectional", "node-cliente", "node-pedido", "1", "0..*"),
                ("ClassComposition", "node-pedido", "node-producto", None, "1..*"),
            ],
        )

    def test_alternative_edge_collection_keys(self):
        for key in ("connections", "links", "relations", "associations"):
            with self.subTest(key=key):
                result = _normalize_uml_model(
                    {
                        "nodes": [{"data": {"name": "A"}}, {"data": {"name": "B"}}],
                        key: [{"source": "A", "target": "B", "type": "herencia"}],
                    }
                )
                self.assertEqual([e[0] for e in _edges(result)], ["ClassInheritance"])

    def test_multiplicity_alias_keys_and_nested_data(self):
        result = _normalize_uml_model(
            {
                "nodes": [{"data": {"name": "A"}}, {"data": {"name": "B"}}],
                "edges": [
                    {
                        "source": "A",
                        "target": "B",
                        "type": "aggregation",
                        "data": {"multiplicityA": "uno", "multiplicityB": "muchos"},
                    }
                ],
            }
        )
        self.assertEqual(_edges(result)[0][3:], ("1", "*"))

    def test_dangling_edges_are_dropped_not_sent_to_the_canvas(self):
        result = _normalize_uml_model(
            {
                "nodes": [{"data": {"name": "A"}}],
                "edges": [{"source": "A", "target": "Fantasma", "type": "inheritance"}],
            }
        )
        self.assertEqual(result.model["edges"], [])

    def test_edge_ids_are_unique(self):
        result = _normalize_uml_model(
            {
                "nodes": [{"data": {"name": "A"}}, {"data": {"name": "B"}}],
                "edges": [
                    {"id": "e", "source": "A", "target": "B", "type": "association"},
                    {"id": "e", "source": "B", "target": "A", "type": "dependency"},
                ],
            }
        )
        ids = [e["id"] for e in result.model["edges"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(ids), 2)


class TestNodeExtraction(unittest.TestCase):
    def test_duplicate_class_names_are_merged_and_edges_remapped(self):
        result = _normalize_uml_model(
            {
                "nodes": [
                    {"id": "n1", "data": {"name": "Cuenta", "attributes": ["- saldo: Double"]}},
                    {"id": "n2", "data": {"name": "cuenta", "attributes": ["- saldo: Double", "+ titular: String"]}},
                    {"id": "n3", "data": {"name": "Banco"}},
                ],
                "edges": [{"source": "n2", "target": "n3", "type": "composition"}],
            }
        )
        self.assertEqual(_names(result), ["Cuenta", "Banco"])
        attrs = [a["name"] for a in result.model["nodes"][0]["data"]["attributes"]]
        self.assertEqual(attrs, ["- saldo: Double", "+ titular: String"])
        edge = result.model["edges"][0]
        self.assertEqual(edge["source"], result.model["nodes"][0]["id"])

    def test_structured_attribute_keeps_visibility_and_type(self):
        result = _normalize_uml_model(
            {
                "nodes": [
                    {
                        "data": {
                            "name": "Cuenta",
                            "attributes": [
                                {"name": "saldo", "type": "Double", "visibility": "private"},
                                {"name": "id", "type": "int"},
                                "# activo: boolean",
                            ],
                        }
                    }
                ]
            }
        )
        attrs = [a["name"] for a in result.model["nodes"][0]["data"]["attributes"]]
        self.assertEqual(attrs, ["- saldo: Double", "+ id: int", "# activo: boolean"])

    def test_structured_method_keeps_signature(self):
        result = _normalize_uml_model(
            {
                "nodes": [
                    {
                        "data": {
                            "name": "Calculadora",
                            "methods": [
                                {
                                    "name": "sumar",
                                    "returnType": "int",
                                    "visibility": "public",
                                    "parameters": [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
                                }
                            ],
                        }
                    }
                ]
            }
        )
        meth = result.model["nodes"][0]["data"]["methods"][0]["name"]
        self.assertEqual(meth, "+ sumar(a: int, b: int): int")

    def test_interface_stereotype_variants(self):
        for raw in ("interface", "<<interface>>", "«interface»", "Interface"):
            with self.subTest(raw=raw):
                result = _normalize_uml_model(
                    {"nodes": [{"data": {"name": "Pagable", "stereotype": raw}}]}
                )
                self.assertEqual(result.model["nodes"][0]["data"]["stereotype"], "<<interface>>")

    def test_italic_abstract_marker_becomes_abstract_stereotype(self):
        result = _normalize_uml_model(
            {"nodes": [{"data": {"name": "Figura", "isAbstract": True}}]}
        )
        self.assertEqual(result.model["nodes"][0]["data"]["stereotype"], "<<abstract>>")

    def test_ids_never_collide_even_if_model_repeats_them(self):
        result = _normalize_uml_model(
            {
                "nodes": [
                    {"id": "node-x", "data": {"name": "Uno"}},
                    {"id": "node-x", "data": {"name": "Dos"}},
                    {"id": "node-x", "data": {"name": "Tres"}},
                ]
            }
        )
        ids = [n["id"] for n in result.model["nodes"]]
        self.assertEqual(len(set(ids)), 3)

    def test_nodes_get_non_overlapping_default_positions(self):
        result = _normalize_uml_model(
            {"nodes": [{"data": {"name": f"C{i}"}} for i in range(7)]}
        )
        positions = {(n["position"]["x"], n["position"]["y"]) for n in result.model["nodes"]}
        self.assertEqual(len(positions), 7)

    def test_role_text_is_not_kept_as_attribute(self):
        result = _normalize_uml_model(
            {"nodes": [{"data": {"name": "A", "attributes": ["role a", "- x: int", "0..*", "1"]}}]}
        )
        attrs = [a["name"] for a in result.model["nodes"][0]["data"]["attributes"]]
        self.assertEqual(attrs, ["- x: int"])


class TestConfidence(unittest.TestCase):
    def test_confidence_is_lower_for_hollow_nodes_than_for_rich_nodes(self):
        result = _normalize_uml_model(
            {
                "nodes": [
                    {"id": "rich", "data": {"name": "Rica", "attributes": ["- a: int"], "methods": ["+ m(): void"]}},
                    {"id": "hollow", "data": {"name": "Hueca"}},
                ]
            }
        )
        self.assertGreater(result.confidence["rich"], result.confidence["hollow"])

    def test_model_supplied_confidence_is_preserved(self):
        result = _normalize_uml_model(
            {
                "model": {"nodes": [{"id": "node-a", "data": {"name": "A", "attributes": ["- a: int"]}}]},
                "confidence": {"node-a": 0.5},
            }
        )
        self.assertEqual(result.confidence["node-a"], 0.5)


class TestTruncatedAndNoisyJson(unittest.TestCase):
    def test_truncated_json_recovers_complete_classes(self):
        truncated = (
            '{"model":{"nodes":[{"id":"node-a","data":{"name":"A","attributes":[{"name":"+ x: int"}]}},'
            '{"id":"node-b","data":{"name":"B","attributes":[{"name":"+ y: int"'
        )
        result = _parse_vision_json(truncated)
        self.assertIsNotNone(result)
        self.assertIn("A", _names(result))

    def test_trailing_commas_are_tolerated(self):
        result = _parse_vision_json('{"nodes":[{"data":{"name":"A",}},],"edges":[],}')
        self.assertEqual(_names(result), ["A"])

    def test_single_quoted_python_dict(self):
        result = _parse_vision_json("{'nodes': [{'data': {'name': 'A'}}], 'edges': []}")
        self.assertEqual(_names(result), ["A"])

    def test_fence_without_language_tag(self):
        result = _parse_vision_json('```\n{"nodes":[{"data":{"name":"A"}}],"edges":[]}\n```')
        self.assertEqual(_names(result), ["A"])

    def test_pure_prose_returns_none(self):
        self.assertIsNone(_parse_vision_json("Lo siento, no puedo ver ninguna imagen."))


class TestValidationGate(unittest.TestCase):
    def _valid_model(self):
        return _normalize_uml_model(
            {
                "nodes": [{"data": {"name": "A"}}, {"data": {"name": "B"}}],
                "edges": [{"source": "A", "target": "B", "type": "inheritance"}],
            }
        ).model

    def test_normalized_model_passes(self):
        self.assertEqual(validate_vision_model(self._valid_model()), ([], []))

    def test_edge_to_missing_node_is_rejected(self):
        model = self._valid_model()
        model["edges"][0]["target"] = "node-inexistente"
        errors, offending = validate_vision_model(model)
        self.assertTrue(any("inexistente" in e for e in errors))
        self.assertIn(model["edges"][0]["id"], offending)

    def test_duplicate_node_ids_are_rejected(self):
        model = self._valid_model()
        model["nodes"][1]["id"] = model["nodes"][0]["id"]
        errors, _ = validate_vision_model(model)
        self.assertTrue(any("duplicate" in e.lower() for e in errors))


class TestVisionPrompt(unittest.TestCase):
    def test_states_edge_direction_convention(self):
        lowered = VISION_SYSTEM_INSTRUCTION.lower()
        self.assertIn("source", lowered)
        self.assertIn("subclass", lowered)
        self.assertIn("whole", lowered)

    def test_covers_hand_drawn_and_spanish_notation(self):
        lowered = VISION_SYSTEM_INSTRUCTION.lower()
        self.assertIn("hand-drawn", lowered)
        self.assertIn("spanish", lowered)

    def test_covers_abstract_italics_and_underlined_static(self):
        lowered = VISION_SYSTEM_INSTRUCTION.lower()
        self.assertIn("italic", lowered)
        self.assertIn("underline", lowered)

    def test_forbids_non_class_diagram_content(self):
        self.assertIn("class diagram", VISION_SYSTEM_INSTRUCTION.lower())


if __name__ == "__main__":
    unittest.main()
