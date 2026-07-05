"""Unit tests for word-level animated captions."""

from worker.audio.captions import (
    _hex_to_ass,
    group_words_into_lines,
    write_karaoke_ass,
)


def _words(*specs):
    """specs: (text, start_ms, end_ms)."""
    return [{"text": t, "start_ms": s, "end_ms": e} for (t, s, e) in specs]


def test_group_by_max_words():
    ws = _words(*[(f"w{i}", i * 300, i * 300 + 250) for i in range(12)])
    lines = group_words_into_lines(ws, max_words=5, max_chars=999, max_gap_ms=99999)
    assert [len(l["words"]) for l in lines] == [5, 5, 2]
    assert lines[0]["start_ms"] == 0
    assert lines[0]["end_ms"] == ws[4]["end_ms"]


def test_group_splits_on_gap():
    ws = _words(("a", 0, 200), ("b", 300, 500), ("c", 2000, 2200))
    lines = group_words_into_lines(ws, max_words=10, max_chars=999, max_gap_ms=700)
    # big gap before "c" forces a new line
    assert len(lines) == 2
    assert [w["text"] for w in lines[0]["words"]] == ["a", "b"]
    assert [w["text"] for w in lines[1]["words"]] == ["c"]


def test_group_splits_on_chars():
    ws = _words(("aaaa", 0, 100), ("bbbb", 100, 200), ("cccc", 200, 300))
    lines = group_words_into_lines(ws, max_words=99, max_chars=10, max_gap_ms=99999)
    assert len(lines) >= 2


def test_group_skips_empty():
    ws = _words(("a", 0, 100), ("  ", 100, 150), ("b", 150, 250))
    lines = group_words_into_lines(ws, max_words=5, max_chars=99, max_gap_ms=99999)
    assert [w["text"] for w in lines[0]["words"]] == ["a", "b"]


def test_hex_to_ass():
    assert _hex_to_ass("#FFFFFF") == "&H00FFFFFF"
    assert _hex_to_ass("#E5001A") == "&H001A00E5"  # BGR order
    assert _hex_to_ass("bad") == "&H00FFFFFF"


def test_pop_preset_one_event_per_word(tmp_path):
    ws = _words(("Xin", 0, 300), ("chào", 300, 600), ("bạn", 600, 900))
    lines = group_words_into_lines(ws, max_words=5, max_chars=99, max_gap_ms=99999)
    out = write_karaoke_ass(lines, tmp_path / "cap.ass", preset="pop")
    content = out.read_text(encoding="utf-8")
    # 3 words → 3 Dialogue events
    assert content.count("Dialogue:") == 3
    assert "PlayResX: 1080" in content
    # active word gets recolour + scale tags
    assert "\\fscx115" in content
    assert "Xin" in content and "chào" in content


def test_karaoke_preset_one_event_per_line(tmp_path):
    ws = _words(("Xin", 0, 300), ("chào", 300, 600))
    lines = group_words_into_lines(ws, max_words=5, max_chars=99, max_gap_ms=99999)
    out = write_karaoke_ass(lines, tmp_path / "cap.ass", preset="karaoke")
    content = out.read_text(encoding="utf-8")
    assert content.count("Dialogue:") == 1
    assert "\\kf" in content


def test_escapes_braces(tmp_path):
    ws = _words(("{evil}", 0, 300),)
    lines = group_words_into_lines(ws, max_words=5, max_chars=99, max_gap_ms=99999)
    out = write_karaoke_ass(lines, tmp_path / "cap.ass", preset="pop")
    content = out.read_text(encoding="utf-8")
    # literal braces from user text must not leak as override blocks
    assert "{evil}" not in content
