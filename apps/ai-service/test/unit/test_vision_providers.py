import unittest
from src.vision.providers import (
    _parse_vision_json,
    _normalize_uml_model,
    StubVisionProvider,
    ChainedVisionProvider,
    get_vision_provider,
)

class TestVisionProviders(unittest.IsolatedAsyncioTestCase):
    def test_parse_vision_json_from_dict(self):
        data = {
            "model": {
                "nodes": [
                    {
                        "id": "node-usuario",
                        "data": {
                            "name": "Usuario",
                            "attributes": ["- id: string", "+ nombre: string"],
                            "methods": ["+ execute(): void"],
                        },
                    },
                    {
                        "id": "node-venta",
                        "data": {
                            "name": "Venta",
                            "attributes": ["+ fecha: Date", "+ total: Float"],
                        },
                    },
                ],
                "edges": [
                    {
                        "id": "edge-1",
                        "type": "ClassBidirectional",
                        "source": "node-usuario",
                        "target": "node-venta",
                        "data": {
                            "label": "realiza",
                            "sourceMultiplicity": "1",
                            "targetMultiplicity": "0..*",
                        },
                    }
                ],
            }
        }
        res = _parse_vision_json(data)
        self.assertIsNotNone(res)
        self.assertEqual(len(res.model["nodes"]), 2)
        self.assertEqual(len(res.model["edges"]), 1)

        usuario = res.model["nodes"][0]
        self.assertEqual(usuario["data"]["name"], "Usuario")
        self.assertEqual(
            usuario["data"]["attributes"],
            [
                {"id": "attr-node-usuario-1", "name": "- id: string"},
                {"id": "attr-node-usuario-2", "name": "+ nombre: string"},
            ],
        )
        self.assertEqual(
            usuario["data"]["methods"],
            [{"id": "meth-node-usuario-1", "name": "+ execute(): void"}],
        )

        edge = res.model["edges"][0]
        self.assertEqual(edge["data"]["label"], "realiza")
        self.assertEqual(edge["data"]["sourceMultiplicity"], "1")
        self.assertEqual(edge["data"]["targetMultiplicity"], "0..*")

    def test_parse_vision_json_from_markdown_string(self):
        raw_markdown = """
Here is the extracted diagram:
```json
{
  "model": {
    "nodes": [
      {
        "id": "c1",
        "data": {
          "name": "Pedido",
          "attributes": ["- id: int"]
        }
      }
    ],
    "edges": []
  }
}
```
Hope this helps!
"""
        res = _parse_vision_json(raw_markdown)
        self.assertIsNotNone(res)
        self.assertEqual(len(res.model["nodes"]), 1)
        self.assertEqual(res.model["nodes"][0]["data"]["name"], "Pedido")

    async def test_stub_provider(self):
        stub = StubVisionProvider()
        res = await stub.extract(b"dummy", "image/png")
        self.assertIsNotNone(res)
        self.assertTrue(len(res.model["nodes"]) > 0)

    async def test_chained_provider_fallback(self):
        chained = ChainedVisionProvider([])
        res = await chained.extract(b"dummy", "image/png")
        self.assertIsNotNone(res)
        self.assertTrue(len(res.model["nodes"]) > 0)

    def test_edge_type_normalization_and_name_resolution(self):
        data = {
            "model": {
                "nodes": [
                    {"id": "node-padre", "data": {"name": "Padre"}},
                    {"id": "node-hijo", "data": {"name": "Hijo"}},
                    {"id": "node-assoc", "data": {"name": "ContratoAssoc"}},
                ],
                "edges": [
                    {
                        "id": "e1",
                        "type": "inheritance",
                        "source": "Hijo",
                        "target": "Padre",
                    },
                    {
                        "id": "e2",
                        "type": "composition",
                        "source": "Padre",
                        "target": "Hijo",
                        "data": {
                            "associationClass": "ContratoAssoc",
                        },
                    },
                ],
            }
        }
        res = _parse_vision_json(data)
        self.assertIsNotNone(res)
        self.assertEqual(len(res.model["edges"]), 2)

        e1 = res.model["edges"][0]
        self.assertEqual(e1["type"], "ClassInheritance")
        self.assertEqual(e1["source"], "node-hijo")
        self.assertEqual(e1["target"], "node-padre")

        e2 = res.model["edges"][1]
        self.assertEqual(e2["type"], "ClassComposition")
        self.assertEqual(e2["source"], "node-padre")
        self.assertEqual(e2["target"], "node-hijo")
        self.assertEqual(e2["data"]["associationClassNodeId"], "node-assoc")


if __name__ == "__main__":
    unittest.main()

