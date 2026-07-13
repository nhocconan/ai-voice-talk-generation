"""Selective revoice keeps unselected speaker audio in the source timeline."""

from __future__ import annotations

import io
import shutil
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from worker.pipelines.render import SAMPLE_RATE, _render_revoice
from worker.providers.base import VoiceRef


class ToneProvider:
    name = "TEST"
    max_chunk_chars = 1000

    async def synthesize(
        self,
        text: str,
        voice: VoiceRef,
        lang: str,
        speed: float = 1.0,
        style: str | None = None,
    ) -> bytes:
        del text, voice, lang, speed, style
        samples = np.arange(SAMPLE_RATE // 2) / SAMPLE_RATE
        tone = (0.4 * np.sin(2 * np.pi * 880 * samples)).astype("float32")
        output = io.BytesIO()
        sf.write(output, tone, SAMPLE_RATE, format="WAV", subtype="PCM_16")
        return output.getvalue()


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
@pytest.mark.asyncio
async def test_kept_speaker_remains_and_selected_speaker_is_replaced(tmp_path: Path) -> None:
    samples = np.arange(SAMPLE_RATE) / SAMPLE_RATE
    original = (0.3 * np.sin(2 * np.pi * 440 * samples)).astype("float32")
    source = tmp_path / "source.wav"
    sf.write(source, original, SAMPLE_RATE, subtype="PCM_16")

    async def progress(*_args: object) -> None:
        return None

    output, chapters = await _render_revoice(
        tmp_dir=tmp_path,
        source_wav=source,
        speakers=[
            {
                "label": "A",
                "keepOriginal": True,
                "segments": [{"startMs": 0, "endMs": 500, "text": "keep"}],
            },
            {
                "label": "B",
                "keepOriginal": False,
                "segments": [{"startMs": 500, "endMs": 1000, "text": "replace"}],
            },
        ],
        voice_refs={"B": VoiceRef("TEST", {})},
        provider=ToneProvider(),
        progress_fn=progress,
        generation_id="generation-test",
    )

    rendered, _ = sf.read(output, dtype="float32")
    midpoint = SAMPLE_RATE // 2
    assert np.max(np.abs(rendered[:midpoint] - original[:midpoint])) < 1e-3
    assert np.mean(np.abs(rendered[midpoint:] - original[midpoint:])) > 0.1
    assert [chapter["title"] for chapter in chapters] == ["[A] keep", "[B] replace"]
