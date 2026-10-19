"""
Opt-in end-to-end vision test against the REAL configured multimodal providers (needs API keys).

Run with:  RUN_VISION_E2E=1 python -m unittest discover -s test/unit -p "test_vision_e2e*.py"

Fixtures (test/fixtures/images) are the same class diagram twice: a clean PNG render and a
photo-like JPEG (rotated, blurred, noisy, compressed). Ground truth: Animal (abstract) with two
subclasses Perro and Gato, and Dueño aggregating Animals (0..*).
"""

import asyncio
import os
import unittest
from pathlib import Path

from src.vision.providers import get_vision_provider
from src.vision.validation import validate_vision_model

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "images"
EXPECTED_CLASSES = {"animal", "perro", "gato", "dueño"}


def _extract(name: str, mime: str):
    data = (FIXTURES / name).read_bytes()
    return asyncio.run(get_vision_provider("auto").extract(data, mime)).model


def _names(model):
    return {n["data"]["name"].lower() for n in model["nodes"]}


def _edge_triples(model):
    by_id = {n["id"]: n["data"]["name"].lower() for n in model["nodes"]}
    return {(e["type"], by_id[e["source"]], by_id[e["target"]]) for e in model["edges"]}


@unittest.skipUnless(os.getenv("RUN_VISION_E2E") == "1", "set RUN_VISION_E2E=1 to run real-vision tests")
class TestRealVisionExtraction(unittest.TestCase):
    def _assert_diagram(self, model):
        self.assertEqual(validate_vision_model(model)[0], [])
        self.assertEqual(_names(model), EXPECTED_CLASSES)
        triples = _edge_triples(model)
        # Inheritance direction: the subclass is the source
        self.assertIn(("ClassInheritance", "perro", "animal"), triples)
        self.assertIn(("ClassInheritance", "gato", "animal"), triples)
        self.assertTrue(
            any(t[0] in ("ClassAggregation", "ClassBidirectional", "ClassUnidirectional") and {t[1], t[2]} == {"dueño", "animal"} for t in triples),
            triples,
        )

    def test_clean_png(self):
        model = _extract("class_diagram_clean.png", "image/png")
        self._assert_diagram(model)
        members = {n["data"]["name"].lower(): n["data"] for n in model["nodes"]}
        self.assertIn("+ raza: String", [a["name"] for a in members["perro"]["attributes"]])
        self.assertIn("+ ladrar(): void", [m["name"] for m in members["perro"]["methods"]])

    def test_photo_like_jpeg(self):
        self._assert_diagram(_extract("class_diagram_photo.jpg", "image/jpeg"))


if __name__ == "__main__":
    unittest.main()
