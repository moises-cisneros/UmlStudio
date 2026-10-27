"""
Base AI Adapter Contract (Strategy Pattern).
"""

from abc import ABC, abstractmethod
from typing import Dict, Any
from ..models.uml import ModelDiff


class BaseAIAdapter(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    async def generate_diff(self, prompt: str, current_model: Dict[str, Any]) -> ModelDiff:
        pass

    async def complete_text(self, prompt: str) -> str:
        """Plain-text completion; providers without support fail explicitly."""
        raise NotImplementedError(f"{self.provider_name} does not support text completion")
