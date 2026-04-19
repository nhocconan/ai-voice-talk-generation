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
        "-sample_fmt", "s32",
        "-ac", "1",
        str(dest),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"WAV 24-bit encode failed: {stderr.decode()}")


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
