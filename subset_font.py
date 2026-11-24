"""Split the PDF-friendly Unsliced font without remerging its glyph aliases."""
import hashlib
import json
import shutil
import sys
from pathlib import Path

import brotli
import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "packages/playwright/assets/fonts/UnslicedSansSC.ttf"
# Match the CJK coverage used for the original font in MCP, leaving Latin alone.
RANGES = [(0x2E80, 0x2FFF), (0x3000, 0x303F), (0x31C0, 0x31EF),
          (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF),
          (0xFE30, 0xFE4F), (0xFF00, 0xFFEF), (0x20000, 0x323AF)]


def ranges(points):
    runs = []
    for cp in sorted(points):
        if runs and runs[-1][1] + 1 == cp:
            runs[-1][1] = cp
        else:
            runs.append([cp, cp])
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in runs)


def build(folder):
    folder.mkdir(parents=True, exist_ok=True)
    cache = folder.parent / ".font-build.json"
    license_path = FONT.with_name("OFL.txt")
    stamp = hashlib.sha256(FONT.read_bytes() + license_path.read_bytes() + Path(__file__).read_bytes() +
                           (fontTools.__version__ + brotli.__version__).encode()).hexdigest()
    if cache.exists():
        previous = json.loads(cache.read_text(encoding="utf-8"))
        if previous["stamp"] == stamp and all((folder / name).is_file() for name in previous["files"]):
            return

    original = TTFont(FONT)
    cmap = original.getBestCmap()
    covered = {cp for cp in cmap if any(a <= cp <= b for a, b in RANGES)}
    assert len({cmap[cp] for cp in covered}) == len(covered), "Source font lost distinct glyph IDs"
    # GB2312 level 1 is an existing, sample-independent set of common Han characters.
    common = {ord(bytes([row, cell]).decode("gb2312")) for row in range(0xB0, 0xD8)
              for cell in range(0xA1, (0xF9 if row == 0xD7 else 0xFE) + 1)}
    common |= {cp for cp in covered if cp < 0x3400 or 0xFE30 <= cp <= 0xFFEF}
    common &= covered
    rest = sorted(covered - common)
    parts = [common] + [rest[i:i + 512] for i in range(0, len(rest), 512)]
    assert sum(map(len, parts)) == len(covered)
    css, files = [], []
    for index, points in enumerate(parts):
        name = f"sc-{index:02d}.woff2"
        font = TTFont(FONT, recalcTimestamp=False)
        options = subset.Options()
        options.glyph_names = True
        options.layout_features = ["*"]
        cutter = subset.Subsetter(options=options)
        cutter.populate(unicodes=points)
        cutter.subset(font)
        font.flavor = "woff2"
        font.save(folder / name)
        with TTFont(folder / name) as reopened:
            assert reopened.getBestCmap() == {cp: cmap[cp] for cp in points}, name
            for glyph in reopened.getBestCmap().values():
                assert reopened["hmtx"][glyph] == original["hmtx"][glyph], glyph
        css.append(f'@font-face{{font-family:"Unsliced Sans SC";'
                   f'src:url("./{name}") format("woff2");font-weight:400;unicode-range:{ranges(points)}}}')
        files.append(name)
    (folder / "font.css").write_text("\n".join(css), encoding="utf-8")
    shutil.copyfile(license_path, folder / "OFL.txt")
    cache.write_text(json.dumps({"stamp": stamp, "files": [*files, "font.css", "OFL.txt"]}), encoding="utf-8")


if __name__ == "__main__":
    build(Path(sys.argv[1]))
