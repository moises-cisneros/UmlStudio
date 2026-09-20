# syntax=docker/dockerfile:1.9
ARG PYTHON_IMAGE=python:3.12-slim-bookworm

FROM ${PYTHON_IMAGE} AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MCP_PORT=8003 \
    MCP_HOST=0.0.0.0

WORKDIR /app

# Install system dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY apps/mcp-server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy mcp-server source code
COPY apps/mcp-server ./

# Copy canonical OMG UML 2.5 schema
COPY packages/core/schema/uml-model-4.schema.json ./schema/uml-model-4.schema.json

EXPOSE 8003

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8003/health || exit 1

CMD ["python", "src/server.py", "--transport", "sse", "--port", "8003"]
