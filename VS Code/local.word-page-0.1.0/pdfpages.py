# Word Page: what the page in VS Code needs from the PDF of a document.
#
#   python -I pdfpages.py draft.pdf                       only where each page starts
#   python -I pdfpages.py draft.pdf <folder> <prefix>     also pictures, saved in <folder>
#
# Prints JSON:
#   pages  the first lines of text of every page, from the top down; "sideways" for a page
#          lying on its side (a map or a wide table): it is not in the flow of the text.
#          The page looks for those lines in its own text and draws "page n" there.
#   cites  for every citation key, how the PDF prints it: {"Hoydahl_2023": {"author":
#          "Høydahl", "year": "2023"}}, read from the links of the citations (pandoc links
#          each citation to its entry in the reference list: link-citations: true).
#   items  (with a folder) a picture of every table and figure, cut out of the PDF:
#          {"Table 1": {"parts": [{"file": ..., "w": points wide, "h": points high}],
#          "more": pages}}. A table that starts at the foot of a page has a second part
#          (the next page); "more" = how many further pages the table runs on. The page
#          shows the pictures where the R chunk or LaTeX block that makes it stands.
#   refs   (with a folder) pictures of the reference list, one per page.
# Sizes are in points of the PDF, so the page can show a picture at the size of the PDF.
#
# Needs the Python package PyMuPDF (pip install pymupdf). The add-on runs this file
# (extension.js) each time the PDF next to an open page changes.
import json
import os
import re
import sys

import pymupdf

LINES_PER_PAGE = 12        # enough to get past a figure or a table at the top of a page
DPI = 150                  # pictures: about two screen pixels per point of the PDF
CAPTION = re.compile(r"^(Table|Figure) ([A-Z]?\d+)\.")
YEAR = re.compile(r"(\d{4}[a-z]?|n\.d\.(?:-[a-z])?)")
COLUMN_LEFT = 70.87        # the left edge of the column of text: A4 with margins of 2.5 cm


def displayed(page, rect):
    """A rectangle in the page as it is shown (a page on its side is turned)."""
    return pymupdf.Rect(rect) * page.rotation_matrix


def text_lines(page):
    """Every line of text: (rectangle as shown, text, size, bold), from the top down."""
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if not text:
                continue
            first = line["spans"][0]
            lines.append((displayed(page, line["bbox"]), text, first["size"], "Bold" in first["font"]))
    lines.sort(key=lambda item: (round(item[0].y0, 1), item[0].x0))
    return lines


def page_number_line(page, line):
    """The page number: only digits, near an edge of the page (on a page lying on its side
    it is at the side)."""
    rect, text = line[0], line[1]
    edge = min(rect.x0, rect.y0, page.rect.width - rect.x1, page.rect.height - rect.y1)
    return text.isdigit() and edge < 60


def first_lines(page):
    return [text for _, text, _, _ in text_lines(page)[:LINES_PER_PAGE]]


# ---- cites ------------------------------------------------------------------------------

def link_words(page, rect):
    words = page.get_text("words")
    inside = [w for w in words if rect.x0 - 1 <= (w[0] + w[2]) / 2 <= rect.x1 + 1 and rect.y0 - 1 <= (w[1] + w[3]) / 2 <= rect.y1 + 1]
    inside.sort(key=lambda w: (round(w[1], 0), w[0]))
    return " ".join(w[4] for w in inside)


def author_year(text, last_author):
    """'Høydahl, 2023, p. 4' or 'Høydahl (2023)' -> ('Høydahl', '2023'). A second work of the
    same author in one citation is printed without the author ('Statistics Norway, 2026b,
    2026c'): its link is only '2026c', and the author is that of the link before it."""
    narrative = re.match(r"^(.+?) \((\d{4}[a-z]?|n\.d\.(?:-[a-z])?)", text)
    if narrative:
        return narrative.group(1), narrative.group(2)
    found = YEAR.search(text)
    if not found:
        return None
    if found.start() < 2:
        return (last_author, found.group(1)) if last_author else None
    author = text[:found.start()].rstrip(" ,")
    return (author, found.group(1)) if author else None


def cites_of(document):
    """For every key: author and year as the PDF prints them. A citation that is split
    over two lines comes as two links; a piece that ends in a broken word ("Statis-")
    is joined to the next one. A form on one line is preferred."""
    found = {}
    for page in document:
        pieces = []
        for link in page.get_links():
            dest = str(link.get("nameddest") or link.get("name") or "")
            if "ref-" not in dest:
                continue
            # pandoc writes a sign that cannot be in a link name as ux + its number:
            # "Soholt_ux26_Holm_2010" is the key "Soholt_&_Holm_2010"
            key = re.sub(r"ux([0-9a-f]{2,4})(?![0-9a-f])", lambda m: chr(int(m.group(1), 16)), dest.split("ref-", 1)[1])
            pieces.append((key, link_words(page, link["from"])))
        i = 0
        last_author = None
        while i < len(pieces):
            key, text = pieces[i]
            parts = 1
            while i + parts < len(pieces) and pieces[i + parts][0] == key:
                nxt = pieces[i + parts][1]
                text = text[:-1] + nxt if text.endswith("-") and nxt[:1].islower() else text + " " + nxt
                parts += 1
            i += parts
            parsed = author_year(text.strip().lstrip("(["), last_author)
            if parsed:
                last_author = parsed[0]
            # keep the best form: one printed on one line, with the author written out
            whole = parts == 1 and not YEAR.match(text.strip().lstrip("(["))
            if parsed and (key not in found or (not found[key][1] and whole)):
                found[key] = (parsed, whole)
    return {key: {"author": value[0][0], "year": value[0][1]} for key, value in found.items()}


# ---- pictures of tables, figures and the reference list -----------------------------------

def page_parts(page):
    """Lines, rules and pictures of a page, as shown, without the page number."""
    lines = [line for line in text_lines(page) if not page_number_line(page, line)]
    rules = []
    for drawing in page.get_drawings():
        rect = displayed(page, drawing["rect"])
        if rect.height < 2 and rect.width > 30:
            # a rule has no height, and PyMuPDF leaves a rectangle without height out of a union
            rules.append(pymupdf.Rect(rect.x0, rect.y0 - 0.5, rect.x1, rect.y1 + 0.5))
    images = [displayed(page, info["bbox"]) for info in page.get_image_info()]
    return lines, rules, images


def caption_block(lines, index):
    """The lines of a caption: the caption line and the lines straight under it (lines
    beside it, such as text next to a figure on the right, are skipped)."""
    rect = pymupdf.Rect(lines[index][0])
    gap = lines[index][2] * 0.9
    for rect2, _, _, _ in lines[index + 1:]:
        if rect2.x0 < rect.x0 - 2 or rect2.x1 > rect.x1 + 2:
            continue
        if rect2.y0 - rect.y1 > gap:
            break
        rect |= rect2
    return rect


def body_line(line, left):
    """A line of running text: text size, starting at the margin or indented 1.25 cm,
    and nearly as wide as the column (its first words may be bold, as in a run-in heading)."""
    rect, _, size, _ = line
    return 10.5 <= size <= 11.5 and min(abs(rect.x0 - left), abs(rect.x0 - left - 35.4)) < 2 and rect.width > 300


def heading_line(line):
    return line[3] and line[2] > 11.5


def save(page, rect, folder, name, page_rect):
    """Save a picture of an area of the page. "x" is how far its left edge is from the left
    edge of the column of text (on an upright page), so the page can put it at the same place."""
    rect = pymupdf.Rect(rect.x0 - 3, rect.y0 - 3, rect.x1 + 3, rect.y1 + 3) & page_rect
    # the area as the page is shown (turned); the picture comes out turned too
    pix = page.get_pixmap(dpi=DPI, clip=rect)
    pix.save(os.path.join(folder, name))
    part = {"file": name, "w": round(rect.width, 1), "h": round(rect.height, 1)}
    if page.rotation == 0:
        part["x"] = round(rect.x0 - COLUMN_LEFT, 1)
    return part


def pictures(document, folder, prefix):
    items = {}
    refs = []
    left = COLUMN_LEFT
    captions_on = {}
    for page in document:
        lines, rules, images = page_parts(page)
        captions_on[page.number] = [i for i, line in enumerate(lines) if CAPTION.match(line[1]) and line[3]]

    for page in document:
        lines, rules, images = page_parts(page)
        shown = page.rect
        if lines:
            left = min(line[0].x0 for line in lines)       # the left edge of the text on this page
        for n, index in enumerate(captions_on[page.number]):
            rect, text = lines[index][0], lines[index][1]
            kind, label = CAPTION.match(text).group(1), CAPTION.match(text).group(1) + " " + CAPTION.match(text).group(2)
            if label in items:
                continue
            block = caption_block(lines, index)
            next_top = min([lines[j][0].y0 for j in captions_on[page.number][n + 1:]] + [shown.height])
            more = 0
            if kind == "Figure":
                above = [im for im in images if im.y1 <= block.y0 + 2]
                if not above:
                    continue
                image = max(above, key=lambda im: im.y1)
                region = image | block
            else:
                # a table: the caption, then rows and rules down to its last rule. When running
                # text or a heading follows that rule, the table ends there; otherwise it fills
                # the page and goes on on the next pages.
                region = pymupdf.Rect(block)
                table_rules = [r for r in rules if block.y0 < r.y0 and r.y1 < next_top and r.x1 > block.x0 - 60 and r.x0 < block.x1 + 60]
                last_rule = max([r.y1 for r in table_rules], default=block.y1)
                after = [line for line in lines if line[0].y0 > block.y1 - 1 and line[0].y1 < next_top]
                ended = bool(table_rules) and any((body_line(line, left) or heading_line(line)) and line[0].y0 > last_rule
                                                  for line in after)
                for line in after:
                    if ended and line[0].y0 > last_rule:
                        break
                    region |= line[0]
                for r in table_rules:
                    region |= r
                if not ended and not [line for line in lines if line[0].y0 > region.y1 + 4]:
                    follow = page.number + 1
                    while follow < document.page_count:
                        nxt = document[follow]
                        nxt_lines, _, _ = page_parts(nxt)
                        if (nxt.rotation != page.rotation or not nxt_lines or captions_on[follow][:1] == [0]
                                or body_line(nxt_lines[0], left) or heading_line(nxt_lines[0])):
                            break
                        more += 1
                        if captions_on[follow]:          # the next table starts lower on that page
                            break
                        follow += 1
            name = "%s-%s.png" % (prefix, label.replace(" ", "_"))
            parts = [save(page, region, folder, name, shown)]
            # only the first rows fit at the foot of the page: show the next page too
            if more and parts[0]["h"] < 200:
                nxt = document[page.number + 1]
                nxt_lines, nxt_rules, _ = page_parts(nxt)
                limit = min([nxt_lines[j][0].y0 for j in captions_on[nxt.number]] + [nxt.rect.height])
                area = None
                for rect2 in [line[0] for line in nxt_lines if line[0].y1 < limit] + [r for r in nxt_rules if r.y1 < limit]:
                    area = rect2 if area is None else area | rect2
                if area is not None:
                    parts.append(save(nxt, area, folder, name.replace(".png", "-2.png"), nxt.rect))
                    more -= 1
            items[label] = {"parts": parts, "more": more}

    # the reference list: from under the heading "References" to the next section heading,
    # one picture per page
    inside = False
    for page in document:
        lines, _, _ = page_parts(page)
        if not lines:
            continue
        top = min(line[0].y0 for line in lines) - 2
        bottom = max(line[0].y1 for line in lines) + 2
        left = min(line[0].x0 for line in lines)
        if not inside:
            for rect, text, size, bold in lines:
                if bold and size > 13 and text.endswith("References"):
                    inside = True
                    top = rect.y1 + 4
                    break
            if not inside:
                continue
        end = None
        for rect, text, size, bold in lines:
            if rect.y0 > top and bold and size > 13:
                end = rect.y0 - 6
                break
        if (end or bottom) > top + 4:
            refs.append((page, pymupdf.Rect(left - 2, top, page.rect.width - left + 2, end or bottom)))
        if end is not None:
            break
    ref_pictures = []
    for k, (page, rect) in enumerate(refs):
        ref_pictures.append(save(page, rect, folder, "%s-refs-%d.png" % (prefix, k + 1), page.rect))
    return items, ref_pictures


def main():
    file = sys.argv[1]
    document = pymupdf.open(file)
    out = {"pages": [], "cites": cites_of(document)}
    for number, page in enumerate(document, start=1):
        out["pages"].append({"n": number, "sideways": page.rotation in (90, 270), "lines": first_lines(page)})
    if len(sys.argv) >= 4:
        folder, prefix = sys.argv[2], sys.argv[3]
        os.makedirs(folder, exist_ok=True)
        out["items"], out["refs"] = pictures(document, folder, prefix)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(out, ensure_ascii=True))


if __name__ == "__main__":
    main()
