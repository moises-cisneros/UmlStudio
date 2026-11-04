# syntax=docker/dockerfile:1.9
# =====================================================================
# Dockerfile: umlstudio-llm (Ollama with baked umlstudio-mentor)
# Traceability: Ciclo 2 · Iteración I2 · CU-15 · RNF-31, RNF-34 · Issue #30 (E5-03)
# =====================================================================

ARG OLLAMA_VERSION=0.5.7
FROM ollama/ollama:${OLLAMA_VERSION}

ENV OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_MODELS=/root/.ollama/models

WORKDIR /root

# Install curl for healthcheck / readiness polling
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy the versioned Modelfile and container entrypoint script
COPY apps/ai-service/ollama/Modelfile /root/Modelfile
COPY apps/ai-service/ollama/entrypoint.sh /root/entrypoint.sh
RUN chmod +x /root/entrypoint.sh

# Base model to bake into the image (default is qwen2.5:7b-instruct selected via #28 benchmark)
ARG BASE_MODEL=qwen2.5:7b-instruct

# Bake the base model and create umlstudio-mentor into image layers:
# 1. Start Ollama daemon in background
# 2. Wait until daemon responds
# 3. Pull base model weights (GGUF blobs stored in /root/.ollama/models)
# 4. Create custom umlstudio-mentor model from Modelfile
# 5. Terminate daemon so the layer is committed cleanly
RUN (ollama serve > /tmp/ollama.log 2>&1 &) && \
    for i in $(seq 1 30); do \
        if ollama list >/dev/null 2>&1; then break; fi; \
        sleep 1; \
    done && \
    ollama pull ${BASE_MODEL} && \
    ollama create umlstudio-mentor -f /root/Modelfile && \
    pkill -f "ollama" || true

EXPOSE 11434 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-11434}/api/version || exit 1

ENTRYPOINT ["/root/entrypoint.sh"]
