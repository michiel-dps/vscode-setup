# Word Page: where does each page of a PDF start? (used for the page ends on the page)
#
#   python -I pdfpages.py draft.pdf
#
# Prints JSON: {"pages": [{"n": 1, "sideways": false, "lines": ["first line", ...]}, ...]}
# with the first lines of text of every page, from the top down. The page in VS Code
# looks for those lines in its own text and draws a dashed line with "page n" where it
# finds them (inject/word-page.template.js). A page lying on its side (a map or a wide
# table on a landscape page) is marked "sideways": it is not in the flow of the text.
#
# Needs the Python package PyMuPDF (pip install pymupdf). The add-on runs this file
# (extension.js) each time the PDF next to an open page changes.
import json
import sys

import pymupdf

LINES_PER_PAGE = 12   # enough to get past a figure or a table at the top of a page


def first_lines(page):
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if text:
                x0, y0 = line["bbox"][0], line["bbox"][1]
                lines.append((round(y0, 1), round(x0, 1), text))
    lines.sort()
    return [text for _, _, text in lines[:LINES_PER_PAGE]]


def main(file):
    document = pymupdf.open(file)
    pages = []
    for number, page in enumerate(document, start=1):
        sideways = page.rotation in (90, 270)
        pages.append({"n": number, "sideways": sideways, "lines": first_lines(page)})
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps({"pages": pages}, ensure_ascii=True))


if __name__ == "__main__":
    main(sys.argv[1])
