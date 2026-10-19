"""
Provider cascade: complex prompts try the strongest cloud model first (small free models copy
few-shot examples and invert relationship directions); simple prompts keep the cheap-first order.
"""

import asyncio
import unittest
from unittest.mock import patch

from src.adapters import auto
from src.adapters.auto import AutoAdaptiveAdapter
from src.core.config import settings
from src.models.uml import ModelDiff

COMPLEX = (
    "Necesito un sistema de gestión hospitalaria: hay pacientes y médicos, los médicos pueden ser "
    "cirujanos o clínicos y una cita une a un paciente con un médico"
)
SIMPLE = "Agrega una clase Vendedor"


def _fake(name, calls, fail=False):
    class _Fake:
        provider_name = name

        async def generate_diff(self, prompt, current_model):
            calls.append(name)
            if fail:
                raise RuntimeError(f"{name} down")
            return ModelDiff()

    return _Fake


class TestCloudOrdering(unittest.TestCase):
    def _run(self, prompt, mode="auto", failing=()):
        calls = []
        patches = [
            patch.object(auto, "CloudflareAdapter", _fake("cloudflare", calls, "cloudflare" in failing)),
            patch.object(auto, "OpenRouterAdapter", _fake("openrouter", calls, "openrouter" in failing)),
            patch.object(auto, "GeminiAdapter", _fake("gemini", calls, "gemini" in failing)),
            patch.object(settings, "CLOUDFLARE_ACCOUNT_ID", "acc"),
            patch.object(settings, "CLOUDFLARE_API_TOKEN", "tok"),
            patch.object(settings, "OPENROUTER_API_KEY", "key"),
            patch.object(settings, "GEMINI_API_KEY", "key"),
        ]
        for p in patches:
            p.start()
        try:
            asyncio.run(AutoAdaptiveAdapter(mode=mode).generate_diff(prompt, {}))
        finally:
            for p in patches:
                p.stop()
        return calls

    def test_complex_prompt_tries_gemini_first(self):
        self.assertEqual(self._run(COMPLEX), ["gemini"])

    def test_simple_prompt_keeps_cost_order(self):
        self.assertEqual(self._run(SIMPLE), ["cloudflare"])

    def test_complex_prompt_falls_through_in_quality_order(self):
        calls = self._run(COMPLEX, failing=("gemini", "openrouter"))
        self.assertEqual(calls, ["gemini", "openrouter", "cloudflare"])

    def test_cloud_mode_uses_the_same_ordering(self):
        self.assertEqual(self._run(COMPLEX, mode="cloud"), ["gemini"])
        self.assertEqual(self._run(SIMPLE, mode="cloud"), ["cloudflare"])

    def test_unconfigured_providers_are_skipped(self):
        calls = []
        with patch.object(auto, "GeminiAdapter", _fake("gemini", calls)), patch.object(
            auto, "OpenRouterAdapter", _fake("openrouter", calls)
        ), patch.object(auto, "CloudflareAdapter", _fake("cloudflare", calls)), patch.object(
            settings, "GEMINI_API_KEY", ""
        ), patch.object(settings, "OPENROUTER_API_KEY", "key"), patch.object(
            settings, "CLOUDFLARE_ACCOUNT_ID", ""
        ), patch.object(settings, "CLOUDFLARE_API_TOKEN", ""):
            asyncio.run(AutoAdaptiveAdapter(mode="cloud").generate_diff(COMPLEX, {}))
        self.assertEqual(calls, ["openrouter"])

    def test_all_failing_raises_explicit_error(self):
        with self.assertRaises(RuntimeError) as ctx:
            self._run(COMPLEX, mode="cloud", failing=("gemini", "openrouter", "cloudflare"))
        self.assertIn("No hay modelos", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
