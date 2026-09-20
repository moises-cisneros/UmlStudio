"""
UmlStudio MCP Server package.
Model Context Protocol implementation for OMG UML 2.5 Class Diagrams.
"""

from .constants import PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION, VALID_RELATIONSHIPS
from .store import ModelStore

__all__ = [
    "SERVER_NAME",
    "SERVER_VERSION",
    "PROTOCOL_VERSION",
    "VALID_RELATIONSHIPS",
    "ModelStore",
]
