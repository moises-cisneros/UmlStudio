"""
Unit tests for the open model benchmark suite (Issue #28, Backlog E5-01).

Tests the 10 fixed prompts contract (CU-15 / RF-57 and CU-16 / RF-58),
explanation quality scoring, ModelDiff validation, and deterministic suite execution.
"""

import unittest
from scripts.benchmark_models import (
    BASELINE_BOARD,
    BENCHMARK_PROMPTS,
    CANDIDATE_MODELS,
    ModelBenchmarkRunner,
    evaluate_diff_validity,
    evaluate_explanation_quality,
    generate_markdown_report,
)


class TestBenchmarkModels(unittest.TestCase):
    def test_benchmark_prompts_contract(self):
        """Verify the 10 fixed prompts conform to CU-15 (mentor) and CU-16 (executor)."""
        self.assertEqual(len(BENCHMARK_PROMPTS), 10)

        explain_prompts = [p for p in BENCHMARK_PROMPTS if p["mode"] == "explain"]
        change_prompts = [p for p in BENCHMARK_PROMPTS if p["mode"] == "change"]

        self.assertEqual(len(explain_prompts), 5)
        self.assertEqual(len(change_prompts), 5)

        for p in explain_prompts:
            self.assertEqual(p["cu"], "CU-15")
            self.assertEqual(p["rf"], "RF-57")
            self.assertTrue(len(p["prompt"]) > 20)
            self.assertTrue(len(p.get("expected_concepts", [])) > 0)

        for p in change_prompts:
            self.assertEqual(p["cu"], "CU-16")
            self.assertEqual(p["rf"], "RF-58")
            self.assertTrue(len(p["prompt"]) > 20)
            self.assertTrue(len(p.get("expected_elements", [])) > 0)

    def test_evaluate_explanation_quality(self):
        """Verify scoring of Spanish explanations in mentor mode."""
        good_text = (
            "La agregación y la composición representan relaciones todo-parte. "
            "En la composición, la clase Factura administra el ciclo de vida de LineaFactura, "
            "mientras que en la agregación las partes pueden existir de forma independiente."
        )
        score, label = evaluate_explanation_quality(good_text, ["agregación", "composición", "factura"])
        self.assertGreaterEqual(score, 4.0)
        self.assertIn("Excelente", label)

        # Empty response
        score, label = evaluate_explanation_quality("", ["factura"])
        self.assertEqual(score, 0.0)

        # Leaking diff / JSON in mentor mode
        leaky_text = '{"add": {"elements": [{"name": "LineaFactura"}]}}'
        score, label = evaluate_explanation_quality(leaky_text, ["factura"])
        self.assertLess(score, 2.0)
        self.assertIn("Fuga de diff", label)

    def test_evaluate_diff_validity(self):
        """Verify validation of change responses against ModelDiff schema."""
        valid_json = (
            '{"add": {"elements": [{"name": "Producto", "type": "class", '
            '"attributes": [{"name": "+ id: Long"}], "methods": []}], "relationships": []}}'
        )
        is_valid, diff, notes = evaluate_diff_validity(
            valid_json, BASELINE_BOARD, "Crea la clase Producto con id"
        )
        self.assertTrue(is_valid)
        self.assertIsNotNone(diff)
        self.assertIn("no vacío", notes)

        # Empty diff
        empty_json = '{"add": {"elements": [], "relationships": []}}'
        is_valid, diff, notes = evaluate_diff_validity(
            empty_json, BASELINE_BOARD, "Prompt"
        )
        self.assertFalse(is_valid)
        self.assertIn("vacío", notes)

        # Invalid non-JSON string
        is_valid, diff, notes = evaluate_diff_validity(
            "No puedo generar el diff", BASELINE_BOARD, "Prompt"
        )
        self.assertFalse(is_valid)
        self.assertIsNone(diff)

    def test_benchmark_runner_offline_suite(self):
        """Verify that offline runner evaluates all 4 candidate models deterministically."""
        import asyncio

        runner = ModelBenchmarkRunner(offline=True)
        summaries = asyncio.run(runner.run_suite(CANDIDATE_MODELS))

        self.assertEqual(len(summaries), 4)

        # Check Qwen 2.5 7B Instruct (Chosen winner)
        qwen7b = next(s for s in summaries if s.model_name == "qwen2.5:7b-instruct")
        self.assertTrue(qwen7b.meets_target)
        self.assertGreaterEqual(qwen7b.valid_diff_pct, 80.0)
        self.assertGreaterEqual(qwen7b.avg_tokens_per_second, 10.0)
        self.assertIn("Seleccionado como modelo local por defecto", qwen7b.decision)
        self.assertEqual(qwen7b.valid_diff_count, 5)

        # Check Light Fallback Qwen 2.5 3B
        qwen3b = next(s for s in summaries if s.model_name == "qwen2.5:3b")
        self.assertIn("fallback ligero", qwen3b.decision.lower())
        self.assertGreaterEqual(qwen3b.avg_tokens_per_second, 30.0)

        # Verify markdown report generation
        md_report = generate_markdown_report(summaries)
        self.assertIn("# Benchmark de Modelos Abiertos para la IA de Sala", md_report)
        self.assertIn("qwen2.5:7b-instruct", md_report)
        self.assertIn("RTX 3050", md_report)
        self.assertIn("E5-01", md_report)


if __name__ == "__main__":
    unittest.main()
