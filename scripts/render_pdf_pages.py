"""Rasterize PDF pages for acceptance artifacts on all CI platforms."""
import sys

import pymupdf

with pymupdf.open(sys.argv[1]) as pdf:
    digits = len(str(len(pdf)))
    for number, page in enumerate(pdf, 1):
        page.get_pixmap(dpi=int(sys.argv[3])).save(f"{sys.argv[2]}-{number:0{digits}}.png")
