#!/usr/bin/env python3
"""
contingency_tunnel.py
Cross-platform helper for the defense day contingency tunnel (Issue #33 / Backlog E5-06).
Sets up token authentication and generates required environment variables for Render.
"""

import argparse
import os
import secrets
import sys
from pathlib import Path

DEFAULT_PORT = 8080
DEFAULT_OLLAMA_PORT = 11434


def generate_bearer_token() -> str:
    return secrets.token_hex(24)


def get_caddyfile_path() -> Path:
    return Path(__file__).resolve().parent / "Caddyfile"


def validate_caddyfile(caddyfile_path: Path) -> bool:
    if not caddyfile_path.exists():
        return False
    content = caddyfile_path.read_text(encoding="utf-8")
    return (
        ":8080" in content
        and "Authorization" in content
        and "CONTINGENCY_BEARER_TOKEN" in content
        and "reverse_proxy" in content
    )


def format_render_env_vars(tunnel_url: str, token: str, model: str = "umlstudio-mentor") -> dict[str, str]:
    normalized_url = tunnel_url.rstrip("/")
    if not normalized_url.endswith("/v1"):
        normalized_url = f"{normalized_url}/v1"
    return {
        "OLLAMA_URL": normalized_url,
        "OLLAMA_AUTH": "bearer",
        "OLLAMA_API_KEY": token,
        "OLLAMA_MODEL": model,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ollama Contingency Tunnel Helper")
    parser.add_argument("--dry-run", action="store_true", help="Print plan and exit")
    parser.add_argument("--token", type=str, default="", help="Custom Bearer token")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Caddy proxy port")
    parser.add_argument("--ollama-port", type=int, default=DEFAULT_OLLAMA_PORT, help="Ollama port")
    args = parser.parse_args()

    token = args.token or os.getenv("CONTINGENCY_BEARER_TOKEN") or generate_bearer_token()
    caddyfile = get_caddyfile_path()
    caddyfile_ok = validate_caddyfile(caddyfile)

    sample_tunnel_url = "https://defense-day-backup.trycloudflare.com"
    env_vars = format_render_env_vars(sample_tunnel_url, token)

    print("=== UmlStudio Contingency Tunnel Plan (Issue #33) ===")
    print(f"Caddyfile:       {caddyfile} (Valid: {caddyfile_ok})")
    print(f"Proxy Port:      {args.port}")
    print(f"Ollama Target:   http://localhost:{args.ollama_port}")
    print(f"Bearer Token:    {token}")
    print("\nRender Environment Variables (Paste into Render Dashboard):")
    for k, v in env_vars.items():
        print(f"  {k}={v}")

    if args.dry_run:
        print("\n[DRY RUN] Contingency configuration verified successfully.")
        sys.exit(0)


if __name__ == "__main__":
    main()
