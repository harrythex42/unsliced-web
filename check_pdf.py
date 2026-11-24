"""Check printed pages against the actual preview and export page images."""
import json
import sys
from pathlib import Path

import pymupdf
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from verify_pdf_text import compact


expected = json.load(sys.stdin)
source, target = sys.argv[1:3]
reader = PdfReader(source)
result = dict(pages=len(reader.pages), starts=[], text=[], blank=[], nonA4=[], missingSearch=[], imageMismatch=[])
with pymupdf.open(source) as pdf:
    for index, page in enumerate(pdf):
        n = index + 1
        actual = compact(reader.pages[index].extract_text() or "")
        pixmap = page.get_pixmap(dpi=120)
        pixmap.save(f"{target}-{n}.png")
        if not actual and min(pixmap.samples) == 255:
            result["blank"].append(n)
        if abs(page.rect.width - 595.28) > 1.5 or abs(page.rect.height - 841.89) > 1.5:
            result["nonA4"].append(n)
        if index >= len(expected):
            result["starts"].append(n)
            result["text"].append(n)
            continue
        preview = expected[index]
        first = compact(preview["first"])
        if first and not actual.startswith(first):
            result["starts"].append(n)
        if actual != compact(preview["text"]):
            result["text"].append(n)
        candidates = preview["search"]
        if candidates and not any(page.search_for(phrase) for phrase in candidates):
            result["missingSearch"].append(n)
        if len(page.get_image_info()) != preview["images"]:
            result["imageMismatch"].append(n)
print(json.dumps(result))
