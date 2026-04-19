FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 git curl build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv==0.5.26

WORKDIR /app
COPY apps/worker/pyproject.toml apps/worker/
RUN cd apps/worker && uv sync --no-dev

COPY apps/worker/src/ apps/worker/src/

WORKDIR /app/apps/worker
ENV PYTHONPATH=/app/apps/worker/src
ENV TORCH_DEVICE=cpu

EXPOSE 8001 9090
CMD ["uv", "run", "uvicorn", "worker.main:app", "--host", "0.0.0.0", "--port", "8001"]
