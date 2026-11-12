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

LINES_PER_PAGE = 40        # enough to get past a table at the top of a page (its cells are lines too)
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
    """The first lines of the text of a page, without its running head and page number (they
    are in the top or bottom margin; a running head is the same on every page and would be
    found in the wrong place)."""
    lines = [line for line in text_lines(page) if not page_number_line(page, line)]
    if page.rotation == 0:
        lines = [line for line in lines if line[0].y1 > COLUMN_LEFT - 4 and line[0].y0 < page.rect.height - COLUMN_LEFT + 4]
    return [text for _, text, _, _ in lines[:LINES_PER_PAGE]]


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


def title_picture(document, folder, prefix, style):
    """The title block of page 1 (title, subtitle, names, date, abstract), down to the first
    section heading: the page shows it in the place of the header (YAML)."""
    page = document[0]
    lines = [line for line in text_lines(page) if not page_number_line(page, line)]
    if not lines:
        return None
    first_heading = None
    for rect, text, size, bold in lines:
        if style and bold and re.match(r"^\d+(\s|$)", text) and size > style["body"]["size"] + 1 and rect.y0 > 120:
            first_heading = rect
            break
    if first_heading is None:
        return None
    top = min(line[0].y0 for line in lines)
    area = pymupdf.Rect(COLUMN_LEFT - 3, top - 2, page.rect.width - COLUMN_LEFT + 3, first_heading.y0 - 10)
    picture = save(page, area, folder, "%s-title.png" % prefix, page.rect)
    # "y": how far below the top of the column of text the picture starts (2.5 cm margins)
    picture["y"] = round(area.y0 - 3 - COLUMN_LEFT, 1)
    return picture


# ---- the look of the PDF -----------------------------------------------------------------
# What the page needs to look like the PDF: the font of the text, its size and line distance,
# the indent of a paragraph, each level of heading (font, size, room above and below), the
# captions, the colour of the citations and the font of code. Measured on the PDF itself, so
# the page follows whatever the document's header and LaTeX settings make of it. All sizes in
# points; "before" and "after" are from the foot of the letters of one line to the next.

def family_of(font):
    """'ABCDEF+TimesNewRomanPS-BoldMT' -> ('Times New Roman', True, False);
    'LMRoman12-Bold' -> ('Latin Modern', True, False)"""
    base = font.split("+", 1)[-1]
    bold = bool(re.search(r"Bold|Black|Semibold|Demi", base))
    italic = bool(re.search(r"Italic|Oblique|Slant", base))
    name = base.split("-")[0].split(",")[0]
    if name.startswith("LMRoman"):
        return "Latin Modern", bold, italic
    if name.startswith("LMMono"):
        return "Latin Modern Mono", bold, italic
    name = re.sub(r"(PS)?MT$|PS$|Std$", "", name)
    name = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)
    return name.strip(), bold, italic


def median(values):
    values = sorted(values)
    if not values:
        return None
    middle = len(values) // 2
    return values[middle] if len(values) % 2 else (values[middle - 1] + values[middle]) / 2


def style_of(document):
    from collections import Counter
    spans = []          # (page, line rect, baseline, span) of the upright pages
    for page in document:
        if page.rotation:
            continue
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    if span["text"].strip():
                        spans.append((page.number, displayed(page, line["bbox"]), span["origin"][1], span, block["number"]))
    if not spans:
        return None
    weight = Counter()
    for _, _, _, span, _ in spans:
        family, bold, italic = family_of(span["font"])
        if not bold and not italic:
            weight[(family, round(span["size"], 2))] += len(span["text"])
    (body_family, body_size), _ = weight.most_common(1)[0]
    style = {"body": {"family": body_family, "size": body_size}}

    def is_body(span):
        family, bold, italic = family_of(span["font"])
        return family == body_family and abs(span["size"] - body_size) < 0.2

    # line distance and indent: the first span of every line of running text
    # one entry per line on the page: its leftmost span (PyMuPDF can split a line in pieces)
    lines = {}
    for number, rect, base, span, block in spans:
        key = (number, round(base, 1))
        if key not in lines or span["bbox"][0] < lines[key][3]["bbox"][0]:
            lines[key] = (number, pymupdf.Rect(span["bbox"]) * document[number].rotation_matrix, base, span, block)
    ordered = sorted(lines.values(), key=lambda item: (item[0], item[2]))
    steps, indents = [], Counter()
    for (n1, r1, b1, s1, k1), (n2, r2, b2, s2, k2) in zip(ordered, ordered[1:]):
        if n1 == n2 and is_body(s1) and is_body(s2) and body_size * 1.05 < b2 - b1 < body_size * 1.6:
            steps.append(b2 - b1)
    # the indent: the first line of a paragraph of running text, whose next two lines start at
    # the left edge of the column (lists and quotes are in on every line, and in the reference
    # list only one line at the edge follows an indented one)
    for (n1, r1, b1, s1, k1), (n2, r2, b2, s2, k2), (n3, r3, b3, s3, k3) in zip(ordered, ordered[1:], ordered[2:]):
        offset = r1.x0 - COLUMN_LEFT
        if (n1 == n2 == n3 and is_body(s1) and is_body(s2) and is_body(s3) and 5 < offset < 60
                and abs(r2.x0 - COLUMN_LEFT) < 1 and abs(r3.x0 - COLUMN_LEFT) < 1 and b3 - b1 < body_size * 3.2):
            indents[round(offset, 1)] += 1
    style["body"]["line"] = round(median(steps) or body_size * 1.2, 2)
    style["body"]["indent"] = indents.most_common(1)[0][0] if indents else 0

    # headings: a number (1, 1.1, 1.1.1) at the left edge, the heading text after it
    levels = {}
    pairs = {}
    for i, (number, rect, base, span, block) in enumerate(ordered):
        found = re.match(r"^(\d+(?:\.\d+){0,2})$", span["text"].strip())
        if not found or abs(rect.x0 - COLUMN_LEFT) > 2:
            continue
        level = found.group(1).count(".") + 1
        number_right = span["bbox"][2]
        same = [s for s in spans if s[0] == number and abs(s[2] - base) < 0.5 and s[3]["bbox"][0] > number_right - 0.5
                and s[3]["text"].strip()]
        if not same:
            continue
        text_span = min(same, key=lambda s: s[3]["bbox"][0])
        family, bold, italic = family_of(text_span[3]["font"])
        if not (bold or italic) and text_span[3]["size"] < body_size + 0.5:
            continue
        info = levels.setdefault(level, {"family": family, "bold": bold, "italic": italic,
                                         "size": round(text_span[3]["size"], 2), "before": [], "after": [], "gap": []})
        info["gap"].append((text_span[3]["bbox"][0] - number_right) / span["size"])
        before = [item for item in ordered[:i] if item[0] == number and item[2] < base - 1]
        after = [item for item in ordered[i + 1:] if item[0] == number and item[2] > base + 1]
        if before:
            prev = before[-1]
            prev_number = re.match(r"^(\d+(?:\.\d+){0,2})$", prev[3]["text"].strip())
            if is_body(prev[3]):
                info["before"].append(base - prev[2])
            elif prev_number and abs(prev[1].x0 - COLUMN_LEFT) < 2:
                pairs.setdefault("%d-%d" % (prev_number.group(1).count(".") + 1, level), []).append(base - prev[2])
        if after and is_body(after[0][3]):
            info["after"].append(after[0][2] - base)
    style["headings"] = {}
    for level, info in levels.items():
        # the room between the number and the text, counted in the heading's own size
        widths = info["gap"]
        # room above: the smallest usual value (a figure or table between the text and the
        # heading only adds room), the lower quarter of what was measured
        before = sorted(info["before"])
        style["headings"][str(level)] = {
            "family": info["family"], "bold": info["bold"], "italic": info["italic"], "size": info["size"],
            "before": round(before[len(before) // 4], 2) if before else None,
            "after": round(median(info["after"]), 2) if info["after"] else None,
            "numberToText": round(median(widths), 3) if widths else None,
        }
    style["headingPairs"] = {key: round(median(values), 2) for key, values in pairs.items()}

    # captions: the size of the words after "Figure 1." / "Table 1."
    sizes, cap_steps = [], []
    for page in document:
        if page.rotation:
            continue
        for block in page.get_text("dict")["blocks"]:
            block_lines = block.get("lines", [])
            for j, line in enumerate(block_lines):
                text = "".join(s["text"] for s in line["spans"]).strip()
                if CAPTION.match(text) and len(line["spans"]) > 1:
                    rest = [s for s in line["spans"][1:] if s["text"].strip() and not family_of(s["font"])[1]]
                    if rest:
                        sizes.append(round(rest[0]["size"], 2))
                        if j + 1 < len(block_lines):
                            cap_steps.append(block_lines[j + 1]["spans"][0]["origin"][1] - line["spans"][0]["origin"][1])
    if sizes:
        size = Counter(sizes).most_common(1)[0][0]
        steps = [s for s in cap_steps if size < s < size * 1.6]
        style["caption"] = {"size": size, "line": round(median(steps), 2) if steps else round(size * 1.2, 2)}

    # the colour of the citations (the words of the links to the reference list)
    colours = Counter()
    for page in document:
        rects = [link["from"] for link in page.get_links() if "ref-" in str(link.get("nameddest") or link.get("name") or "")]
        if not rects:
            continue
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    x = (span["bbox"][0] + span["bbox"][2]) / 2
                    y = (span["bbox"][1] + span["bbox"][3]) / 2
                    if span["text"].strip() and any(r.x0 <= x <= r.x1 and r.y0 <= y <= r.y1 for r in rects):
                        colours["#%06x" % span["color"]] += 1
    if colours:
        style["citeColour"] = colours.most_common(1)[0][0]

    # code in a line
    mono = Counter()
    for _, _, _, span, _ in spans:
        family = family_of(span["font"])[0]
        if re.search(r"Mono|Consolas|Courier|Code", family):
            mono[(family, round(span["size"] / body_size, 3))] += len(span["text"])
    if mono:
        (family, ratio), _ = mono.most_common(1)[0]
        style["code"] = {"family": family, "ratio": ratio}
    return style


def main():
    file = sys.argv[1]
    document = pymupdf.open(file)
    out = {"pages": [], "cites": cites_of(document)}
    for number, page in enumerate(document, start=1):
        out["pages"].append({"n": number, "sideways": page.rotation in (90, 270), "lines": first_lines(page)})
    try:
        out["style"] = style_of(document)
    except Exception as err:            # the page keeps its own look
        out["style"] = None
        out["styleError"] = str(err)
    if len(sys.argv) >= 4:
        folder, prefix = sys.argv[2], sys.argv[3]
        os.makedirs(folder, exist_ok=True)
        out["items"], out["refs"] = pictures(document, folder, prefix)
        out["title"] = title_picture(document, folder, prefix, out["style"])
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(out, ensure_ascii=True))


if __name__ == "__main__":
    main()
