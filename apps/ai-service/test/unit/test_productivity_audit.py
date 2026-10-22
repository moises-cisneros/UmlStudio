"""Productivity audit endpoint (CU-10): one route per path, contention-driven diagnosis."""

import unittest

from fastapi.testclient import TestClient

from src.main import app

PATHS = ("/api/audit/productivity", "/audit/productivity")


class TestProductivityAuditRoutes(unittest.TestCase):
    def test_each_path_is_registered_once(self):
        for path in PATHS:
            registered = [r for r in app.routes if getattr(r, "path", None) == path]
            self.assertEqual(len(registered), 1, f"{path} registered {len(registered)} times")


class TestProductivityAuditBehavior(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_heavy_contention_is_red(self):
        body = {
            "bottlenecks": [{"nodeId": "n1", "nodeName": "Pedido", "contentionCount": 3}],
        }
        for path in PATHS:
            res = self.client.post(path, json=body)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["fluency_status"], "red")
            self.assertIn("Pedido", data["diagnosis"])

    def test_no_bottlenecks_is_green(self):
        res = self.client.post(PATHS[0], json={"bottlenecks": []})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["fluency_status"], "green")


if __name__ == "__main__":
    unittest.main()
