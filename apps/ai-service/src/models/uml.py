"""
UmlStudio AI Service — Data Models for OMG UML 2.5 Metamodel.
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, model_validator


class DiffAttribute(BaseModel):
    id: Optional[str] = None
    name: str


class DiffMethod(BaseModel):
    id: Optional[str] = None
    name: str


class DiffElementAdd(BaseModel):
    id: Optional[str] = None
    name: str
    type: str = "Class"
    stereotype: Optional[str] = None
    position: Optional[Dict[str, float]] = None
    width: Optional[float] = None
    height: Optional[float] = None
    attributes: Optional[List[DiffAttribute]] = None
    methods: Optional[List[DiffMethod]] = None


class DiffRelationshipAdd(BaseModel):
    id: Optional[str] = None
    type: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    name: Optional[str] = None
    associationClass: Optional[str] = Field(default=None, alias="association_class")
    intermediateClass: Optional[str] = Field(default=None, alias="intermediate_class")
    sourceRole: Optional[str] = Field(default=None, alias="source_role")
    targetRole: Optional[str] = Field(default=None, alias="target_role")
    sourceMultiplicity: Optional[str] = Field(default=None, alias="source_multiplicity")
    targetMultiplicity: Optional[str] = Field(default=None, alias="target_multiplicity")

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class DiffElementModifyChanges(BaseModel):
    name: Optional[str] = None
    stereotype: Optional[str] = None
    attributes: Optional[List[DiffAttribute]] = None
    methods: Optional[List[DiffMethod]] = None
    removeAttributes: Optional[List[str]] = Field(default=None, alias="remove_attributes")
    removeMethods: Optional[List[str]] = Field(default=None, alias="remove_methods")
    position: Optional[Dict[str, float]] = None

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class DiffElementModify(BaseModel):
    id: str
    changes: DiffElementModifyChanges


class DiffAddBlock(BaseModel):
    elements: Optional[List[DiffElementAdd]] = None
    relationships: Optional[List[DiffRelationshipAdd]] = None


class DiffRelationshipModifyChanges(BaseModel):
    type: Optional[str] = None
    name: Optional[str] = None
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    sourceRole: Optional[str] = Field(default=None, alias="source_role")
    targetRole: Optional[str] = Field(default=None, alias="target_role")
    sourceMultiplicity: Optional[str] = Field(default=None, alias="source_multiplicity")
    targetMultiplicity: Optional[str] = Field(default=None, alias="target_multiplicity")

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class DiffRelationshipModify(BaseModel):
    id: Optional[str] = None
    source: Optional[str] = None
    target: Optional[str] = None
    changes: DiffRelationshipModifyChanges

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class DiffModifyBlock(BaseModel):
    elements: Optional[List[DiffElementModify]] = None
    relationships: Optional[List[DiffRelationshipModify]] = None


class DiffRemoveBlock(BaseModel):
    elementIds: Optional[List[str]] = Field(default=None, alias="element_ids")
    relationshipIds: Optional[List[str]] = Field(default=None, alias="relationship_ids")

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class ModelDiff(BaseModel):
    add: Optional[DiffAddBlock] = None
    modify: Optional[DiffModifyBlock] = None
    remove: Optional[DiffRemoveBlock] = None


class ChatRequest(BaseModel):
    prompt: str
    model: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None


class ChatResponse(BaseModel):
    provider: str
    diff: ModelDiff
    message: str
    transcript: Optional[str] = None


class RoomAiTeachingProfile(BaseModel):
    detailLevel: Literal["concise", "balanced", "step_by_step"]
    exampleStyle: Literal["uml", "code", "analogy", "none"]

    model_config = {"extra": "forbid"}


class RoomRespondRequest(BaseModel):
    mode: Literal["explain", "change"]
    requester: Dict[str, Any]
    question: str = Field(min_length=1)
    board: Dict[str, Any]
    context: Dict[str, Any]
    provider: Optional[Literal["self_hosted"]] = None
    route: Optional[Literal["shared"]] = None
    teaching_profile: Optional[RoomAiTeachingProfile] = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_privacy_route(self):
        pending = [self.context]
        while pending:
            value = pending.pop()
            if isinstance(value, dict):
                if any(
                    key in (
                        "private_context",
                        "privateContext",
                        "personal_memory",
                        "personalMemory",
                        "teaching_profile",
                        "teachingProfile",
                    )
                    for key in value
                ):
                    raise ValueError("Requester memory must be supplied separately")
                pending.extend(value.values())
            elif isinstance(value, list):
                pending.extend(value)
        if (self.provider is None) != (self.route is None):
            raise ValueError("Provider and route must be specified together")
        if "teaching_profile" in self.model_fields_set and (
            self.provider != "self_hosted" or self.route != "shared"
            or self.teaching_profile is None
        ):
            raise ValueError("A teaching profile requires the self-hosted shared route")
        return self


class RoomProfileDeriveRequest(BaseModel):
    profile: RoomAiTeachingProfile
    interaction: str = Field(min_length=1, max_length=16_000)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_interaction(self):
        if not self.interaction.strip():
            raise ValueError("Room interaction must not be blank")
        return self


class RoomProfileProviderOutput(BaseModel):
    profile: RoomAiTeachingProfile

    model_config = {"extra": "forbid"}


class RoomProfileDeriveResponse(BaseModel):
    profile: RoomAiTeachingProfile


class RoomRespondResponse(BaseModel):
    text: str
    diff: Optional[ModelDiff]
    provider: str


class TranscribeResponse(BaseModel):
    text: str
    confidence: Optional[float] = 1.0


class AuditRequest(BaseModel):
    model: Optional[Dict[str, Any]] = None


class SolidViolation(BaseModel):
    principle: str
    severity: str
    element_id: Optional[str] = None
    element_name: Optional[str] = None
    message: str
    suggestion: str


class PatternSuggestion(BaseModel):
    pattern_name: str
    gof_category: str
    confidence: float
    description: str


class AuditResponse(BaseModel):
    violations: List[SolidViolation] = Field(default_factory=list)
    suggestions: List[PatternSuggestion] = Field(default_factory=list)
    summary: str


class ProductivityAuditRequest(BaseModel):
    diagram_id: Optional[str] = None
    bottlenecks: List[Dict[str, Any]] = Field(default_factory=list)
    velocity: Optional[Dict[str, Any]] = None
    fluency_status: Optional[str] = "green"
    fluency_score: Optional[float] = 100.0
    model: Optional[Dict[str, Any]] = None


class ProductivityAuditResponse(BaseModel):
    diagnosis: str
    recommendations: List[str] = Field(default_factory=list)
    pattern_suggestions: List[PatternSuggestion] = Field(default_factory=list)
    fluency_status: str
