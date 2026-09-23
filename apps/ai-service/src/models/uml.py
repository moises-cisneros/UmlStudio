"""
UmlStudio AI Service — Data Models for OMG UML 2.5 Metamodel.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


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


class DiffModifyBlock(BaseModel):
    elements: Optional[List[DiffElementModify]] = None


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
