"""
Deterministic Mock AI Adapter conforming strictly to INT-CU03.
"""

from typing import Dict, Any
from .base import BaseAIAdapter
from ..models.uml import (
    ModelDiff,
    DiffAddBlock,
    DiffElementAdd,
    DiffRelationshipAdd,
    DiffAttribute,
    DiffMethod,
)


class MockAIAdapter(BaseAIAdapter):
    @property
    def provider_name(self) -> str:
        return "mock-local"

    async def generate_diff(self, prompt: str, _current_model: Dict[str, Any]) -> ModelDiff:
        normalized = prompt.lower()

        # Strategy Pattern (INT-CU03 requirement)
        if "strategy" in normalized or "estrategia" in normalized:
            return ModelDiff(
                add=DiffAddBlock(
                    elements=[
                        DiffElementAdd(
                            name="Context",
                            type="Class",
                            position={"x": 80, "y": 140},
                            width=240,
                            height=140,
                            attributes=[DiffAttribute(name="- strategy: Strategy")],
                            methods=[
                                DiffMethod(name="+ setStrategy(s: Strategy): void"),
                                DiffMethod(name="+ executeStrategy(): void"),
                            ],
                        ),
                        DiffElementAdd(
                            name="Strategy",
                            type="Class",
                            stereotype="<<interface>>",
                            position={"x": 440, "y": 140},
                            width=220,
                            height=120,
                            methods=[DiffMethod(name="+ execute(): void")],
                        ),
                        DiffElementAdd(
                            name="ConcreteStrategyA",
                            type="Class",
                            position={"x": 380, "y": 360},
                            width=220,
                            height=120,
                            methods=[DiffMethod(name="+ execute(): void")],
                        ),
                        DiffElementAdd(
                            name="ConcreteStrategyB",
                            type="Class",
                            position={"x": 660, "y": 360},
                            width=220,
                            height=120,
                            methods=[DiffMethod(name="+ execute(): void")],
                        ),
                    ],
                    relationships=[
                        DiffRelationshipAdd(
                            type="ClassRealization",
                            source="ConcreteStrategyA",
                            target="Strategy",
                        ),
                        DiffRelationshipAdd(
                            type="ClassRealization",
                            source="ConcreteStrategyB",
                            target="Strategy",
                        ),
                        DiffRelationshipAdd(
                            type="ClassAggregation",
                            source="Context",
                            target="Strategy",
                        ),
                    ],
                )
            )

        # Observer Pattern
        elif "observer" in normalized or "observador" in normalized:
            return ModelDiff(
                add=DiffAddBlock(
                    elements=[
                        DiffElementAdd(
                            name="Subject",
                            type="Class",
                            position={"x": 100, "y": 120},
                            methods=[
                                DiffMethod(name="+ attach(o: Observer): void"),
                                DiffMethod(name="+ detach(o: Observer): void"),
                                DiffMethod(name="+ notify(): void"),
                            ],
                        ),
                        DiffElementAdd(
                            name="Observer",
                            type="Class",
                            stereotype="<<interface>>",
                            position={"x": 460, "y": 120},
                            methods=[DiffMethod(name="+ update(): void")],
                        ),
                        DiffElementAdd(
                            name="ConcreteObserver",
                            type="Class",
                            position={"x": 460, "y": 320},
                            methods=[DiffMethod(name="+ update(): void")],
                        ),
                    ],
                    relationships=[
                        DiffRelationshipAdd(
                            type="ClassRealization",
                            source="ConcreteObserver",
                            target="Observer",
                        ),
                        DiffRelationshipAdd(
                            type="ClassAggregation",
                            source="Subject",
                            target="Observer",
                        ),
                    ],
                )
            )

        # Factory Pattern
        elif "factory" in normalized or "fabrica" in normalized:
            return ModelDiff(
                add=DiffAddBlock(
                    elements=[
                        DiffElementAdd(
                            name="Product",
                            type="Class",
                            stereotype="<<interface>>",
                            position={"x": 200, "y": 120},
                            methods=[DiffMethod(name="+ operation(): void")],
                        ),
                        DiffElementAdd(
                            name="ConcreteProduct",
                            type="Class",
                            position={"x": 200, "y": 300},
                            methods=[DiffMethod(name="+ operation(): void")],
                        ),
                        DiffElementAdd(
                            name="Creator",
                            type="Class",
                            position={"x": 520, "y": 120},
                            methods=[
                                DiffMethod(name="+ factoryMethod(): Product"),
                                DiffMethod(name="+ someOperation(): void"),
                            ],
                        ),
                    ],
                    relationships=[
                        DiffRelationshipAdd(
                            type="ClassRealization",
                            source="ConcreteProduct",
                            target="Product",
                        ),
                        DiffRelationshipAdd(
                            type="ClassDependency",
                            source="Creator",
                            target="Product",
                        ),
                    ],
                )
            )

        return ModelDiff(add=DiffAddBlock(elements=[], relationships=[]))
