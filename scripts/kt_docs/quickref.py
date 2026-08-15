"""
The knowledge-transfer quick reference.

Two pages, meant to be printed and kept beside the keyboard. Everything here is
something you need while your hands are already on the keyboard: the command to
run, the trap you are about to walk into, and which file owns the fact you are
about to duplicate.

It reuses the type scale from the business PDFs, but not their page furniture:
those documents are stamped "generated from the live product catalogue", and
this one is generated from the repository. Borrowing a claim is how a document
ends up asserting something nobody checked.

Deliberately dense. A reference sheet that runs to six pages does not get
printed, and one that does not get printed does not get read.
"""

from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

from business_docs.brand import CYAN, VIOLET, INK, MUTED, LINE, PAPER_ALT, footer_line
from business_docs.pdfs import _c, _styles, PAGE_W, PAGE_H, MARGIN


def _doc(path, data, title):
    doc = BaseDocTemplate(
        str(path), pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN + 6 * mm, bottomMargin=MARGIN + 6 * mm,
        title=title, author=data["company"]["name"],
    )
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
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN + 1 * mm,
                               f"Page {canvas.getPageNumber()}")
        canvas.drawString(MARGIN, MARGIN + 4.5 * mm,
                          f"Generated {data['generatedDate']} from the repository "
                          f"at {data['commit']} | Docs/ is the source of truth")
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=decorate)])
    return doc


def _grid(rows, widths, s, *, head=True):
    """A tight table; every cell is a Paragraph so long text wraps instead of clipping."""
    body = [[Paragraph(str(cell), s["cellhead"] if (head and r == 0) else s["cell"])
             for cell in row] for r, row in enumerate(rows)]
    t = Table(body, colWidths=widths, repeatRows=1 if head else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, _c(LINE)),
    ]
    if head:
        style += [("BACKGROUND", (0, 0), (-1, 0), _c(INK))]
        for r in range(1, len(body)):
            if r % 2 == 0:
                style.append(("BACKGROUND", (0, r), (-1, r), _c(PAPER_ALT)))
    t.setStyle(TableStyle(style))
    return t


def build_kt_quickref(data: dict, out_path) -> int:
    s = _styles()
    c = data["counts"]
    full = PAGE_W - 2 * MARGIN
    story = []

    story.append(Paragraph("KNOWLEDGE TRANSFER", s["kicker"]))
    story.append(Paragraph("Quick reference", s["title"]))
    story.append(Paragraph(
        "Print this. Everything on it is something you need while your hands are already "
        "on the keyboard.", s["subtitle"]))

    # ------------------------------------------------------------ the system
    story.append(Paragraph("The four deployables", s["h1"]))
    story.append(_grid(
        [["What", "Lives in", "Runs on"]]
        + [[d.name, d.path, d.runs_on] for d in data["deployables"]],
        [full * 0.36, full * 0.16, full * 0.48], s))

    story.append(Paragraph("Two databases, and they never meet", s["h2"]))
    story.append(Paragraph(
        "Shop: Neon, reached from the Next.js app, <b>scrypt</b>, src/lib/db.ts. "
        "Control plane: Postgres on the VM, <b>bcrypt</b>, platform/api/src/db.ts. "
        "They are joined only by an SSO bridge. Assuming one database is the most common "
        "source of confusion about users.", s["body"]))

    # ------------------------------------------------------------- commands
    story.append(Paragraph("Commands you will actually run", s["h1"]))
    story.append(_grid([
        ["Task", "Command", "Notes"],
        ["Run the site", "npm run dev", "One dev server at a time. Delete .next if it misbehaves."],
        ["Types", "npx tsc --noEmit", "Must be clean before you push."],
        ["Web tests", "npm test", f"{c['webTests']} test files, including the parity guards."],
        ["Control plane", "cd platform/api ; npm test", f"{c['planeTests']} test files."],
        ["Control plane, live", "cd platform ; docker compose up -d", "Then npm run dev in platform/api."],
        ["Mobile", "cd mobile ; npm run typecheck", "tsc plus a dozen audits. All must pass."],
        ["Firmware", "python -m platformio run", "pio is not on PATH - use python -m."],
        ["This pack", "npm run docs:kt", "Rebuilds from the current tree."],
    ], [full * 0.20, full * 0.34, full * 0.46], s))

    # --------------------------------------------------------------- traps
    if data["traps"]:
        story.append(Paragraph("Traps, each of which cost somebody a day", s["h1"]))
        story.append(_grid(
            [["Trap", "What happens", "The truth"]] + [list(t) for t in data["traps"]],
            [full * 0.28, full * 0.34, full * 0.38], s))

    # ---------------------------------------------------------- one owner
    story.append(Paragraph("One owner per fact", s["h1"]))
    story.append(Paragraph(
        "If a number lives in two places they will disagree eventually. Before you type a "
        "fact, check whether it already has a home.", s["body"]))
    story.append(_grid([
        ["Kind of fact", "Owner"],
        ["Anything a customer reads", "src/lib/brand.ts"],
        ["Commercial terms, warranty length", "src/lib/shop-policy.ts"],
        ["What reaches hardware", "src/lib/smarthome-command-map.ts"],
        ["Device types and controls", "Registered in several tables — see Docs/07"],
        ["MQTT topic scheme", "platform/api/src/config.ts"],
        ["Anything about the system", "Docs/ — and it is kept beside the code"],
    ], [full * 0.42, full * 0.58], s))

    # -------------------------------------------------------- when it breaks
    story.append(Paragraph("When something looks broken", s["h1"]))
    story.append(_grid([
        ["Symptom", "Check this first"],
        ["A control does nothing, no error",
         "Parity. Is the type registered in every table, or only the one you edited?"],
        ["Device state looks stale",
         "The device is the authority. Did it republish? Frames are never persisted."],
        ["Video will not start",
         "Is the proxy matcher excluding the relay path? Is anyone actually watching?"],
        ["A scheduled job never ran",
         "CRON_SECRET. Every cron refuses without it, and the refusal is silent."],
        ["Deployed but nothing changed",
         "Compare the build sha from /api/health with your HEAD. Never verify by eye."],
        ["A test passes locally, fails in CI",
         "You are probably testing a tree that includes somebody's uncommitted work."],
    ], [full * 0.30, full * 0.70], s))

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "<b>Verify by running it, not by reading it.</b> Nearly every defect found while this "
        "system was built appeared only when it was executed — and several were in code "
        "written an hour earlier by the person who found them. The recurring shape is a "
        "control that looks present and does nothing. They never announce themselves.",
        s["body"]))

    doc = _doc(out_path, data, "Circuvent — KT Quick Reference")
    doc.build(story)
    return doc.page
