"""
Unit tests for prompting.py: structured tool calling, deterministic auto-healing, and ModelDiff generation.
Executable via standard python -m unittest or pytest.
"""

import unittest
from src.services.prompting import (
    clean_element_name,
    serialize_model_context,
    build_uml_system_prompt,
    parse_and_validate_diff_payload,
    UML_ATOMIC_TOOLS,
    UML_DIFF_TOOL_SCHEMA,
)
from src.models.uml import ModelDiff


class TestPromptingAndDiff(unittest.TestCase):
    def test_clean_element_name(self):
        self.assertEqual(clean_element_name("Clase Cliente"), "Cliente")
        self.assertEqual(clean_element_name("Class Order"), "Order")
        self.assertEqual(clean_element_name("interface IStrategy"), "IStrategy")
        self.assertEqual(clean_element_name("enum Status"), "Status")
        self.assertEqual(clean_element_name("package Billing"), "Billing")
        self.assertEqual(clean_element_name("Factura"), "Factura")

    def test_serialize_model_context(self):
        model = {
            "nodes": [
                {
                    "id": "node-1",
                    "data": {
                        "name": "Cliente",
                        "attributes": [{"name": "+ id: String"}, {"name": "+ nombre: String"}],
                        "methods": [{"name": "+ getNombre(): String"}],
                    },
                }
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "type": "ClassBidirectional",
                    "source": "Cliente",
                    "target": "Factura",
                }
            ],
        }

        serialized = serialize_model_context(model)
        self.assertIn("Cliente", serialized)
        self.assertIn("+ id: String", serialized)
        self.assertIn("+ getNombre(): String", serialized)
        self.assertIn("ClassBidirectional", serialized)

    def test_parse_atomic_tool_create_class(self):
        tool_calls = [
            {
                "name": "create_class",
                "arguments": {
                    "name": "Clase Factura",
                    "type": "Class",
                    "stereotype": "<<abstract>>",
                    "attributes": ["+ total: Double"],
                    "methods": ["+ calcularTotal(): Double"],
                },
            }
        ]

        diff = parse_and_validate_diff_payload(tool_calls)
        self.assertIsInstance(diff, ModelDiff)
        self.assertIsNotNone(diff.add)
        self.assertEqual(len(diff.add.elements), 1)
        el = diff.add.elements[0]
        self.assertEqual(el.name, "Factura")  # cleaned
        self.assertEqual(el.type, "Class")
        self.assertEqual(el.stereotype, "<<abstract>>")
        self.assertEqual(el.attributes[0].name, "+ total: Double")
        self.assertEqual(el.methods[0].name, "+ calcularTotal(): Double")

    def test_parse_atomic_tool_add_attributes_and_methods(self):
        tool_calls = [
            {
                "name": "add_attributes",
                "arguments": {
                    "class_name": "Cliente",
                    "attributes": ["+ email: String", "- telefono: String"],
                },
            },
            {
                "name": "add_methods",
                "arguments": {
                    "class_name": "Cliente",
                    "methods": ["+ enviarEmail(msg: String): void"],
                },
            },
        ]

        diff = parse_and_validate_diff_payload(tool_calls)
        self.assertIsNotNone(diff.modify)
        self.assertEqual(len(diff.modify.elements), 2)
        attr_mod = next(m for m in diff.modify.elements if m.changes and m.changes.attributes)
        self.assertEqual(attr_mod.id, "Cliente")
        self.assertEqual(len(attr_mod.changes.attributes), 2)
        self.assertEqual(attr_mod.changes.attributes[0].name, "+ email: String")

        method_mod = next(m for m in diff.modify.elements if m.changes and m.changes.methods)
        self.assertEqual(method_mod.id, "Cliente")
        self.assertEqual(method_mod.changes.methods[0].name, "+ enviarEmail(msg: String): void")

    def test_parse_atomic_tool_remove_attributes(self):
        tool_calls = [
            {
                "name": "remove_attributes",
                "arguments": {
                    "class_name": "Cuenta",
                    "attributes": ["saldo"],
                },
            }
        ]

        diff = parse_and_validate_diff_payload(tool_calls)
        self.assertIsNotNone(diff.modify)
        self.assertEqual(len(diff.modify.elements), 1)
        self.assertEqual(diff.modify.elements[0].id, "Cuenta")
        self.assertEqual(diff.modify.elements[0].changes.removeAttributes, ["saldo"])
        self.assertIsNone(diff.remove)  # Ensures class was NOT marked for removal!

    def test_deterministic_healing_add_to_modify(self):
        current_model = {
            "nodes": [
                {
                    "id": "node-101",
                    "data": {"name": "Cliente", "attributes": [{"name": "+ id: String"}]},
                }
            ]
        }

        raw_json = {
            "add": {
                "elements": [
                    {
                        "name": "Clase Cliente",
                        "attributes": ["+ email: String"],
                    }
                ]
            }
        }

        diff = parse_and_validate_diff_payload(raw_json, current_model=current_model)
        # Since Cliente already exists, it must be converted to modify with canonical name
        self.assertIsNone(diff.add)
        self.assertIsNotNone(diff.modify)
        self.assertEqual(len(diff.modify.elements), 1)
        self.assertEqual(diff.modify.elements[0].id, "Cliente")
        self.assertEqual(diff.modify.elements[0].changes.attributes[0].name, "+ email: String")

    def test_deterministic_healing_strips_dummy_placeholders(self):
        raw_json = {
            "add": {
                "elements": [
                    {
                        "name": "Order",
                        "attributes": ["+ id: String", "+ attr: tipo", "attr: string"],
                        "methods": ["+ method(): void", "+ cancel(): void"],
                    }
                ]
            }
        }

        diff = parse_and_validate_diff_payload(raw_json)
        self.assertIsNotNone(diff.add)
        el = diff.add.elements[0]
        self.assertEqual(len(el.attributes), 1)
        self.assertEqual(el.attributes[0].name, "+ id: String")
        self.assertEqual(len(el.methods), 1)
        self.assertEqual(el.methods[0].name, "+ cancel(): void")

    def test_deterministic_remove_drops_nonexistent_classes(self):
        current_model = {
            "nodes": [
                {"id": "node-1", "data": {"name": "Factura"}},
            ]
        }

        raw_json = {
            "remove": {
                "elementIds": ["Factura", "Inexistente", "node", "class"],
            }
        }

        diff = parse_and_validate_diff_payload(raw_json, current_model=current_model)
        self.assertIsNotNone(diff.remove)
        # Factura resolved to Factura, Inexistente and generic keywords dropped
        self.assertEqual(diff.remove.elementIds, ["Factura"])

    def test_discards_noop_modifications_on_association_request(self):
        current_model = {
            "nodes": [
                {"id": "node-b73", "data": {"name": "Usuario"}},
                {"id": "node-8b0", "data": {"name": "Venta"}},
            ]
        }

        # Model output from Cloudflare Llama 3.1 that included spurious empty modify blocks
        raw_json = {
            "add": {
                "relationships": [
                    {
                        "type": "ClassBidirectional",
                        "source": "Usuario",
                        "target": "Venta",
                        "associationClass": "Usuario_Venta_Assoc",
                    }
                ]
            },
            "modify": {
                "elements": [
                    {"id": "Usuario", "changes": {"attributes": []}},
                    {"id": "Venta", "changes": {"attributes": []}},
                ]
            },
            "remove": {"elementIds": [], "relationshipIds": []},
        }

        diff = parse_and_validate_diff_payload(raw_json, current_model=current_model)
        # Empty modifications must be discarded!
        self.assertIsNone(diff.modify)
        self.assertIsNotNone(diff.add)
        self.assertEqual(len(diff.add.relationships), 1)
        self.assertEqual(diff.add.relationships[0].associationClass, "Usuario_Venta_Assoc")
        # Association class is synthesized in add.elements
        self.assertEqual(len(diff.add.elements), 1)
        self.assertEqual(diff.add.elements[0].name, "Usuario_Venta_Assoc")

    def test_discards_noop_modifications_when_name_unchanged(self):
        current_model = {
            "nodes": [
                {"id": "node-b73", "data": {"name": "Usuario"}},
                {"id": "node-8b0", "data": {"name": "Venta"}},
            ]
        }

        # When model returns modify blocks that only repeat the existing node's name
        raw_json = {
            "add": {
                "relationships": [
                    {
                        "type": "ClassBidirectional",
                        "source": "Usuario",
                        "target": "Venta",
                    }
                ]
            },
            "modify": {
                "elements": [
                    {"id": "node-b73", "changes": {"name": "Usuario"}},
                    {"id": "node-8b0", "changes": {"name": "Venta"}},
                ]
            },
        }

        diff = parse_and_validate_diff_payload(raw_json, current_model=current_model)
        self.assertIsNone(diff.modify)
        self.assertIsNotNone(diff.add)
        self.assertEqual(len(diff.add.relationships), 1)

    def test_user_prompt_add_two_attributes_to_class(self):
        current_model = {
            "nodes": [
                {"id": "node-user", "data": {"name": "Usuario", "attributes": [{"name": "+ id: String"}]}},
            ]
        }

        # Tool call as generated by Qwen/Llama with function calling
        tool_calls = [
            {
                "name": "add_attributes",
                "arguments": {
                    "class_name": "la clase usuario",
                    "attributes": ["nombre de tipo string", "apellido de tipo string"],
                },
            }
        ]

        diff = parse_and_validate_diff_payload(tool_calls, current_model=current_model)
        self.assertIsNotNone(diff.modify)
        self.assertEqual(len(diff.modify.elements), 1)
        mod = diff.modify.elements[0]
        self.assertEqual(mod.id, "Usuario")  # canonical name resolved
        self.assertEqual(len(mod.changes.attributes), 2)
        self.assertEqual(mod.changes.attributes[0].name, "+ nombre: string")
        self.assertEqual(mod.changes.attributes[1].name, "+ apellido: string")

    def test_bundled_comma_attributes_expansion(self):
        tool_calls = [
            {
                "name": "add_attributes",
                "arguments": {
                    "class_name": "Usuario",
                    "attributes": ["nombre: String, apellido: String"],
                },
            }
        ]

        diff = parse_and_validate_diff_payload(tool_calls)
        self.assertIsNotNone(diff.modify)
        mod = diff.modify.elements[0]
        self.assertEqual(len(mod.changes.attributes), 2)
        self.assertEqual(mod.changes.attributes[0].name, "+ nombre: String")
        self.assertEqual(mod.changes.attributes[1].name, "+ apellido: String")

    def test_natural_language_attribute_prefix_cleaning(self):
        tool_calls = [
            {
                "name": "add_attributes",
                "arguments": {
                    "class_name": "Cliente",
                    "attributes": [
                        "agrega el atributo telefono: String",
                        "incluye el campo email de tipo string",
                    ],
                },
            }
        ]

        diff = parse_and_validate_diff_payload(tool_calls)
        self.assertIsNotNone(diff.modify)
        mod = diff.modify.elements[0]
        self.assertEqual(len(mod.changes.attributes), 2)
        self.assertEqual(mod.changes.attributes[0].name, "+ telefono: String")
        self.assertEqual(mod.changes.attributes[1].name, "+ email: string")

    def test_regex_intent_redirects_class_deletion_to_attribute_removal(self):
        current_model = {
            "nodes": [
                {
                    "id": "node-1",
                    "data": {
                        "name": "Cliente",
                        "attributes": [{"name": "+ id: int"}, {"name": "+ direccion: String"}],
                    },
                }
            ]
        }

        # Model mistakenly emitted remove.elementIds: ["Cliente"] when user asked to delete attribute
        raw_json = {
            "remove": {
                "elementIds": ["Cliente"],
            }
        }

        diff = parse_and_validate_diff_payload(
            raw_json,
            user_prompt="elimina el atributo direccion de la clase Cliente",
            current_model=current_model,
        )

        # Class deletion must be intercepted and redirected to attribute removal
        self.assertIsNone(diff.remove)
        self.assertIsNotNone(diff.modify)
        self.assertEqual(len(diff.modify.elements), 1)
        mod = diff.modify.elements[0]
        self.assertEqual(mod.id, "Cliente")
        self.assertEqual(mod.changes.removeAttributes, ["direccion"])

    def test_minus_prefix_attribute_converted_to_remove_attributes(self):
        raw_json = {
            "modify": {
                "elements": [
                    {
                        "id": "Cuenta",
                        "changes": {
                            "attributes": ["- saldo: Double"],
                        },
                    }
                ]
            }
        }

        diff = parse_and_validate_diff_payload(
            raw_json,
            user_prompt="elimina el atributo saldo de la clase Cuenta",
        )

        self.assertIsNotNone(diff.modify)
        mod = diff.modify.elements[0]
        self.assertEqual(mod.id, "Cuenta")
        self.assertIn("saldo", mod.changes.removeAttributes)

    def test_user_prompt_add_two_attributes_natural_language_phrase(self):
        current_model = {
            "nodes": [
                {"id": "node-user", "data": {"name": "Usuario", "attributes": [{"name": "+ id: String"}]}},
            ]
        }

        tool_calls = [
            {
                "name": "add_attributes",
                "arguments": {
                    "class_name": "la clase usuario",
                    "attributes": ["dos atributos llamados nombre y apellido de tipo string"],
                },
            }
        ]

        diff = parse_and_validate_diff_payload(
            tool_calls,
            user_prompt="Agrega dos atributos llamados nombre y apellido de tipo string a la clase usuario",
            current_model=current_model,
        )
        self.assertIsNotNone(diff.modify)
        self.assertEqual(len(diff.modify.elements), 1)
        mod = diff.modify.elements[0]
        self.assertEqual(mod.id, "Usuario")
        self.assertEqual(len(mod.changes.attributes), 2)
        self.assertEqual(mod.changes.attributes[0].name, "+ nombre: string")
        self.assertEqual(mod.changes.attributes[1].name, "+ apellido: string")

    def test_structured_object_attributes_in_add_attributes(self):
        current_model = {
            "nodes": [
                {"id": "node-user", "data": {"name": "Usuario", "attributes": [{"name": "+ id: String"}]}},
            ]
        }

        tool_calls = [
            {
                "name": "add_attributes",
                "arguments": {
                    "class_name": "Usuario",
                    "attributes": [
                        {"name": "nombre", "type": "String", "visibility": "public"},
                        {"name": "apellido", "type": "String", "visibility": "public"},
                    ],
                },
            }
        ]

        diff = parse_and_validate_diff_payload(tool_calls, current_model=current_model)
        self.assertIsNotNone(diff.modify)
        mod = diff.modify.elements[0]
        self.assertEqual(mod.id, "Usuario")
        self.assertEqual(len(mod.changes.attributes), 2)
        self.assertEqual(mod.changes.attributes[0].name, "+ nombre: String")
        self.assertEqual(mod.changes.attributes[1].name, "+ apellido: String")

    def test_empty_attributes_fallback_to_user_prompt(self):
        current_model = {
            "nodes": [
                {"id": "node-user", "data": {"name": "Usuario", "attributes": [{"name": "+ id: String"}]}},
            ]
        }

        tool_calls = [
            {
                "name": "add_attributes",
                "arguments": {
                    "class_name": "Usuario",
                    "attributes": [],
                },
            }
        ]

        diff = parse_and_validate_diff_payload(
            tool_calls,
            user_prompt="Agrega dos atributos llamados nombre y apellido de tipo string a la clase usuario",
            current_model=current_model,
        )
        self.assertIsNotNone(diff.modify)
        mod = diff.modify.elements[0]
        self.assertEqual(mod.id, "Usuario")
        self.assertEqual(len(mod.changes.attributes), 2)
        self.assertEqual(mod.changes.attributes[0].name, "+ nombre: string")
        self.assertEqual(mod.changes.attributes[1].name, "+ apellido: string")

    def test_serialized_json_attributes_unpacking_prevents_schema_leak(self):
        # Simulates real Cloudflare Workers AI output with serialized json string in attributes
        current_model = {
            "nodes": [
                {"id": "node-user", "data": {"name": "Usuario", "attributes": []}},
            ]
        }
        tool_calls = [
            {
                "name": "add_attributes",
                "arguments": {
                    "class_name": "Usuario",
                    "attributes": '[{"name": "nombre", "type": "String", "visibility": "public"}]',
                },
            }
        ]

        diff = parse_and_validate_diff_payload(tool_calls, current_model=current_model)
        self.assertIsNotNone(diff.modify)
        mod = diff.modify.elements[0]
        self.assertEqual(mod.id, "Usuario")
        # Must have exactly 1 attribute '+ nombre: String', NEVER '+ name', '+ type', '+ visibility'
        self.assertEqual(len(mod.changes.attributes), 1)
        self.assertEqual(mod.changes.attributes[0].name, "+ nombre: String")
        attr_names = [a.name.lower() for a in mod.changes.attributes]
        self.assertNotIn("+ name", attr_names)
        self.assertNotIn("+ type", attr_names)
        self.assertNotIn("+ visibility", attr_names)

    def test_association_class_auto_creates_normal_endpoint_classes(self):
        # When creating an association class between non-existent classes, normal classes must be created
        current_model = {"nodes": []}
        tool_calls = [
            {
                "name": "create_relationship",
                "arguments": {
                    "source": "Estudiante",
                    "target": "Curso",
                    "associationClass": "Inscripcion",
                    "type": "ClassBidirectional",
                },
            }
        ]

        diff = parse_and_validate_diff_payload(tool_calls, current_model=current_model)
        self.assertIsNotNone(diff.add)
        self.assertIsNotNone(diff.add.elements)
        # Must have 3 classes: Estudiante (normal), Curso (normal), Inscripcion (association)
        elem_names = {e.name: e for e in diff.add.elements}
        self.assertIn("Estudiante", elem_names)
        self.assertIn("Curso", elem_names)
        self.assertIn("Inscripcion", elem_names)
        self.assertIsNone(elem_names["Estudiante"].stereotype)
        self.assertIsNone(elem_names["Curso"].stereotype)
        self.assertEqual(elem_names["Inscripcion"].stereotype, "<<association>>")

    def test_anti_example_copying_filter(self):
        # If user asks to create 'Vehiculo' and LLM hallucinates 'ConcreteStrategyA' from examples
        raw_diff = {
            "add": {
                "elements": [
                    {"name": "Vehiculo", "type": "Class"},
                    {"name": "ConcreteStrategyA", "type": "Class"},
                ],
                "relationships": [
                    {"type": "ClassInheritance", "source": "ConcreteStrategyA", "target": "Strategy"}
                ],
            }
        }
        diff = parse_and_validate_diff_payload(raw_diff, user_prompt="Crea una clase Vehiculo")
        self.assertIsNotNone(diff.add)
        elem_names = [e.name for e in diff.add.elements]
        self.assertIn("Vehiculo", elem_names)
        self.assertNotIn("ConcreteStrategyA", elem_names)


    def test_remove_elements_stringified_list(self):
        current_model = {
            "nodes": [
                {"id": "node-v", "data": {"name": "Venta"}},
                {"id": "node-p", "data": {"name": "Producto"}},
            ]
        }
        tool_calls = [
            {"name": "remove_elements", "arguments": {"element_names": "['Producto']"}}
        ]
        diff = parse_and_validate_diff_payload(tool_calls, user_prompt="Elimina la clase producto", current_model=current_model)
        self.assertIsNotNone(diff.remove)
        self.assertIsNotNone(diff.remove.elementIds)
        self.assertIn("Producto", diff.remove.elementIds)

    def test_remove_attributes_stringified_list(self):
        current_model = {
            "nodes": [
                {"id": "node-u", "data": {"name": "Usuario", "attributes": [{"name": "+ nombre: String"}]}}
            ]
        }
        tool_calls = [
            {"name": "remove_attributes", "arguments": {"class_name": "Usuario", "attribute_names": "['nombre']"}}
        ]
        diff = parse_and_validate_diff_payload(tool_calls, user_prompt="Elimina el atributo nombre de la clase usuario", current_model=current_model)
        self.assertIsNotNone(diff.modify)
        self.assertEqual(len(diff.modify.elements), 1)
        self.assertEqual(diff.modify.elements[0].id, "Usuario")
        self.assertEqual(diff.modify.elements[0].changes.removeAttributes, ["nombre"])


if __name__ == "__main__":
    unittest.main()

