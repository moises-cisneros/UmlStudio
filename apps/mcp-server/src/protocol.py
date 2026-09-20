"""
UmlStudio JSON-RPC 2.0 Dispatcher conforming to MCP Specification 2024-11-05.
"""

from typing import Any, Dict, Optional

try:
    from .constants import PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION
    from .resources import RESOURCES, handle_resource_read
    from .store import ModelStore
    from .tools import TOOLS, handle_tool_call
except ImportError:
    from constants import PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION
    from resources import RESOURCES, handle_resource_read
    from store import ModelStore
    from tools import TOOLS, handle_tool_call


def process_json_rpc(store: ModelStore, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Dispatches a single JSON-RPC 2.0 message conforming to the MCP spec."""
    msg_id = message.get("id")
    method = message.get("method")
    params = message.get("params", {})

    if not method:
        return None

    # Notifications do not return responses
    if method == "notifications/initialized":
        return None

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {"listChanged": False},
                    "resources": {"subscribe": False, "listChanged": False},
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": SERVER_VERSION,
                },
            },
        }

    elif method == "ping":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {}}

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {"tools": TOOLS},
        }

    elif method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        try:
            content_text = handle_tool_call(store, tool_name, tool_args)
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "content": [{"type": "text", "text": content_text}],
                    "isError": False,
                },
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "content": [{"type": "text", "text": f"Error: {str(e)}"}],
                    "isError": True,
                },
            }

    elif method == "resources/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {"resources": RESOURCES},
        }

    elif method == "resources/read":
        uri = params.get("uri")
        try:
            content_text = handle_resource_read(store, uri)
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "contents": [
                        {
                            "uri": uri,
                            "mimeType": "application/json",
                            "text": content_text,
                        }
                    ]
                },
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32002, "message": str(e)},
            }

    else:
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": -32601, "message": f"Method '{method}' not found"},
        }
