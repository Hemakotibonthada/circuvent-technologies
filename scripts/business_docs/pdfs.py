"""
PDF documents.

* **Product catalogue** — one entry per product with description, features and
  price. The thing you attach to an email.
* **Price list** — a dense trade/dealer sheet, everything on as few pages as
  possible.

Both are laid out with ReportLab's platypus flowables rather than absolute
coordinates, so a longer product description reflows instead of overprinting
the next entry.
"""

from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph,
    Spacer, Table, TableStyle,
)

from .brand import (
    CYAN, VIOLET, INK, SLATE, MUTED, LINE, PAPER_ALT, TBD,
    category_color, ordered_categories, plural, rupees, footer_line,
    generated_stamp,
)

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm


def _c(hexstr: str) -> colors.Color:
    return colors.HexColor("#" + hexstr)


# ReportLab's built-in fonts have no rupee glyph — it renders as a black box.
# Substituting "Rs." keeps the number legible on every machine, which matters
# more on a price list than typographic purity.
def _money(value) -> str:
    return rupees(value).replace("\u20b9", "Rs.")


def _styles():
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("cvTitle", parent=ss["Title"], fontName="Helvetica-Bold",
                                fontSize=26, leading=30, textColor=_c(INK),
                                alignment=TA_LEFT, spaceAfter=2),
        "subtitle": ParagraphStyle("cvSub", parent=ss["Normal"], fontName="Helvetica",
                                   fontSize=11, leading=15, textColor=_c(MUTED),
                                   alignment=TA_LEFT, spaceAfter=10),
        "kicker": ParagraphStyle("cvKicker", parent=ss["Normal"], fontName="Helvetica-Bold",
                                 fontSize=8.5, leading=11, textColor=_c(CYAN),
                                 alignment=TA_LEFT, spaceAfter=3),
        "h1": ParagraphStyle("cvH1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                             fontSize=15, leading=19, textColor=_c(INK),
                             spaceBefore=12, spaceAfter=6),
        "h2": ParagraphStyle("cvH2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                             fontSize=11.5, leading=15, textColor=_c(INK),
                             spaceBefore=6, spaceAfter=2),
        "body": ParagraphStyle("cvBody", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=9, leading=13, textColor=_c(SLATE),
                               spaceAfter=4),
        "small": ParagraphStyle("cvSmall", parent=ss["Normal"], fontName="Helvetica",
                                fontSize=7.5, leading=10, textColor=_c(MUTED)),
        "spec": ParagraphStyle("cvSpec", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=8, leading=11.5, textColor=_c(SLATE)),
        "price": ParagraphStyle("cvPrice", parent=ss["Normal"], fontName="Helvetica-Bold",
                                fontSize=16, leading=19, textColor=_c(INK),
                                alignment=TA_RIGHT),
        "mrp": ParagraphStyle("cvMrp", parent=ss["Normal"], fontName="Helvetica",
                              fontSize=8, leading=11, textColor=_c(MUTED),
                              alignment=TA_RIGHT),
        "cell": ParagraphStyle("cvCell", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=8, leading=10.5, textColor=_c(SLATE)),
        "cellhead": ParagraphStyle("cvCellHead", parent=ss["Normal"],
                                   fontName="Helvetica-Bold", fontSize=8, leading=10.5,
                                   textColor=colors.white),
    }


def _make_doc(path, data, title):
    """Document with a branded header rule and a traceable footer on every page."""
    doc = BaseDocTemplate(str(path), pagesize=A4,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN + 6 * mm, bottomMargin=MARGIN + 6 * mm,
                          title=title, author=data["company"]["name"])

    frame = Frame(MARGIN, MARGIN + 6 * mm,
                  PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN - 12 * mm,
                  id="body", showBoundary=0)

    def decorate(canvas, _doc):
        canvas.saveState()
        half = (PAGE_W - 2 * MARGIN) / 2
        y = PAGE_H - MARGIN - 2 * mm
        canvas.setFillColor(_c(CYAN))
        canvas.rect(MARGIN, y, half, 1.6 * mm, stroke=0, fill=1)
        canvas.setFillColor(_c(VIOLET))
        canvas.rect(MARGIN + half, y, half, 1.6 * mm, stroke=0, fill=1)

        canvas.setFont("Helvetica", 6.5)
        canvas.setFillColor(_c(MUTED))
        canvas.drawString(MARGIN, MARGIN + 1 * mm, footer_line(data).replace("·", "|"))
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN + 1 * mm, f"Page {canvas.getPageNumber()}")
        canvas.drawString(MARGIN, MARGIN + 4.5 * mm, generated_stamp(data))
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=decorate)])
    return doc


def _cover(story, s, data, title, subtitle, blurb):
    story.append(Spacer(1, 26 * mm))
    story.append(Paragraph(data["company"]["name"].upper(), s["kicker"]))
    story.append(Paragraph(title, s["title"]))
    story.append(Paragraph(subtitle, s["subtitle"]))
    # hAlign defaults to CENTER for tables; without this the accent rule floats
    # to the middle of the page while the text it belongs to is left-aligned.
    rule = Table([[""]], colWidths=[38 * mm], rowHeights=[1.4 * mm],
                 style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), _c(CYAN))]))
    rule.hAlign = "LEFT"
    story.append(rule)
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(blurb, s["body"]))


# ------------------------------------------------------------------ catalogue

def build_product_catalogue(data: dict, out_path):
    s = _styles()
    cat, com, c = data["catalogue"], data["commercial"], data["company"]
    doc = _make_doc(out_path, data, "Product Catalogue")
    story = []
    avail = PAGE_W - 2 * MARGIN

    _cover(story, s, data, "Product Catalogue",
           f"{cat['total']} products  ·  {len(cat['categories'])} categories  ·  "
           f"{_money(cat['priceMin'])} to {_money(cat['priceMax'])}",
           "Every device below runs on one platform and one app. Add any product to an "
           "existing setup without a second account or a second system. All prices in "
           "Indian Rupees and inclusive of applicable taxes unless stated otherwise.")

    story.append(Spacer(1, 6 * mm))
    summary = [[Paragraph("Category", s["cellhead"]), Paragraph("Products", s["cellhead"]),
                Paragraph("Price range", s["cellhead"])]]
    for name in ordered_categories(cat):
        items = [p for p in cat["products"] if p["category"] == name]
        summary.append([
            Paragraph(name, s["cell"]),
            Paragraph(str(len(items)), s["cell"]),
            Paragraph(f"{_money(min(p['price'] for p in items))} \u2013 "
                      f"{_money(max(p['price'] for p in items))}", s["cell"]),
        ])
    t = Table(summary, colWidths=[avail * 0.5, avail * 0.2, avail * 0.3])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _c(INK)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _c(PAPER_ALT)]),
        ("GRID", (0, 0), (-1, -1), 0.4, _c(LINE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)

    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        f"Warranty {com['warrantyMonths']} months  ·  Returns {com['returnDays']} days  ·  "
        f"Free shipping over {_money(com['freeShippingOver'])}  ·  "
        f"Support {c['supportEmail']}", s["small"]))

    for cname in ordered_categories(cat):
        story.append(PageBreak())
        accent = category_color(cname)
        # Clear of the page's own header rule, which is drawn at the very top
        # of the frame — without this the two rules touch and read as one
        # mis-coloured band.
        story.append(Spacer(1, 4 * mm))
        story.append(Table([[""]], colWidths=[avail], rowHeights=[1.4 * mm],
                           style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), _c(accent))])))
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(cname.upper(), s["kicker"]))
        items = sorted([p for p in cat["products"] if p["category"] == cname],
                       key=lambda p: p["price"])
        story.append(Paragraph(plural(len(items), "product"), s["h1"]))
        story.append(Spacer(1, 2 * mm))

        for p in items:
            # KeepTogether stops a product splitting across a page boundary,
            # which on a catalogue reads as two half-products.
            block = []
            name_cell = [Paragraph(p["name"], s["h2"]),
                         Paragraph(p["tagline"], s["body"])]
            price_cell = [Paragraph(_money(p["price"]), s["price"])]
            if p["compareAt"]:
                price_cell.append(Paragraph(
                    f'MRP {_money(p["compareAt"])}   save {p["discountPct"]}%', s["mrp"]))
            head = Table([[name_cell, price_cell]],
                         colWidths=[avail * 0.68, avail * 0.32])
            head.setStyle(TableStyle([
                ("VALIGN", (0, 0), (0, 0), "TOP"), ("VALIGN", (1, 0), (1, 0), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            block.append(head)
            block.append(Paragraph(p["description"], s["body"]))

            specs = p["specs"][:6]
            if specs:
                mid = (len(specs) + 1) // 2
                left = "<br/>".join("\u2022 " + x for x in specs[:mid])
                right = "<br/>".join("\u2022 " + x for x in specs[mid:])
                st = Table([[Paragraph(left, s["spec"]), Paragraph(right, s["spec"])]],
                           colWidths=[avail * 0.5, avail * 0.5])
                st.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BACKGROUND", (0, 0), (-1, -1), _c(PAPER_ALT)),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LINEBEFORE", (0, 0), (0, -1), 1.6, _c(accent)),
                ]))
                block.append(st)

            meta = f"Warranty {p['warrantyMonths']} months"
            if p["badge"]:
                meta += f"  ·  {p['badge']}"
            if p["rating"]:
                meta += f"  ·  rated {p['rating']} / 5"
            block.append(Spacer(1, 1.5 * mm))
            block.append(Paragraph(meta, s["small"]))
            block.append(Spacer(1, 5 * mm))
            story.append(KeepTogether(block))

    story.append(PageBreak())
    story.append(Paragraph("Ordering and terms", s["h1"]))
    terms = [
        ["Warranty", f"{com['warrantyMonths']} months on every device from the date of delivery."],
        ["Returns", f"{com['returnDays']} days from delivery, unused and in original packaging."],
        ["Shipping", f"Free over {_money(com['freeShippingOver'])}, otherwise "
                     f"{_money(com['flatShipping'])} flat."],
        ["Bundles", "Multi-device bundles are discounted automatically at checkout."],
        ["Ordering", f"Order online at {c['site']} or contact {c['salesEmail']}."],
        ["Support", f"{c['supportEmail']}  ·  {c['phone']}"],
    ]
    t = Table([[Paragraph(a, s["h2"]), Paragraph(b, s["body"])] for a, b in terms],
              colWidths=[avail * 0.22, avail * 0.78])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, _c(LINE)),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(t)

    doc.build(story)
    return out_path


# ----------------------------------------------------------------- price list

def build_price_list(data: dict, out_path):
    s = _styles()
    cat, com, c = data["catalogue"], data["commercial"], data["company"]
    doc = _make_doc(out_path, data, "Price List")
    story = []
    avail = PAGE_W - 2 * MARGIN

    story.append(Paragraph(c["name"].upper(), s["kicker"]))
    story.append(Paragraph("Price List", s["title"]))
    story.append(Paragraph(
        f"Effective {data['generatedDate']}  ·  {cat['total']} products  ·  "
        "All prices in INR", s["subtitle"]))

    widths = [avail * 0.30, avail * 0.20, avail * 0.14, avail * 0.13, avail * 0.10, avail * 0.13]
    rows = [[Paragraph(h, s["cellhead"]) for h in
             ["Product", "Category", "Code", "MRP", "Save", "Price"]]]

    # Same order as the catalogue, so a dealer holding both reads them the same way.
    cat_rank = {name: i for i, name in enumerate(ordered_categories(cat))}
    order = sorted(cat["products"], key=lambda p: (cat_rank.get(p["category"], 99), -p["price"]))
    band_rows = []
    for p in order:
        rows.append([
            Paragraph(p["name"], s["cell"]),
            Paragraph(p["category"], s["cell"]),
            Paragraph(p["id"], s["cell"]),
            Paragraph(_money(p["compareAt"]) if p["compareAt"] else "\u2014", s["cell"]),
            Paragraph(f'{p["discountPct"]}%' if p["discountPct"] else "\u2014", s["cell"]),
            Paragraph(f'<b>{_money(p["price"])}</b>', s["cell"]),
        ])
        band_rows.append(p["category"])

    t = Table(rows, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), _c(INK)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _c(PAPER_ALT)]),
        ("GRID", (0, 0), (-1, -1), 0.35, _c(LINE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    # A coloured left edge per category keeps the eye anchored on a long sheet.
    for i, cname in enumerate(band_rows, start=1):
        style.append(("LINEBEFORE", (0, i), (0, i), 2.2, _c(category_color(cname))))
    t.setStyle(TableStyle(style))
    story.append(t)

    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("Terms", s["h1"]))
    for line in [
        f"Warranty \u2014 {com['warrantyMonths']} months from delivery on every device.",
        f"Returns \u2014 {com['returnDays']} days, unused and in original packaging.",
        f"Shipping \u2014 free over {_money(com['freeShippingOver'])}, otherwise "
        f"{_money(com['flatShipping'])} flat.",
        "Bundles \u2014 multi-device bundles are discounted automatically at checkout.",
        f"Trade, dealer and volume pricing \u2014 {TBD}. Contact {c['salesEmail']}.",
        "Prices are subject to change. This sheet is generated from the live catalogue; "
        "confirm against the website before quoting.",
    ]:
        story.append(Paragraph("\u2022 " + line, s["body"]))

    doc.build(story)
    return out_path
