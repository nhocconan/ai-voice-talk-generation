"""Pure audio I/O helper tests."""

from worker.audio.io import _atempo_filters


def test_atempo_filters_stay_in_supported_range() -> None:
    assert _atempo_filters(1.25) == ["atempo=1.250000"]
    assert _atempo_filters(4.0) == ["atempo=2.000000", "atempo=2.000000"]
    assert _atempo_filters(0.25) == ["atempo=0.500000", "atempo=0.500000"]
