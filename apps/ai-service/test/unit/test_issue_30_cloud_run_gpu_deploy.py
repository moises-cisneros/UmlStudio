import os
import unittest
from pathlib import Path


class TestIssue30CloudRunGpuDeploy(unittest.TestCase):
    """
    Unit tests for Issue #30 (Backlog E5-03):
    Cloud Run GPU image and deploy script for the model (scale to zero, private IAM).
    Traceability: Ciclo 2 · Iteración I2 · CU-15 · RNF-31, RNF-34 · Issue #30
    """

    @classmethod
    def setUpClass(cls):
        cls.ai_service_dir = Path(__file__).resolve().parent.parent.parent
        cls.ollama_dir = cls.ai_service_dir / "ollama"
        cls.dockerfile_path = cls.ollama_dir / "Dockerfile"
        cls.entrypoint_path = cls.ollama_dir / "entrypoint.sh"
        cls.deploy_script_path = cls.ollama_dir / "deploy-cloud-run.sh"
        cls.cloudbuild_path = cls.ollama_dir / "cloudbuild.yaml"
        cls.readme_path = cls.ollama_dir / "README.md"
        cls.repo_root = cls.ai_service_dir.parent.parent
        cls.ciclo_2_path = cls.repo_root / "docs" / "CICLO_2.md"

    def test_dockerfile_bakes_umlstudio_mentor(self):
        """Verifies Dockerfile bakes umlstudio-mentor from Modelfile and configures Ollama."""
        self.assertTrue(
            self.dockerfile_path.exists(),
            f"Missing Dockerfile at {self.dockerfile_path}",
        )
        content = self.dockerfile_path.read_text(encoding="utf-8")

        self.assertIn("FROM ollama/ollama", content)
        self.assertIn("Modelfile", content)
        self.assertIn("ollama create umlstudio-mentor", content)
        self.assertIn("ollama pull", content)
        self.assertIn("EXPOSE", content)
        self.assertIn("11434", content)
        self.assertIn("ENTRYPOINT", content)
        self.assertIn("entrypoint.sh", content)

    def test_entrypoint_script_handles_cloud_run_port(self):
        """Verifies entrypoint.sh sets OLLAMA_HOST respecting Cloud Run $PORT."""
        self.assertTrue(
            self.entrypoint_path.exists(),
            f"Missing entrypoint script at {self.entrypoint_path}",
        )
        content = self.entrypoint_path.read_text(encoding="utf-8")

        self.assertTrue(
            content.startswith("#!/bin/sh") or content.startswith("#!/usr/bin/env sh")
        )
        self.assertIn("PORT", content)
        self.assertIn("OLLAMA_HOST", content)
        self.assertIn("ollama serve", content)

    def test_deploy_script_contains_gpu_and_security_flags(self):
        """Verifies deploy-cloud-run.sh sets L4 GPU, scale-to-zero, max-instances=1, and private auth."""
        self.assertTrue(
            self.deploy_script_path.exists(),
            f"Missing deploy script at {self.deploy_script_path}",
        )
        content = self.deploy_script_path.read_text(encoding="utf-8")

        self.assertIn("gcloud run deploy", content)
        self.assertIn("umlstudio-llm", content)
        self.assertIn("nvidia-l4", content)
        self.assertIn("--gpu", content)
        self.assertIn("--cpu", content)
        self.assertIn("4", content)
        self.assertIn("--memory", content)
        self.assertIn("16Gi", content)
        self.assertIn("--no-allow-unauthenticated", content)
        self.assertIn("--min-instances", content)
        self.assertIn("0", content)
        self.assertIn("--max-instances", content)
        self.assertIn("1", content)
        self.assertIn("--no-cpu-throttling", content)
        self.assertIn("--dry-run", content)

    def test_cloudbuild_configuration_present(self):
        """Verifies cloudbuild.yaml exists for container build on GCP."""
        self.assertTrue(
            self.cloudbuild_path.exists(),
            f"Missing cloudbuild.yaml at {self.cloudbuild_path}",
        )
        content = self.cloudbuild_path.read_text(encoding="utf-8")
        self.assertIn("apps/ai-service/ollama/Dockerfile", content)
        self.assertIn("umlstudio-llm", content)

    def test_pricing_and_quota_documented(self):
        """Verifies README.md documents the per-second pricing and GPU quota steps."""
        self.assertTrue(
            self.readme_path.exists(),
            f"Missing README at {self.readme_path}",
        )
        content = self.readme_path.read_text(encoding="utf-8")

        self.assertIn("Issue #30", content)
        self.assertIn("E5-03", content)
        self.assertIn("0.0001867", content)  # L4 per-second
        self.assertIn("0.0003227", content)  # Total active per-second
        self.assertIn("run.googleapis.com/allocated_gpus", content)
        self.assertIn("us-central1", content)
        self.assertIn("min-instances=0", content)


if __name__ == "__main__":
    unittest.main()
