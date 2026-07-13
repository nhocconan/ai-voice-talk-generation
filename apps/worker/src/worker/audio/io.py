"""ffmpeg-based audio I/O helpers."""
import asyncio
from pathlib import Path

SAMPLE_RATE = 24000
CHANNELS = 1


async def normalize_audio(src: Path, dest: Path) -> None:
    """Resample to 24kHz mono WAV, normalize loudness to -16 LUFS."""
    # First pass: measure integrated loudness
    cmd_measure = [
        "ffmpeg", "-y", "-i", str(src),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd_measure,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg loudness measure failed: {stderr.decode()}")

    # Second pass: apply normalization + resample
    cmd_normalize = [
        "ffmpeg", "-y", "-i", str(src),
        "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11,aresample={SAMPLE_RATE}",
        "-ac", str(CHANNELS),
        "-ar", str(SAMPLE_RATE),
        "-sample_fmt", "s16",
        str(dest),
    ]
    proc2 = await asyncio.create_subprocess_exec(
        *cmd_normalize,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr2 = await proc2.communicate()
    if proc2.returncode != 0:
        raise RuntimeError(f"ffmpeg normalize failed: {stderr2.decode()}")


async def encode_mp3(src_wav: Path, dest_mp3: Path, bitrate: str = "320k") -> None:
    cmd = [
        "ffmpeg", "-y", "-i", str(src_wav),
        "-codec:a", "libmp3lame", "-b:a", bitrate,
        "-id3v2_version", "3",
        str(dest_mp3),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"MP3 encode failed: {stderr.decode()}")


async def encode_wav_24bit(src: Path, dest: Path) -> None:
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-ar", str(SAMPLE_RATE),
        "-ac", "1",
        "-codec:a", "pcm_s24le",
        "-sample_fmt", "s32",
        str(dest),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        fallback = [
            "ffmpeg", "-y", "-i", str(src),
            "-ar", str(SAMPLE_RATE),
            "-ac", "1",
            "-codec:a", "pcm_s16le",
            str(dest),
        ]
        proc2 = await asyncio.create_subprocess_exec(
            *fallback,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr2 = await proc2.communicate()
        if proc2.returncode != 0:
            raise RuntimeError(
                "WAV encode failed. 24-bit error: "
                f"{stderr.decode()}\n16-bit fallback error: {stderr2.decode()}"
            )


async def get_duration_ms(path: Path) -> int:
    """Get audio duration in milliseconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", str(path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    import json
    data = json.loads(stdout)
    duration = float(data["streams"][0]["duration"])
    return int(duration * 1000)


async def fit_audio_duration(src: Path, dest: Path, target_ms: int) -> None:
    """Time-stretch audio to an exact duration without changing vocal pitch."""
    if target_ms <= 0:
        raise ValueError("target_ms must be positive")
    source_ms = await get_duration_ms(src)
    if source_ms <= 0:
        raise ValueError("source audio must have positive duration")
    filters = _atempo_filters(source_ms / target_ms)
    filters.extend(["apad", f"atrim=duration={target_ms / 1000:.6f}"])
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-af", ",".join(filters),
        "-ar", str(SAMPLE_RATE),
        "-ac", str(CHANNELS),
        "-sample_fmt", "s16",
        str(dest),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg duration fit failed: {stderr.decode()}")


def _atempo_filters(factor: float) -> list[str]:
    """Split an atempo ratio into ffmpeg's conservative 0.5-2.0 range."""
    if factor <= 0:
        raise ValueError("tempo factor must be positive")
    filters: list[str] = []
    while factor > 2.0:
        filters.append("atempo=2.000000")
        factor /= 2.0
    while factor < 0.5:
        filters.append("atempo=0.500000")
        factor /= 0.5
    filters.append(f"atempo={factor:.6f}")
    return filters
