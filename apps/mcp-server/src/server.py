"""
UmlStudio FastMCP Server — Model Context Protocol implementation in Python.
Provides inspection and mutation tools for OMG UML 2.5 Class Diagrams.
Transports: stdio (default), sse, and fastmcp.
"""

import argparse
import os
import sys
from typing import Any, Dict, Optional

# Ensure src/ directory is in sys.path when executed directly
_SRC_DIR = os.path.dirname(os.path.abspath(__file__))
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

try:
    from .constants import PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION, VALID_RELATIONSHIPS
    from .fastmcp_adapter import HAS_FASTMCP, create_fastmcp_app
    from .protocol import process_json_rpc as _process_json_rpc
    from .resources import RESOURCES, handle_resource_read as _handle_resource_read
    from .store import ModelStore
    from .tools import TOOLS, handle_tool_call as _handle_tool_call
    from .transports import run_sse as _run_sse, run_stdio as _run_stdio
except ImportError:
    from constants import PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION, VALID_RELATIONSHIPS
    from fastmcp_adapter import HAS_FASTMCP, create_fastmcp_app
    from protocol import process_json_rpc as _process_json_rpc
    from resources import RESOURCES, handle_resource_read as _handle_resource_read
    from store import ModelStore
    from tools import TOOLS, handle_tool_call as _handle_tool_call
    from transports import run_sse as _run_sse, run_stdio as _run_stdio

# Global in-memory diagram store singleton
store = ModelStore()

# FastMCP application instance if library is installed
mcp = create_fastmcp_app(store)


def handle_tool_call(name: str, args: Dict[str, Any]) -> str:
    """Dispatches tool execution against singleton store."""
    return _handle_tool_call(store, name, args)


def handle_resource_read(uri: str) -> str:
    """Reads URI resources against singleton store."""
    return _handle_resource_read(store, uri)


def process_json_rpc(message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Dispatches a single JSON-RPC 2.0 message conforming to the MCP spec."""
    return _process_json_rpc(store, message)


def run_stdio() -> None:
    """Runs the MCP server over standard I/O."""
    _run_stdio(store)


def run_sse(port: int = 8003, host: str = "0.0.0.0") -> None:
    """Runs the MCP server over Server-Sent Events / HTTP."""
    _run_sse(store, port=port, host=host)


def main() -> None:
    parser = argparse.ArgumentParser(description="UmlStudio FastMCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse", "fastmcp"],
        default="stdio",
        help="Transport type (stdio, sse, or fastmcp)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8003,
        help="Port for SSE transport (default 8003)",
    )
    args = parser.parse_args()

    if args.transport == "fastmcp":
        if HAS_FASTMCP and mcp:
            mcp.run()
        else:
            run_stdio()
    elif args.transport == "sse":
        run_sse(port=args.port)
    else:
        run_stdio()


if __name__ == "__main__":
    main()
