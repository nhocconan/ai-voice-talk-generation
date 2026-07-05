"""Vocal/music separation via Demucs (borrowed from voice-pro).

Two payoffs in this app:
  1. Cleaner enrollment — strip background music from a reference clip before
     quality scoring, improving clone fidelity on real-world uploads.
  2. Music-preserving video re-voice — split the source into ``vocals`` and the
     instrumental bed, replace only the vocals with cloned speech, then mix the
     synthesized voice back over the original music/SFX.

We shell out to ``python -m demucs`` (htdemucs, ``--two-stems=vocals``) so the
heavy model stays an optional dependency: ``uv sync --extra demucs``. MIT-licensed.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

from ..config import settings
from ..logging import get_logger

logger = get_logger("audio.separate")


async def separate_vocals(
    src: Path, out_dir: Path, *, model: str = "htdemucs"
) -> tuple[Path, Path]:
    """Split ``src`` into ``(vocals_wav, accompaniment_wav)`` using Demucs two-stems.

    Raises ``RuntimeError`` if Demucs is not installed or separation fails. Callers
    that want graceful degradation should catch and fall back to the original audio.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems=vocals",
        "-n",
        model,
        "-d",
        settings.torch_device,
        "-o",
        str(out_dir),
        str(src),
    ]
    logger.info("Demucs separating", src=str(src), model=model, device=settings.torch_device)
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        msg = stderr.decode("utf-8", errors="replace")[-600:]
        if "No module named" in msg or "ModuleNotFoundError" in msg:
            raise RuntimeError(
                "Demucs is not installed. Run `cd apps/worker && uv sync --extra demucs` first."
            )
        raise RuntimeError(f"Demucs separation failed: {msg}")

    # Demucs writes to <out_dir>/<model>/<track_stem>/{vocals,no_vocals}.wav
    stem_dir = out_dir / model / src.stem
    vocals = stem_dir / "vocals.wav"
    accompaniment = stem_dir / "no_vocals.wav"
    if not vocals.exists() or not accompaniment.exists():
        raise RuntimeError(f"Demucs output missing in {stem_dir}")
    logger.info("Demucs done", vocals=str(vocals), accompaniment=str(accompaniment))
    return vocals, accompaniment


async def mix_over_bed(vocals: Path, bed: Path, out_path: Path) -> Path:
    """Mix a vocal track over an instrumental bed (ffmpeg ``amix``). Returns ``out_path``.

    The bed is ducked slightly (0.8) so the replaced speech stays in front. Output
    length is bounded by the longer input so trailing music is preserved.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(vocals),
        "-i",
        str(bed),
        "-filter_complex",
        "[1:a]volume=0.8[bed];[0:a][bed]amix=inputs=2:duration=longest:normalize=0[out]",
        "-map",
        "[out]",
        str(out_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg mix_over_bed failed: {stderr.decode('utf-8', errors='replace')[-400:]}"
        )
    return out_path
