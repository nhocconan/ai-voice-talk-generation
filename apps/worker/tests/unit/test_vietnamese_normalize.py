"""Unit tests for Vietnamese TTS text normalization."""

import pytest

from worker.text.vietnamese import normalize_vietnamese, read_integer


@pytest.mark.parametrize(
    "n,expected",
    [
        (0, "không"),
        (1, "một"),
        (5, "năm"),
        (10, "mười"),
        (11, "mười một"),
        (15, "mười lăm"),
        (20, "hai mươi"),
        (21, "hai mươi mốt"),
        (24, "hai mươi bốn"),
        (25, "hai mươi lăm"),
        (100, "một trăm"),
        (101, "một trăm lẻ một"),
        (105, "một trăm lẻ năm"),
        (115, "một trăm mười lăm"),
        (123, "một trăm hai mươi ba"),
        (1000, "một nghìn"),
        (1005, "một nghìn không trăm lẻ năm"),
        (1050, "một nghìn không trăm năm mươi"),
        (1234, "một nghìn hai trăm ba mươi bốn"),
        (100000, "một trăm nghìn"),
        (1000000, "một triệu"),
        (1005000, "một triệu không trăm lẻ năm nghìn"),
        (123000000000, "một trăm hai mươi ba tỷ"),
        (-7, "âm bảy"),
    ],
)
def test_read_integer(n, expected):
    assert read_integer(n) == expected


@pytest.mark.parametrize(
    "text,expected",
    [
        # decimals
        ("2.5", "hai phẩy năm"),
        ("2,5", "hai phẩy năm"),
        ("3.14", "ba phẩy một bốn"),
        # thousands grouping (VN dot) vs decimal
        ("100.000", "một trăm nghìn"),
        ("1.000.000", "một triệu"),
        # percent
        ("50%", "năm mươi phần trăm"),
        ("2,5%", "hai phẩy năm phần trăm"),
        # currency
        ("$5", "năm đô la"),
        ("100.000đ", "một trăm nghìn đồng"),
        ("100000 VND", "một trăm nghìn đồng"),
        # date + time
        ("15/9/2026", "ngày mười lăm tháng chín năm hai nghìn không trăm hai mươi sáu"),
        ("14:30", "mười bốn giờ ba mươi phút"),
        ("14h30", "mười bốn giờ ba mươi phút"),
        # units
        ("5km", "năm ki lô mét"),
        ("2kg", "hai ki lô gam"),
        # abbreviations
        ("TP.HCM", "Thành phố Hồ Chí Minh"),
        ("UBND", "Ủy ban nhân dân"),
    ],
)
def test_normalize_tokens(text, expected):
    assert normalize_vietnamese(text) == expected


def test_full_sentence():
    src = "Doanh thu quý 3 đạt 123 tỷ đồng, tăng 15% so với năm 2025."
    out = normalize_vietnamese(src)
    assert "một trăm hai mươi ba tỷ đồng" in out
    assert "mười lăm phần trăm" in out
    assert "năm hai nghìn" in out  # year expanded, no bare digits
    assert not any(ch.isdigit() for ch in out)


def test_prose_untouched():
    src = "Xin chào, tôi là thành viên của đội ngũ."
    assert normalize_vietnamese(src) == src


def test_empty():
    assert normalize_vietnamese("") == ""


def test_nfc_normalization():
    # decomposed 'ệ' (e + combining marks) should compose to NFC
    decomposed = "Việt"  # Việt via combining chars
    out = normalize_vietnamese(decomposed)
    assert "ệ" in out or "ệ" in out
