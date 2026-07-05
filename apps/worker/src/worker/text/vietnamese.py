"""Vietnamese text normalization for TTS.

Converts non-standard words (numbers, dates, times, currency, percentages,
common abbreviations) into their spoken Vietnamese form *before* the text is
handed to a TTS engine. Without this, "123 tỷ", "15/9/2026", "2,5%" or
"100.000đ" are read digit-by-digit or skipped, which wrecks naturalness for
podcast / presentation content.

Design notes
------------
* Pure-Python, dependency-free and deterministic, so it unit-tests cleanly and
  needs no native build. A heavier library (e.g. ``vinorm``) can be layered in
  later behind the same ``normalize_vietnamese`` entry point.
* Vietnamese uses ``.`` as the thousands separator and ``,`` as the decimal
  separator, but real-world text mixes both conventions, so number parsing
  applies a best-effort heuristic (see ``_split_number``).
* Vietnamese is largely phonetic and monosyllabic — no separate G2P/phonemizer
  is needed here; the win is number-standardization + NFC Unicode composition.
"""

from __future__ import annotations

import re
import unicodedata

# ── Number reading ──────────────────────────────────────────────────────────

_ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
# 10^3k scale words. Vietnamese: nghìn (10^3), triệu (10^6), tỷ (10^9), then it
# composes as "nghìn tỷ", "triệu tỷ", "tỷ tỷ" for the higher groups.
_SCALES = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ", "tỷ tỷ"]


def _read_two(tens: int, unit: int, *, leading: bool) -> str:
    """Read the tens+unit part (0–99). ``leading`` suppresses the ``lẻ`` filler."""
    if tens == 0:
        if unit == 0:
            return ""
        return _ONES[unit] if leading else f"lẻ {_ONES[unit]}"

    out = "mười" if tens == 1 else f"{_ONES[tens]} mươi"
    if unit == 0:
        return out
    if unit == 1 and tens >= 2:
        return f"{out} mốt"
    if unit == 5:  # 15 → mười lăm, 25 → hai mươi lăm
        return f"{out} lăm"
    return f"{out} {_ONES[unit]}"


def _read_three(n: int, *, leading: bool) -> str:
    """Read a 3-digit group (0–999). ``leading`` = most-significant group."""
    hundreds, rem = divmod(n, 100)
    tens, unit = divmod(rem, 10)
    if hundreds:
        head = f"{_ONES[hundreds]} trăm"
        tail = _read_two(tens, unit, leading=False)
        return f"{head} {tail}".strip()
    # No hundreds. Middle groups still say "không trăm" so 1_005 → "… không trăm lẻ năm".
    if leading:
        return _read_two(tens, unit, leading=True)
    tail = _read_two(tens, unit, leading=False)
    return f"không trăm {tail}".strip()


def read_integer(n: int) -> str:
    """Read a non-negative or negative integer as Vietnamese words."""
    if n == 0:
        return "không"
    negative = n < 0
    n = abs(n)

    groups: list[int] = []
    while n > 0:
        groups.append(n % 1000)
        n //= 1000

    top = len(groups) - 1
    parts: list[str] = []
    for idx in range(top, -1, -1):
        g = groups[idx]
        if g == 0:
            continue
        words = _read_three(g, leading=(idx == top))
        scale = _SCALES[idx] if idx < len(_SCALES) else _SCALES[-1]
        parts.append(f"{words} {scale}".strip())

    result = " ".join(parts).strip()
    return f"âm {result}" if negative else result


def _read_digits(digits: str) -> str:
    """Read a run of digits one-by-one (used for the fractional part)."""
    return " ".join(_ONES[int(d)] for d in digits if d.isdigit())


def _split_number(token: str) -> tuple[bool, str, str | None]:
    """Split a numeric token into (negative, integer_digits, frac_digits|None).

    Handles both ``1.234,56`` (VN) and ``1,234.56`` (EN) grouping, plus the
    ambiguous single-separator case via a 3-digit-group heuristic.
    """
    token = token.strip()
    negative = token.startswith("-")
    token = token.lstrip("+-")

    has_dot = "." in token
    has_comma = "," in token

    if has_dot and has_comma:
        dec_sep = "." if token.rfind(".") > token.rfind(",") else ","
        thou_sep = "," if dec_sep == "." else "."
        intp, _, frac = token.rpartition(dec_sep)
        return negative, intp.replace(thou_sep, ""), frac

    sep = "." if has_dot else ("," if has_comma else None)
    if sep is None:
        return negative, token, None

    parts = token.split(sep)
    # Thousands grouping: every group after the first is exactly 3 digits.
    if len(parts) >= 2 and all(len(p) == 3 for p in parts[1:]) and 1 <= len(parts[0]) <= 3:
        return negative, "".join(parts), None
    # Otherwise treat the first separator as a decimal point.
    return negative, parts[0], "".join(parts[1:])


def _num_to_words(token: str) -> str:
    negative, intp, frac = _split_number(token)
    intp = intp.lstrip("0") or "0"
    try:
        words = read_integer(int(intp))
    except ValueError:
        return token
    if negative and words != "không":
        words = f"âm {words}"
    if frac:
        words = f"{words} phẩy {_read_digits(frac)}"
    return words


# ── Domain expanders (run before generic number expansion) ──────────────────

_NUM = r"\d[\d.,]*\d|\d"  # a number token, optionally with . / , separators


def _expand_datetime(text: str) -> str:
    # Dates: dd/mm/yyyy or dd/mm/yy → "ngày D tháng M năm Y"
    def _date(m: re.Match[str]) -> str:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        yy = 2000 + y if y < 100 else y
        return f"ngày {read_integer(d)} tháng {read_integer(mo)} năm {read_integer(yy)}"

    text = re.sub(r"\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b", _date, text)

    # Bare dd/mm (no year): treat as a date only when it looks like one.
    def _short(m: re.Match[str]) -> str:
        a, b = int(m.group(1)), int(m.group(2))
        if 1 <= a <= 31 and 1 <= b <= 12:
            return f"ngày {read_integer(a)} tháng {read_integer(b)}"
        return f"{read_integer(a)} trên {read_integer(b)}"

    text = re.sub(r"\b(\d{1,2})/(\d{1,2})\b", _short, text)

    # Times: HH:MM or HHhMM → "H giờ M phút"; trailing "Hh" → "H giờ"
    text = re.sub(
        r"\b(\d{1,2}):(\d{2})\b",
        lambda m: f"{read_integer(int(m.group(1)))} giờ {read_integer(int(m.group(2)))} phút",
        text,
    )
    text = re.sub(
        r"\b(\d{1,2})h(\d{2})\b",
        lambda m: f"{read_integer(int(m.group(1)))} giờ {read_integer(int(m.group(2)))} phút",
        text,
    )
    text = re.sub(
        r"\b(\d{1,2})h\b",
        lambda m: f"{read_integer(int(m.group(1)))} giờ",
        text,
    )
    return text


def _expand_percent(text: str) -> str:
    return re.sub(rf"({_NUM})\s*%", lambda m: f"{_num_to_words(m.group(1))} phần trăm", text)


def _expand_currency(text: str) -> str:
    # $5, US$5 → "năm đô la"
    text = re.sub(rf"(?:US)?\$\s?({_NUM})", lambda m: f"{_num_to_words(m.group(1))} đô la", text)
    # 5$ / 5 USD → "năm đô la"
    text = re.sub(rf"({_NUM})\s?(?:\$|USD)\b", lambda m: f"{_num_to_words(m.group(1))} đô la", text)
    # 100.000đ / 100.000 đồng / 5 triệu đồng / 100000 VND → "… đồng"
    text = re.sub(
        rf"({_NUM})\s?(?:đồng|VNĐ|VND|₫)\b",
        lambda m: f"{_num_to_words(m.group(1))} đồng",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(rf"({_NUM})đ\b", lambda m: f"{_num_to_words(m.group(1))} đồng", text)
    return text


_UNITS = {
    "km": "ki lô mét",
    "kg": "ki lô gam",
    "cm": "xen ti mét",
    "mm": "mi li mét",
    "m2": "mét vuông",
    "km2": "ki lô mét vuông",
}


def _expand_units(text: str) -> str:
    def _unit(m: re.Match[str]) -> str:
        return f"{_num_to_words(m.group(1))} {_UNITS[m.group(2).lower()]}"

    pattern = rf"({_NUM})\s?(km2|m2|km|kg|cm|mm)\b"
    return re.sub(pattern, _unit, text)


# Conservative, case-sensitive abbreviation map. Longest keys first so
# "TP.HCM" wins over "TP.". Kept small to avoid false positives; extend per site.
_ABBREVIATIONS: list[tuple[str, str]] = [
    ("TP.HCM", "Thành phố Hồ Chí Minh"),
    ("TP. HCM", "Thành phố Hồ Chí Minh"),
    ("TPHCM", "Thành phố Hồ Chí Minh"),
    ("UBND", "Ủy ban nhân dân"),
    ("HĐND", "Hội đồng nhân dân"),
    ("PGS.", "Phó giáo sư "),
    ("PGS", "Phó giáo sư"),
    ("GS.", "Giáo sư "),
    ("ThS.", "Thạc sĩ "),
    ("TS.", "Tiến sĩ "),
    ("TP.", "Thành phố "),
    ("Q.", "Quận "),
    ("P.", "Phường "),
    ("Đ/c", "Đồng chí"),
]


def _expand_abbreviations(text: str) -> str:
    for abbr, full in _ABBREVIATIONS:
        text = re.sub(re.escape(abbr), full, text)
    return text


def _expand_numbers(text: str) -> str:
    return re.sub(_NUM, lambda m: _num_to_words(m.group(0)), text)


def normalize_vietnamese(text: str) -> str:
    """Expand Vietnamese NSW (numbers/dates/currency/etc.) to spoken form.

    Idempotent-ish and safe on plain prose (leaves ordinary words untouched).
    """
    if not text:
        return text
    text = unicodedata.normalize("NFC", text)
    text = _expand_abbreviations(text)
    text = _expand_datetime(text)
    text = _expand_percent(text)
    text = _expand_currency(text)
    text = _expand_units(text)
    text = _expand_numbers(text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()
