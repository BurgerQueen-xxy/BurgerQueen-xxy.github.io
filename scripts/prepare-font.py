"""Package Xiaolai v3.126 as two lazy-loaded WOFF2 subsets.

Usage: python scripts/prepare-font.py /path/to/Xiaolai-Regular.ttf
Requires fonttools[woff]. The original download and license are in FONTS.md.
This is an asset preparation step, not a dependency of the site build.
"""
from pathlib import Path
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "assets" / "fonts"


def common_character(codepoint):
    if codepoint <= 0x04FF or 0x2000 <= codepoint <= 0x2BFF or 0xFE10 <= codepoint <= 0xFEFF:
        return True
    try:
        chr(codepoint).encode("gb2312")
        return True
    except UnicodeEncodeError:
        return False


def unicode_ranges(codepoints):
    ranges = []
    start = end = codepoints[0]
    for codepoint in codepoints[1:]:
        if codepoint == end + 1:
            end = codepoint
        else:
            ranges.append(f"U+{start:X}" if start == end else f"U+{start:X}-{end:X}")
            start = end = codepoint
    ranges.append(f"U+{start:X}" if start == end else f"U+{start:X}-{end:X}")
    return ",".join(ranges)


source = Path(sys.argv[1])
with TTFont(source) as original:
    # Emoji keep the system's colour emoji presentation.
    codepoints = sorted(cp for cp in original.getBestCmap() if not 0x1F000 <= cp <= 0x1FAFF)
OUTPUT.mkdir(parents=True, exist_ok=True)
rules = ["/* Xiaolai v3.126 · SIL OFL 1.1 · see ../xiaolai-OFL.txt and ../FONTS.md */"]
for name, common in [("common", True), ("extended", False)]:
    characters = [cp for cp in codepoints if common_character(cp) == common]
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    with TTFont(source) as font:
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=characters)
        subsetter.subset(font)
        font.flavor = "woff2"
        destination = OUTPUT / f"xiaolai-{name}.woff2"
        font.save(destination)
    rules.append("@font-face{font-family:Xiaolai;src:url('./xiaolai-" + name +
                 ".woff2') format('woff2');font-style:normal;font-weight:400;font-display:swap;unicode-range:" +
                 unicode_ranges(characters) + "}")
    print(f"{destination.name}: {len(characters)} characters, {destination.stat().st_size:,} bytes")
(OUTPUT / "xiaolai.css").write_text("\n".join(rules) + "\n", encoding="utf-8")
