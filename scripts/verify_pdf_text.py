"""Compare Unicode text extracted from a PDF against the original HTML sections."""

import json
import sys
from bisect import bisect_right
from difflib import SequenceMatcher
from itertools import accumulate
from pathlib import Path
from unicodedata import name, normalize

from pypdf import PdfReader


def compact(text):
    return "".join(text.split())


def describe(text):
    fragment = text[:40]
    suffix = "…" if len(text) > len(fragment) else ""
    codes = " ".join(f"U+{ord(character):04X}" for character in fragment)
    return f"{fragment!r}{suffix} [{codes}]" if fragment else "∅"


def compare(sections, pages):
    expected_parts = [compact(section["text"]) for section in sections]
    actual_parts = [compact(page) for page in pages]
    expected, actual = "".join(expected_parts), "".join(actual_parts)
    if expected == actual:
        return []

    section_ends = list(accumulate(map(len, expected_parts)))
    page_ends = list(accumulate(map(len, actual_parts)))
    differences = []
    for operation, start, stop, actual_start, actual_stop in SequenceMatcher(
        None, expected, actual, autojunk=False
    ).get_opcodes():
        if operation == "equal":
            continue

        first_section = bisect_right(section_ends, start)
        last_section = bisect_right(section_ends, max(start, stop - 1))
        labels = [section["label"] for section in sections[first_section:last_section + 1]]
        if not labels:
            labels = [sections[-1]["label"] + "（之后）"] if sections else ["文档正文"]

        expected_text = expected[start:stop]
        actual_text = actual[actual_start:actual_stop]
        if operation == "replace":
            looks_similar = normalize("NFKC", expected_text) == normalize("NFKC", actual_text)
            looks_similar |= any("RADICAL" in name(char, "") for char in actual_text)
            kind = "形似字／兼容字" if looks_similar else "字符不一致（含可能的形似字）"
        else:
            kind = {"delete": "少字", "insert": "多字"}[operation]

        page = min(len(pages), bisect_right(page_ends, actual_start) + 1)
        excerpt = expected[max(0, start - 16):min(len(expected), stop + 16)][:72]
        differences.append(
            f"{kind}，PDF 第 {page} 页，原文 {'、'.join(labels)}，附近「{excerpt}」。"
            f"原文 {describe(expected_text)}，PDF {describe(actual_text)}。"
        )
    return differences


if __name__ == "__main__":
    reference = json.load(sys.stdin)
    sections = reference["sections"]
    headers = reference["headers"]
    reader = PdfReader(Path(sys.argv[1]))
    pages = [page.extract_text() for page in reader.pages]
    # Verify exactly one known source header at the start of each continuation.
    # Removing arbitrary matching substrings would hide extra or missing text.
    errors = []
    for number, header in headers.items():
        index = int(number) - 1
        if index >= len(pages) or not compact(pages[index]).startswith(header):
            errors.append(f"PDF 第 {number} 页缺少原表的续页表头")
        else:
            pages[index] = compact(pages[index])[len(header):]
    embedded_fonts = set()
    for page in reader.pages:
        resources = page["/Resources"].get_object()
        for reference in resources.get("/Font", {}).get_object().values() if "/Font" in resources else ():
            font = reference.get_object()
            faces = [child.get_object() for child in font["/DescendantFonts"]] if "/DescendantFonts" in font else [font]
            for face in faces:
                descriptor = face.get("/FontDescriptor")
                if descriptor and any(key in descriptor.get_object() for key in ("/FontFile", "/FontFile2", "/FontFile3")):
                    embedded_fonts.add(str(face["/BaseFont"]))
    print(json.dumps({
        "pages": len(pages),
        "paperPoints": [float(reader.pages[0].mediabox.width), float(reader.pages[0].mediabox.height)] if pages else [],
        "differences": errors + compare(sections, pages),
        "embeddedFonts": sorted(embedded_fonts)
    }, ensure_ascii=False))
