from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    redis_url: str = "redis://localhost:6379"
    minio_endpoint: str = "localhost"
    minio_port: int = 9000
    minio_use_ssl: bool = False
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "voice-studio"

    server_secret: str = "change_me_at_least_32_chars_long!!"
    hf_token: str = ""
    google_api_key: str = ""
    elevenlabs_api_key: str = ""
    xiaomi_api_key: str = ""
    xai_api_key: str = ""

    torch_device: str = "cpu"
    worker_concurrency: int = 1

    model_cache_dir: str = "./models"

    log_level: str = "INFO"
    prometheus_port: int = 9090

    @field_validator("torch_device")
    @classmethod
    def validate_device(cls, v: str) -> str:
        try:
            import torch  # lazy import — torch is only needed at inference time
        except ImportError:
            return "cpu"
        if v == "cuda" and not torch.cuda.is_available():
            raise ValueError("CUDA requested but not available — set TORCH_DEVICE=cpu or mps")
        if v == "mps" and not (
            hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
        ):
            return "cpu"
        return v


settings = Settings()
