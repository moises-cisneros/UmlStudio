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
