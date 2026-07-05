"""Speech denoising via DeepFilterNet (borrowed from voice-pro's denoise stage).

Complements — does not replace — our existing loudness-normalize + VAD trim. Run on
enrollment clips so steady background noise (fans, hiss, room tone) is removed before
quality scoring and cloning. Optional dependency: ``uv sync --extra denoise``.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from ..config import settings
from ..logging import get_logger

logger = get_logger("audio.denoise")

_MODEL = None
_DF_STATE = None


async def denoise(src: Path, out_path: Path) -> Path:
    """Enhance ``src`` and write the denoised audio to ``out_path``. Returns ``out_path``.

    Raises ``RuntimeError`` if DeepFilterNet is unavailable; callers should fall back
    to the original clip on error.
    """

    def _run() -> Path:
        global _MODEL, _DF_STATE
        try:
            from df.enhance import enhance, init_df, load_audio, save_audio  # type: ignore[import]
        except ImportError as exc:
            raise RuntimeError(
                "DeepFilterNet is not installed. "
                "Run `cd apps/worker && uv sync --extra denoise` first."
            ) from exc

        if _MODEL is None or _DF_STATE is None:
            logger.info("Loading DeepFilterNet model")
            _MODEL, _DF_STATE, _ = init_df()

        audio, _ = load_audio(str(src), sr=_DF_STATE.sr())
        enhanced = enhance(_MODEL, _DF_STATE, audio)
        save_audio(str(out_path), enhanced, _DF_STATE.sr())
        return out_path

    logger.info("Denoising", src=str(src), device=settings.torch_device)
    return await asyncio.to_thread(_run)
