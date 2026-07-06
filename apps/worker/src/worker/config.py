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
    # Web app base URL + shared secret for the job-completion hook (W-14). When
    # web_base_url is empty, completion notifications (webhook + APNs push) are
    # skipped. internal_api_token falls back to server_secret on the web side.
    web_base_url: str = ""
    internal_api_token: str = ""
    hf_token: str = ""
    google_api_key: str = ""
    elevenlabs_api_key: str = ""
    xiaomi_api_key: str = ""
    xai_api_key: str = ""

    torch_device: str = "cpu"
    worker_concurrency: int = 1

    # ASR model for faster-whisper. `large-v3-turbo` is ~8x faster than `large-v3`
    # at near-identical WER — a better default for Mac CPU/MPS. Override with
    # ASR_MODEL=large-v3 for maximum accuracy.
    asr_model: str = "large-v3-turbo"
    asr_compute_type: str = "auto"

    # Expand Vietnamese numbers/dates/currency/etc. to spoken form before TTS
    # (e.g. "123 tỷ" → "một trăm hai mươi ba tỷ"). On by default for vi content;
    # dependency-free. Set VI_NORMALIZE=false to pass raw text to the engine.
    vi_normalize: bool = True

    # Animate audiogram captions word-by-word (aligns the rendered audio with
    # faster-whisper). On by default; falls back to chapter captions if the
    # aligner is unavailable. Preset: "pop" (active-word) or "karaoke" (sweep).
    audiogram_word_captions: bool = True
    caption_preset: str = "pop"

    # Run Demucs vocal separation on enrollment clips before scoring (requires
    # `uv sync --extra demucs`). Off by default — best-effort when enabled.
    enroll_separate: bool = False

    # Allow URL/YouTube audio ingest via yt-dlp (requires `uv sync --extra ingest`).
    # Off by default — admins enable it knowing the ToS/abuse implications.
    allow_url_ingest: bool = False

    # DeepFilterNet denoise on enrollment clips before scoring (requires
    # `uv sync --extra denoise`). Off by default — best-effort when enabled.
    enroll_denoise: bool = False

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
