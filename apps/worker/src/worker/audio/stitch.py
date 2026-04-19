"""Audio stitching with crossfade."""
from pathlib import Path
import numpy as np
import soundfile as sf

CROSSFADE_MS = 80
SAMPLE_RATE = 24000


def stitch_segments(segment_paths: list[Path], output_path: Path, crossfade_ms: int = CROSSFADE_MS) -> None:
    """Concatenate WAV segments with crossfade and write to output_path."""
    if not segment_paths:
        raise ValueError("No segments to stitch")

    crossfade_samples = int(crossfade_ms * SAMPLE_RATE / 1000)
    result = np.array([], dtype=np.float32)

    for i, path in enumerate(segment_paths):
        audio, _ = sf.read(str(path), dtype="float32")
        if audio.ndim > 1:
            audio = audio[:, 0]

        if i == 0:
            result = audio
        else:
            if len(result) >= crossfade_samples and len(audio) >= crossfade_samples:
                # Fade out end of result
                fade_out = np.linspace(1.0, 0.0, crossfade_samples)
                result[-crossfade_samples:] *= fade_out
                # Fade in start of audio
                fade_in = np.linspace(0.0, 1.0, crossfade_samples)
                audio[:crossfade_samples] *= fade_in
                # Overlap
                result[-crossfade_samples:] += audio[:crossfade_samples]
                result = np.concatenate([result, audio[crossfade_samples:]])
            else:
                result = np.concatenate([result, audio])

    # Normalize peak
    peak = np.max(np.abs(result))
    if peak > 0.98:
        result = result * (0.95 / peak)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), result, SAMPLE_RATE, subtype="PCM_16")
