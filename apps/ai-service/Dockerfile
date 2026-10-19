# syntax=docker/dockerfile:1.9
ARG PYTHON_IMAGE=python:3.12-slim-bookworm

FROM ${PYTHON_IMAGE} AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AI_SERVICE_PORT=8001 \
    AI_SERVICE_HOST=0.0.0.0

# Voice (faster-whisper): the model is baked into the image so the first request never downloads it.
# Keep WHISPER_PRELOAD=false until the 512 MB memory gate has passed.
ARG WHISPER_MODEL=base
ENV WHISPER_MODEL=${WHISPER_MODEL}     WHISPER_MODEL_DIR=/opt/whisper-models     WHISPER_PRELOAD=false

WORKDIR /app

# Install system dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY apps/ai-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Whisper model and prove CTranslate2 loads at build time
RUN python -c "import os; from faster_whisper import WhisperModel; WhisperModel(os.environ['WHISPER_MODEL'], device='cpu', compute_type='int8', download_root=os.environ['WHISPER_MODEL_DIR'])"

# Copy ai-service source code
COPY apps/ai-service ./

EXPOSE 8001 10000 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8001}/health || exit 1

CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
