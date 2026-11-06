#!/usr/bin/env bash
set -euo pipefail

# contingency-tunnel.sh
# Sets up Caddy (:8080) with Bearer token authentication in front of Ollama (:11434)
# and exposes it via an outbound Cloudflare Quick Tunnel without opening router ports (Issue #33 / RNF-31).
#
# Usage:
#   ./contingency-tunnel.sh [--dry-run] [--token <TOKEN>] [--ollama-port <PORT>]

DRY_RUN=false
TOKEN="${CONTINGENCY_BEARER_TOKEN:-}"
CADDY_PORT="8080"
OLLAMA_PORT="11434"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --port)
      CADDY_PORT="$2"
      shift 2
      ;;
    --ollama-port)
      OLLAMA_PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  TOKEN=$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | head -c 48)
fi

export CONTINGENCY_BEARER_TOKEN="$TOKEN"

echo "=== UmlStudio Defense Contingency Tunnel (Issue #33) ==="
echo "Local Ollama Target: http://localhost:${OLLAMA_PORT}"
echo "Caddy Proxy Port:    ${CADDY_PORT}"
echo "Bearer Token:        ${TOKEN}"

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "[DRY RUN] Contingency plan verified:"
  echo "  1. Starts Caddy reverse proxy on :${CADDY_PORT} enforcing 'Authorization: Bearer <token>'."
  echo "  2. Runs: cloudflared tunnel --url http://localhost:${CADDY_PORT}"
  echo "  3. Parses ephemeral https://<subdomain>.trycloudflare.com tunnel URL."
  echo "  4. Sets the following environment variables in Render (ai-service):"
  echo "       OLLAMA_URL=https://<tunnel-subdomain>.trycloudflare.com/v1"
  echo "       OLLAMA_AUTH=bearer"
  echo "       OLLAMA_API_KEY=${TOKEN}"
  echo "       OLLAMA_MODEL=umlstudio-mentor"
  exit 0
fi

# Verify Caddy installation
if ! command -v caddy &>/dev/null; then
  echo "Error: caddy is not installed. Install via: brew install caddy / apt install caddy / choco install caddy" >&2
  exit 1
fi

# Verify cloudflared installation
if ! command -v cloudflared &>/dev/null; then
  echo "Error: cloudflared is not installed. Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CADDYFILE="${SCRIPT_DIR}/Caddyfile"

echo "Starting Caddy on port ${CADDY_PORT}..."
caddy run --config "$CADDYFILE" &
CADDY_PID=$!

cleanup() {
  echo "Stopping Caddy and cloudflared..."
  kill "$CADDY_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting Cloudflare Quick Tunnel..."
echo "Watch output below for the generated https://*.trycloudflare.com URL."
cloudflared tunnel --url "http://localhost:${CADDY_PORT}"
