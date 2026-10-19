"""
Complex natural-language prompts: relationship ends (multiplicity/roles), alias
normalization, generative guidance in the system prompt, the diff quality gate and
the repair loop of the text pipeline.
"""

import asyncio
import unittest
from unittest.mock import patch

from src.core.uml_text import normalize_multiplicity, normalize_relationship_type
from src.models.uml import ModelDiff, DiffAddBlock, DiffElementAdd, DiffRelationshipAdd
from src.services.diff_quality import assess_diff, is_complex_prompt, build_repair_feedback
from src.services.pipeline import AIPipeline
from src.services.prompting import build_uml_system_prompt, parse_and_validate_diff_payload


class TestMultiplicityNormalization(unittest.TestCase):
    def test_spoken_and_alias_values(self):
        cases = {
            "1": "1",
            "uno": "1",
            "one": "1",
            "muchos": "*",
            "many": "*",
            "n": "*",
            "*": "*",
            "0..n": "0..*",
            "1..n": "1..*",
            "0..*": "0..*",
            "cero o uno": "0..1",
            "uno o mas": "1..*",
            "uno o más": "1..*",
            "cero o mas": "0..*",
            "cero o muchos": "0..*",
            "al menos uno": "1..*",
            "opcional": "0..1",
            " 1..* ": "1..*",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize_multiplicity(raw), expected)

    def test_empty_and_garbage_return_none(self):
        for raw in (None, "", "   ", "foo bar baz", 3.5):
            with self.subTest(raw=raw):
                self.assertIsNone(normalize_multiplicity(raw))

    def test_integer_is_accepted(self):
        self.assertEqual(normalize_multiplicity(1), "1")


class TestRelationshipTypeNormalization(unittest.TestCase):
    def test_aliases(self):
        self.assertEqual(normalize_relationship_type("association"), "ClassBidirectional")
        self.assertEqual(normalize_relationship_type("herencia"), "ClassInheritance")
        self.assertEqual(normalize_relationship_type("Composición"), "ClassComposition")
        self.assertEqual(normalize_relationship_type("implements"), "ClassRealization")
        self.assertEqual(normalize_relationship_type("ClassAggregation"), "ClassAggregation")

    def test_unknown_defaults_to_association(self):
        self.assertEqual(normalize_relationship_type("zzz"), "ClassBidirectional")
        self.assertEqual(normalize_relationship_type(None), "ClassBidirectional")


class TestRelationshipEndsSurviveParsing(unittest.TestCase):
    def test_create_relationship_tool_keeps_multiplicities_and_roles(self):
        diff = parse_and_validate_diff_payload(
            [
                {"name": "create_class", "arguments": {"name": "Cliente"}},
                {"name": "create_class", "arguments": {"name": "Pedido"}},
                {
                    "name": "create_relationship",
                    "arguments": {
                        "type": "association",
                        "source": "Cliente",
                        "target": "Pedido",
                        "sourceMultiplicity": "uno",
                        "targetMultiplicity": "muchos",
                        "sourceRole": "comprador",
                        "targetRole": "pedidos",
                        "name": "realiza",
                    },
                },
            ],
            user_prompt="un cliente realiza muchos pedidos",
            current_model={},
        )
        rel = diff.add.relationships[0]
        self.assertEqual(rel.type, "ClassBidirectional")
        self.assertEqual(rel.sourceMultiplicity, "1")
        self.assertEqual(rel.targetMultiplicity, "*")
        self.assertEqual(rel.sourceRole, "comprador")
        self.assertEqual(rel.targetRole, "pedidos")
        self.assertEqual(rel.name, "realiza")

    def test_json_add_block_keeps_ends_and_normalizes_type(self):
        diff = parse_and_validate_diff_payload(
            {
                "add": {
                    "elements": [{"name": "Curso"}, {"name": "Alumno"}],
                    "relationships": [
                        {
                            "type": "composición",
                            "source": "Curso",
                            "target": "Alumno",
                            "source_multiplicity": "1",
                            "target_multiplicity": "1..n",
                        }
                    ],
                }
            },
            user_prompt="un curso se compone de al menos un alumno",
            current_model={},
        )
        rel = diff.add.relationships[0]
        self.assertEqual(rel.type, "ClassComposition")
        self.assertEqual(rel.sourceMultiplicity, "1")
        self.assertEqual(rel.targetMultiplicity, "1..*")

    def test_alternative_endpoint_keys(self):
        diff = parse_and_validate_diff_payload(
            [
                {
                    "name": "create_relationship",
                    "arguments": {
                        "type": "inheritance",
                        "from": "Gerente",
                        "to": "Empleado",
                    },
                }
            ],
            user_prompt="un gerente es un empleado",
            current_model={},
        )
        rel = diff.add.relationships[0]
        self.assertEqual((rel.type, rel.source, rel.target), ("ClassInheritance", "Gerente", "Empleado"))


class TestSystemPromptGuidance(unittest.TestCase):
    def setUp(self):
        self.prompt = build_uml_system_prompt({"nodes": [], "edges": []})

    def test_has_generative_modeling_section(self):
        self.assertIn("MODELADO GENERATIVO", self.prompt)

    def test_teaches_multiplicity_cues(self):
        for cue in ("0..*", "1..*", "muchos a muchos"):
            self.assertIn(cue, self.prompt)

    def test_teaches_relationship_cue_mapping(self):
        lowered = self.prompt.lower()
        for cue in ("es un", "se compone de", "implementa"):
            self.assertIn(cue, lowered)

    def test_tool_schemas_expose_relationship_ends(self):
        from src.services.prompting import UML_ATOMIC_TOOLS, UML_DIFF_TOOL_SCHEMA

        create_rel = next(
            t for t in UML_ATOMIC_TOOLS if t["function"]["name"] == "create_relationship"
        )
        props = create_rel["function"]["parameters"]["properties"]
        for key in ("sourceMultiplicity", "targetMultiplicity", "sourceRole", "targetRole", "name"):
            self.assertIn(key, props)
        add_rel = UML_DIFF_TOOL_SCHEMA["parameters"]["properties"]["add"]["properties"][
            "relationships"
        ]["items"]["properties"]
        for key in ("sourceMultiplicity", "targetMultiplicity"):
            self.assertIn(key, add_rel)


def _diff(elements, relationships=()):
    return ModelDiff(
        add=DiffAddBlock(
            elements=[DiffElementAdd(**e) for e in elements],
            relationships=[DiffRelationshipAdd(**r) for r in relationships],
        )
    )


LONG_PROMPT = (
    "Necesito un sistema de biblioteca donde los socios piden prestados libros, "
    "cada libro tiene autores y puede haber varias copias, y los préstamos tienen fecha de devolución"
)


class TestQualityGate(unittest.TestCase):
    def test_is_complex_prompt(self):
        self.assertTrue(is_complex_prompt(LONG_PROMPT))
        self.assertFalse(is_complex_prompt("Agrega atributo email a Cliente"))

    def test_is_complex_prompt_heuristic_table(self):
        cases = [
            (
                "Agrega a la clase Cliente los atributos nombre: String, email: String, telefono: String y direccion: String",
                False,
            ),
            (
                "Renombra la clase Cliente a Usuario y cambia el tipo del atributo email de String a Text en todo el modelo",
                False,
            ),
            ("Elimina la clase Pedido y todas sus relaciones con las demás clases del diagrama actual", False),
            ("Crea un sistema de gestión de biblioteca con libros y socios", True),
            ("Crea una clase", False),
            ("Crea un sistema", False),
            (LONG_PROMPT, True),
        ]
        for prompt, expected in cases:
            with self.subTest(prompt=prompt):
                self.assertEqual(is_complex_prompt(prompt), expected)

    def test_empty_diff_for_real_prompt_is_flagged(self):
        issues = assess_diff(LONG_PROMPT, ModelDiff(), {})
        self.assertTrue(any("vacío" in i.lower() for i in issues))

    def test_too_few_classes_for_complex_prompt(self):
        diff = _diff([{"name": "Libro", "attributes": [{"name": "+ titulo: String"}]}])
        issues = assess_diff(LONG_PROMPT, diff, {})
        self.assertTrue(any("pocas clases" in i.lower() for i in issues))

    def test_many_classes_without_relationships_is_flagged(self):
        diff = _diff(
            [
                {"name": "Libro", "attributes": [{"name": "+ titulo: String"}]},
                {"name": "Socio", "attributes": [{"name": "+ nombre: String"}]},
                {"name": "Prestamo", "attributes": [{"name": "+ fecha: Date"}]},
            ]
        )
        issues = assess_diff(LONG_PROMPT, diff, {})
        self.assertTrue(any("relacion" in i.lower() for i in issues))

    def test_bare_classes_are_flagged(self):
        diff = _diff(
            [{"name": "Libro"}, {"name": "Socio"}, {"name": "Prestamo"}],
            [
                {"type": "ClassBidirectional", "source": "Socio", "target": "Prestamo"},
                {"type": "ClassBidirectional", "source": "Prestamo", "target": "Libro"},
            ],
        )
        issues = assess_diff(LONG_PROMPT, diff, {})
        self.assertTrue(any("atributos" in i.lower() for i in issues))

    def test_self_loop_and_duplicates_are_flagged(self):
        diff = _diff(
            [{"name": "A", "attributes": [{"name": "+ x: int"}]}, {"name": "a"}],
            [{"type": "ClassBidirectional", "source": "A", "target": "A"}],
        )
        issues = assess_diff("Crea clases A y a con una relación", diff, {})
        joined = " ".join(issues).lower()
        self.assertIn("duplicad", joined)
        self.assertIn("a sí misma", joined)

    def test_good_diff_has_no_issues(self):
        diff = _diff(
            [
                {"name": "Libro", "attributes": [{"name": "+ titulo: String"}]},
                {"name": "Socio", "attributes": [{"name": "+ nombre: String"}]},
                {"name": "Prestamo", "attributes": [{"name": "+ fecha: Date"}]},
                {"name": "Autor", "attributes": [{"name": "+ nombre: String"}]},
            ],
            [
                {
                    "type": "ClassBidirectional",
                    "source": "Socio",
                    "target": "Prestamo",
                    "sourceMultiplicity": "1",
                    "targetMultiplicity": "0..*",
                },
                {"type": "ClassBidirectional", "source": "Prestamo", "target": "Libro"},
                {"type": "ClassBidirectional", "source": "Libro", "target": "Autor"},
            ],
        )
        self.assertEqual(assess_diff(LONG_PROMPT, diff, {}), [])

    def test_simple_precise_edit_is_never_flagged_as_too_small(self):
        diff = _diff([{"name": "Vendedor"}])
        self.assertEqual(assess_diff("Agrega una clase Vendedor", diff, {}), [])

    def test_delete_only_diff_is_not_empty(self):
        from src.models.uml import DiffRemoveBlock

        diff = ModelDiff(remove=DiffRemoveBlock(elementIds=["Usuario"]))
        self.assertEqual(assess_diff("Elimina la clase Usuario", diff, {"nodes": [{"id": "Usuario", "data": {"name": "Usuario"}}]}), [])

    def test_repair_feedback_lists_every_issue(self):
        feedback = build_repair_feedback(["problema uno", "problema dos"])
        self.assertIn("problema uno", feedback)
        self.assertIn("problema dos", feedback)


class _ScriptedAdapter:
    provider_name = "scripted"

    def __init__(self, diffs):
        self._diffs = list(diffs)
        self.prompts = []

    async def generate_diff(self, prompt, current_model):
        self.prompts.append(prompt)
        return self._diffs.pop(0)


class TestPipelineRepairLoop(unittest.TestCase):
    def _run(self, adapter, prompt=LONG_PROMPT):
        with patch("src.adapters.get_adapter", return_value=adapter):
            return asyncio.run(AIPipeline.process_text(prompt, {}, None))

    def test_retries_once_with_feedback_and_keeps_the_better_diff(self):
        weak = _diff([{"name": "Libro"}])
        strong = _diff(
            [
                {"name": "Libro", "attributes": [{"name": "+ titulo: String"}]},
                {"name": "Socio", "attributes": [{"name": "+ nombre: String"}]},
                {"name": "Prestamo", "attributes": [{"name": "+ fecha: Date"}]},
                {"name": "Autor", "attributes": [{"name": "+ nombre: String"}]},
            ],
            [
                {"type": "ClassBidirectional", "source": "Socio", "target": "Prestamo"},
                {"type": "ClassBidirectional", "source": "Prestamo", "target": "Libro"},
                {"type": "ClassBidirectional", "source": "Libro", "target": "Autor"},
            ],
        )
        adapter = _ScriptedAdapter([weak, strong])
        response = self._run(adapter)
        self.assertEqual(len(adapter.prompts), 2)
        self.assertIn(LONG_PROMPT, adapter.prompts[1])
        self.assertIn("REVISIÓN AUTOMÁTICA", adapter.prompts[1])
        self.assertEqual(len(response.diff.add.elements), 4)

    def test_never_returns_a_worse_diff_than_the_first(self):
        first = _diff(
            [
                {"name": "Libro", "attributes": [{"name": "+ titulo: String"}]},
                {"name": "Socio", "attributes": [{"name": "+ nombre: String"}]},
            ],
            [{"type": "ClassBidirectional", "source": "Socio", "target": "Libro"}],
        )
        second = ModelDiff()
        adapter = _ScriptedAdapter([first, second])
        response = self._run(adapter)
        self.assertEqual(len(response.diff.add.elements), 2)

    def test_retry_failure_keeps_first_result(self):
        class _Flaky(_ScriptedAdapter):
            async def generate_diff(self, prompt, current_model):
                if self.prompts:
                    self.prompts.append(prompt)
                    raise RuntimeError("provider down")
                return await super().generate_diff(prompt, current_model)

        adapter = _Flaky([_diff([{"name": "Libro"}])])
        response = self._run(adapter)
        self.assertEqual(response.diff.add.elements[0].name, "Libro")

    def test_good_first_answer_is_not_retried(self):
        good = _diff(
            [{"name": "Vendedor", "attributes": [{"name": "+ nombre: String"}]}]
        )
        adapter = _ScriptedAdapter([good])
        self._run(adapter, prompt="Agrega una clase Vendedor")
        self.assertEqual(len(adapter.prompts), 1)


class TestRelationshipSanity(unittest.TestCase):
    def _parse(self, rels, elements=None, prompt="un sistema con varias clases relacionadas entre sí"):
        return parse_and_validate_diff_payload(
            {"add": {"elements": elements or [], "relationships": rels}},
            user_prompt=prompt,
            current_model={},
        )

    def test_inheritance_realization_and_dependency_carry_no_multiplicities(self):
        for rel_type in ("ClassInheritance", "ClassRealization", "ClassDependency"):
            with self.subTest(rel_type=rel_type):
                diff = self._parse(
                    [
                        {
                            "type": rel_type,
                            "source": "A",
                            "target": "B",
                            "sourceMultiplicity": "1",
                            "targetMultiplicity": "1",
                            "sourceRole": "x",
                        }
                    ]
                )
                rel = diff.add.relationships[0]
                self.assertIsNone(rel.sourceMultiplicity)
                self.assertIsNone(rel.targetMultiplicity)
                self.assertIsNone(rel.sourceRole)

    def test_associations_keep_their_multiplicities(self):
        diff = self._parse(
            [{"type": "ClassComposition", "source": "A", "target": "B", "targetMultiplicity": "1..*"}]
        )
        self.assertEqual(diff.add.relationships[0].targetMultiplicity, "1..*")

    def test_interface_as_source_of_realization_is_swapped(self):
        diff = self._parse(
            [{"type": "ClassRealization", "source": "Pagable", "target": "Factura"}],
            elements=[
                {"name": "Pagable", "stereotype": "<<interface>>"},
                {"name": "Factura"},
            ],
        )
        rel = diff.add.relationships[0]
        self.assertEqual((rel.source, rel.target), ("Factura", "Pagable"))

    def test_correct_realization_is_left_alone(self):
        diff = self._parse(
            [{"type": "ClassRealization", "source": "Factura", "target": "Pagable"}],
            elements=[
                {"name": "Pagable", "stereotype": "<<interface>>"},
                {"name": "Factura"},
            ],
        )
        rel = diff.add.relationships[0]
        self.assertEqual((rel.source, rel.target), ("Factura", "Pagable"))

    def test_relationship_reading_phrases_are_in_the_prompt_and_tool(self):
        prompt = build_uml_system_prompt({"nodes": [], "edges": []})
        self.assertIn("LECTURA", prompt)
        self.assertIn("source HEREDA DE target", prompt)
        from src.services.prompting import UML_ATOMIC_TOOLS

        create_rel = next(t for t in UML_ATOMIC_TOOLS if t["function"]["name"] == "create_relationship")
        self.assertIn("hereda de", create_rel["function"]["description"].lower())


TALLER_COPY = [
    {"name": "Cliente", "attributes": [{"name": "+ nombre: String"}]},
    {"name": "Vehiculo", "stereotype": "<<abstract>>", "attributes": [{"name": "- placa: String"}]},
    {"name": "Auto", "attributes": [{"name": "+ numeroPuertas: int"}]},
    {"name": "Moto", "attributes": [{"name": "+ cilindrada: int"}]},
    {"name": "OrdenTrabajo", "attributes": [{"name": "- numero: int"}]},
    {"name": "Servicio", "attributes": [{"name": "+ costo: Double"}]},
    {"name": "EstadoOrden", "stereotype": "<<enumeration>>", "attributes": [{"name": "+ PENDIENTE"}]},
]
TALLER_RELS = [
    {"type": "ClassInheritance", "source": "Auto", "target": "Vehiculo"},
    {"type": "ClassComposition", "source": "OrdenTrabajo", "target": "Servicio"},
    {"type": "ClassBidirectional", "source": "Cliente", "target": "Vehiculo"},
]
OBSERVER_PROMPT = (
    "Implementa el patrón Observer para notificar a los suscriptores cuando cambia el precio de una acción"
)


class TestExampleCopyDetection(unittest.TestCase):
    def test_copied_example_classes_are_stripped_and_flagged(self):
        from src.services.diff_quality import strip_example_copies

        diff = _diff(TALLER_COPY, TALLER_RELS)
        cleaned, removed = strip_example_copies(OBSERVER_PROMPT, diff, {})
        self.assertGreaterEqual(len(removed), 5)
        self.assertIsNone(cleaned.add)
        self.assertTrue(any("ejemplo" in i.lower() for i in assess_diff(OBSERVER_PROMPT, diff, {})))

    def test_example_names_the_user_actually_mentioned_are_kept(self):
        from src.services.diff_quality import strip_example_copies

        prompt = (
            "Modela un taller mecánico con clientes, vehículos (autos y motos), órdenes de trabajo "
            "y los servicios que se realizan en cada orden"
        )
        diff = _diff(TALLER_COPY, TALLER_RELS)
        cleaned, removed = strip_example_copies(prompt, diff, {})
        self.assertEqual(removed, [])
        self.assertEqual(len(cleaned.add.elements), 7)

    def test_a_couple_of_generic_names_are_not_a_copy(self):
        from src.services.diff_quality import strip_example_copies

        diff = _diff(
            [
                {"name": "Cliente", "attributes": [{"name": "+ nombre: String"}]},
                {"name": "Factura", "attributes": [{"name": "+ total: Double"}]},
                {"name": "Pago", "attributes": [{"name": "+ monto: Double"}]},
                {"name": "Auto", "attributes": [{"name": "+ placa: String"}]},
            ]
        )
        _, removed = strip_example_copies("Sistema de facturación con pagos", diff, {})
        self.assertEqual(removed, [])

    def test_pipeline_recovers_from_a_copied_example(self):
        good = _diff(
            [
                {"name": "Accion", "attributes": [{"name": "+ precio: Double"}], "methods": [{"name": "+ notificar(): void"}]},
                {"name": "Observador", "stereotype": "<<interface>>", "methods": [{"name": "+ actualizar(precio: Double): void"}]},
                {"name": "Suscriptor", "attributes": [{"name": "+ nombre: String"}]},
            ],
            [
                {"type": "ClassAggregation", "source": "Accion", "target": "Observador"},
                {"type": "ClassRealization", "source": "Suscriptor", "target": "Observador"},
            ],
        )
        adapter = _ScriptedAdapter([_diff(TALLER_COPY, TALLER_RELS), good])
        with patch("src.adapters.get_adapter", return_value=adapter):
            response = asyncio.run(AIPipeline.process_text(OBSERVER_PROMPT, {}, None))
        self.assertEqual(len(adapter.prompts), 2)
        self.assertIn("ejemplo", adapter.prompts[1].lower())
        self.assertEqual(
            [e.name for e in response.diff.add.elements], ["Accion", "Observador", "Suscriptor"]
        )

    def test_copy_with_no_retry_possible_returns_empty_diff_not_garbage(self):
        class _Once(_ScriptedAdapter):
            async def generate_diff(self, prompt, current_model):
                if self.prompts:
                    raise RuntimeError("down")
                return await super().generate_diff(prompt, current_model)

        adapter = _Once([_diff(TALLER_COPY, TALLER_RELS)])
        with patch("src.adapters.get_adapter", return_value=adapter):
            response = asyncio.run(AIPipeline.process_text(OBSERVER_PROMPT, {}, None))
        self.assertFalse(response.diff.add and response.diff.add.elements)


class TestInvertedInheritanceSmell(unittest.TestCase):
    def test_parent_listed_as_source_of_several_inheritances_is_flagged(self):
        diff = _diff(
            [
                {"name": "Medico", "attributes": [{"name": "+ nombre: String"}]},
                {"name": "Cirujano", "attributes": [{"name": "+ quirofano: String"}]},
                {"name": "Clinico", "attributes": [{"name": "+ consultorio: String"}]},
            ],
            [
                {"type": "ClassInheritance", "source": "Medico", "target": "Cirujano"},
                {"type": "ClassInheritance", "source": "Medico", "target": "Clinico"},
            ],
        )
        issues = assess_diff("Los médicos pueden ser cirujanos o clínicos", diff, {})
        self.assertTrue(any("invertid" in i.lower() for i in issues))

    def test_correct_hierarchy_is_not_flagged(self):
        diff = _diff(
            [
                {"name": "Medico", "attributes": [{"name": "+ nombre: String"}]},
                {"name": "Cirujano", "attributes": [{"name": "+ quirofano: String"}]},
                {"name": "Clinico", "attributes": [{"name": "+ consultorio: String"}]},
            ],
            [
                {"type": "ClassInheritance", "source": "Cirujano", "target": "Medico"},
                {"type": "ClassInheritance", "source": "Clinico", "target": "Medico"},
            ],
        )
        issues = assess_diff("Los médicos pueden ser cirujanos o clínicos", diff, {})
        self.assertFalse(any("invertid" in i.lower() for i in issues))

    def test_class_implementing_two_interfaces_is_legitimate(self):
        diff = _diff(
            [
                {"name": "Factura", "attributes": [{"name": "+ total: Double"}]},
                {"name": "Pagable", "stereotype": "<<interface>>", "methods": [{"name": "+ pagar(): void"}]},
                {"name": "Imprimible", "stereotype": "<<interface>>", "methods": [{"name": "+ imprimir(): void"}]},
            ],
            [
                {"type": "ClassRealization", "source": "Factura", "target": "Pagable"},
                {"type": "ClassRealization", "source": "Factura", "target": "Imprimible"},
            ],
        )
        issues = assess_diff("Una factura es pagable e imprimible", diff, {})
        self.assertFalse(any("invertid" in i.lower() for i in issues))


class TestEmptyResultMessage(unittest.TestCase):
    def test_empty_result_explains_itself(self):
        adapter = _ScriptedAdapter([ModelDiff(), ModelDiff()])
        with patch("src.adapters.get_adapter", return_value=adapter):
            response = asyncio.run(AIPipeline.process_text(LONG_PROMPT, {}, None))
        self.assertIn("no pudo interpretar", response.message.lower())

    def test_non_empty_result_keeps_the_summary_message(self):
        good = _diff([{"name": "Vendedor", "attributes": [{"name": "+ nombre: String"}]}])
        adapter = _ScriptedAdapter([good])
        with patch("src.adapters.get_adapter", return_value=adapter):
            response = asyncio.run(AIPipeline.process_text("Agrega una clase Vendedor", {}, None))
        self.assertIn("1 clase", response.message)


class TestMissingMultiplicityGate(unittest.TestCase):
    PROMPT = "Una cita une a un paciente con un médico y un paciente puede tener muchas citas"

    def _diff(self, **ends):
        return _diff(
            [
                {"name": "Paciente", "attributes": [{"name": "+ nombre: String"}]},
                {"name": "Cita", "attributes": [{"name": "+ fecha: Date"}]},
            ],
            [{"type": "ClassBidirectional", "source": "Paciente", "target": "Cita", **ends}],
        )

    def test_cardinality_cues_without_any_multiplicity_are_flagged(self):
        issues = assess_diff(self.PROMPT, self._diff(), {})
        self.assertTrue(any("multiplicidad" in i.lower() for i in issues))

    def test_present_multiplicities_are_accepted(self):
        diff = self._diff(sourceMultiplicity="1", targetMultiplicity="0..*")
        issues = assess_diff(self.PROMPT, diff, {})
        self.assertFalse(any("multiplicidad" in i.lower() for i in issues))

    def test_prompt_without_cardinality_cues_is_not_flagged(self):
        issues = assess_diff("Relaciona la clase Paciente con la clase Cita", self._diff(), {})
        self.assertFalse(any("multiplicidad" in i.lower() for i in issues))

    def test_inheritance_only_is_not_flagged(self):
        diff = _diff(
            [
                {"name": "Medico", "attributes": [{"name": "+ nombre: String"}]},
                {"name": "Cirujano", "attributes": [{"name": "+ quirofano: String"}]},
            ],
            [{"type": "ClassInheritance", "source": "Cirujano", "target": "Medico"}],
        )
        issues = assess_diff("Hay muchos tipos de médicos, entre ellos cirujanos", diff, {})
        self.assertFalse(any("multiplicidad" in i.lower() for i in issues))

    def test_pipeline_retries_and_keeps_the_version_with_multiplicities(self):
        weak = self._diff()
        strong = self._diff(sourceMultiplicity="1", targetMultiplicity="0..*")
        adapter = _ScriptedAdapter([weak, strong])
        with patch("src.adapters.get_adapter", return_value=adapter):
            response = asyncio.run(AIPipeline.process_text(self.PROMPT, {}, None))
        self.assertEqual(len(adapter.prompts), 2)
        self.assertEqual(response.diff.add.relationships[0].targetMultiplicity, "0..*")


if __name__ == "__main__":
    unittest.main()
