# ── CPU stage (default) ───────────────────────────────────────────────────────
FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 git curl build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv==0.5.26

WORKDIR /app
COPY apps/worker/pyproject.toml apps/worker/
ARG WORKER_EXTRAS=""
RUN cd apps/worker && if [ -n "$WORKER_EXTRAS" ]; then uv sync --no-dev $WORKER_EXTRAS; else uv sync --no-dev; fi

COPY apps/worker/src/ apps/worker/src/

WORKDIR /app/apps/worker
ENV PYTHONPATH=/app/apps/worker/src
ENV TORCH_DEVICE=cpu

EXPOSE 8001 9090
CMD ["uv", "run", "uvicorn", "worker.main:app", "--host", "0.0.0.0", "--port", "8001"]

# ── CUDA stage ────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.4.1-cudnn9-runtime-ubuntu22.04 AS cuda

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-dev python3-pip \
    ffmpeg libsndfile1 git curl build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python3.11 -m pip install --no-cache-dir uv==0.5.26

WORKDIR /app
COPY apps/worker/pyproject.toml apps/worker/
ARG WORKER_EXTRAS=""
# Install with GPU torch extras
RUN cd apps/worker && if [ -n "$WORKER_EXTRAS" ]; then uv sync --no-dev $WORKER_EXTRAS || uv sync --no-dev; else uv sync --no-dev; fi

COPY apps/worker/src/ apps/worker/src/

WORKDIR /app/apps/worker
ENV PYTHONPATH=/app/apps/worker/src
ENV TORCH_DEVICE=cuda
ENV CUDA_VISIBLE_DEVICES=0

EXPOSE 8001 9090
CMD ["uv", "run", "uvicorn", "worker.main:app", "--host", "0.0.0.0", "--port", "8001"]
