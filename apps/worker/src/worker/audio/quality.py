"""Voice sample quality scoring."""
import numpy as np
import soundfile as sf
from pathlib import Path
from dataclasses import dataclass


@dataclass
class QualityDetail:
    snr_db: float
    pitch_std_hz: float
    clipping_ratio: float
    noise_floor_db: float
    duration_s: float


def score_sample(wav_path: Path) -> tuple[int, QualityDetail]:
    """Compute 0–100 quality score for a normalized 24kHz mono WAV."""
    audio, sr = sf.read(str(wav_path))
    if audio.ndim > 1:
        audio = audio[:, 0]

    duration_s = len(audio) / sr
    clipping = float(np.mean(np.abs(audio) > 0.99))
    noise_floor_db = _estimate_noise_floor(audio, sr)
    snr_db = _estimate_snr(audio)
    pitch_std = _estimate_pitch_variance(audio, sr)

    # Score components (weights sum to 100)
    duration_score = min(duration_s / 30, 1.0) * 25
    snr_score = min(max((snr_db - 5) / 25, 0), 1.0) * 30
    clipping_score = max(1.0 - clipping * 20, 0) * 20
    noise_score = min(max((-noise_floor_db - 20) / 50, 0), 1.0) * 15
    pitch_score = min(max(1 - pitch_std / 100, 0), 1.0) * 10

    total = int(duration_score + snr_score + clipping_score + noise_score + pitch_score)

    detail = QualityDetail(
        snr_db=round(snr_db, 1),
        pitch_std_hz=round(pitch_std, 1),
        clipping_ratio=round(clipping, 4),
        noise_floor_db=round(noise_floor_db, 1),
        duration_s=round(duration_s, 1),
    )
    return max(0, min(100, total)), detail


def _estimate_noise_floor(audio: np.ndarray, sr: int) -> float:
    """Estimate noise floor using the quietest 10% of frames."""
    frame_size = sr // 10
    if len(audio) < frame_size:
        return float(20 * np.log10(np.sqrt(np.mean(audio**2)) + 1e-10))
    rms = [np.sqrt(np.mean(audio[i:i + frame_size]**2)) for i in range(0, len(audio) - frame_size, frame_size)]
    rms_sorted = sorted(rms)
    noise_rms = np.mean(rms_sorted[:max(1, len(rms_sorted) // 10)])
    return float(20 * np.log10(noise_rms + 1e-10))


def _estimate_snr(audio: np.ndarray) -> float:
    signal_rms = np.sqrt(np.mean(audio**2))
    # Simple SNR approximation
    noise_floor = np.percentile(np.abs(audio), 5)
    snr = 20 * np.log10(signal_rms / (noise_floor + 1e-10))
    return float(min(snr, 60))


def _estimate_pitch_variance(audio: np.ndarray, sr: int) -> float:
    """Rough pitch variance via zero-crossing rate variance (proxy)."""
    frame_size = sr // 20
    zcrs = []
    for i in range(0, len(audio) - frame_size, frame_size):
        frame = audio[i:i + frame_size]
        zcr = np.sum(np.abs(np.diff(np.sign(frame)))) / (2 * len(frame))
        zcrs.append(zcr * sr)
    if not zcrs:
        return 0.0
    return float(np.std(zcrs))
