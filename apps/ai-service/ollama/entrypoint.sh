#!/bin/sh
set -e

# Cloud Run sets the PORT environment variable (default 8080).
# In local containers or standalone runs, default to Ollama's standard port 11434.
PORT="${PORT:-11434}"
export OLLAMA_HOST="0.0.0.0:${PORT}"

echo "[umlstudio-llm] Starting Ollama with baked umlstudio-mentor on ${OLLAMA_HOST}..."
exec /bin/ollama serve
