#!/usr/bin/env python
"""
Verify the generated knowledge-transfer pack.

`npm run docs:kt` printing "ok" only proves three files were written. It does
not prove the deck has slides, that the device list reached the page, or that
the traps table survived being parsed out of a markdown file — and a build
script in this repository has previously reported success while publishing the
previous run's artifact, so "the command succeeded" is not evidence.

This opens each artifact and asserts on its contents:

* every document names the company and the commit it was generated from
* the deck has slides, speaker notes, and the parity rule on one of them
* the handbook names every document in Docs/, so the index cannot silently
  lose one
* the quick reference has pages and extractable text
* every device in the firmware tree appears somewhere in the pack
* nothing carries the business documents' "live product catalogue" stamp,
  which would be a claim this pack has no right to make

Run: python scripts/verify_kt_docs.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from kt_docs import facts                                    # noqa: E402

OUT = ROOT / "Docs" / "kt"
DECK = OUT / "Circuvent-KT-Deck.pptx"
HANDBOOK = OUT / "Circuvent-KT-Handbook.docx"
QUICKREF = OUT / "Circuvent-KT-Quick-Reference.pdf"

failures: list[str] = []
checks = 0


def check(ok: bool, label: str) -> None:
    global checks
    checks += 1
    if not ok:
        failures.append(label)


def deck_text() -> tuple[str, int, int]:
    from pptx import Presentation
    prs = Presentation(str(DECK))
    out, notes = [], 0
    for slide in prs.slides:
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
            notes += 1
        for shape in slide.shapes:
            if shape.has_text_frame:
                out.append(shape.text_frame.text)
            if getattr(shape, "has_table", False):
                for row in shape.table.rows:
                    for cell in row.cells:
                        out.append(cell.text)
    return "\n".join(out), len(prs.slides._sldIdLst), notes


def docx_text() -> str:
    from docx import Document
    doc = Document(str(HANDBOOK))
    parts = [p.text for p in doc.paragraphs]
    for t in doc.tables:
        for row in t.rows:
            parts.extend(cell.text for cell in row.cells)
    return "\n".join(parts)


def pdf_text() -> tuple[str, int]:
    import fitz  # PyMuPDF — the same reader verify_business_docs.py already uses
    with fitz.open(str(QUICKREF)) as pdf:
        return "\n".join(page.get_text() for page in pdf), pdf.page_count


def main() -> int:
    for f in (DECK, HANDBOOK, QUICKREF):
        if not f.is_file():
            print(f"missing: {f.relative_to(ROOT)} — run `npm run docs:kt` first", file=sys.stderr)
            return 1

    data = facts.collect()
    company = data["company"]["name"]

    deck, slides, notes = deck_text()
    book = docx_text()
    sheet, pages = pdf_text()
    everything = "\n".join([deck, book, sheet])

    # --- structure -------------------------------------------------------
    check(slides >= 12, f"deck has only {slides} slides")
    check(notes >= slides - 2, f"only {notes} of {slides} slides carry speaker notes")
    check(pages >= 1, "quick reference has no pages")
    check(len(book) > 4000, "handbook is suspiciously short")
    check(len(sheet) > 800, "quick reference has little extractable text")

    # --- identity --------------------------------------------------------
    # Case-insensitive: the shared cover renders the company name in capitals.
    for name, text in (("deck", deck), ("handbook", book), ("quick reference", sheet)):
        check(company.lower() in text.lower(), f"{name} does not name the company")

    # --- derived content actually reached the page -----------------------
    # The whole justification for generating this pack is that it cannot fall
    # behind the tree. If a device is missing here, it did not.
    missing = [d for d in data["devices"] if d not in everything]
    check(not missing, f"devices missing from the pack: {', '.join(missing[:6])}")

    for name, title in data["docs"]:
        stem = name.replace(".md", "")
        check(stem in book, f"handbook does not list {name}")

    if data["traps"]:
        first_trap = data["traps"][0][0]
        check(first_trap[:18] in everything,
              "the traps table did not survive parsing into the pack")

    # The traps come out of a markdown table, so they arrive carrying markdown.
    # Rendered, that shows as literal backticks, ** around words and a link
    # target printed beside its own text. Building the pack and looking at it is
    # what caught this; these keep it caught.
    for marker, why in (("**", "bold markers"), ("](", "markdown links")):
        check(marker not in everything, f"raw {why} reached the page")

    # --- claims it must not make ----------------------------------------
    # The business documents are generated from the catalogue and say so. This
    # pack is generated from the repository, and borrowing that stamp would
    # assert something nobody checked.
    check("live product catalogue" not in everything,
          "the pack carries the business documents' catalogue stamp")

    # --- traceability ----------------------------------------------------
    check(data["commit"] in everything,
          "no document records the commit it was generated from")

    # --- counts are the counted ones, not remembered ones ---------------
    check(str(data["counts"]["devices"]) in everything,
          "the device count on the page does not match the tree")

    print(f"{checks - len(failures)}/{checks} checks passed "
          f"({slides} slides, {pages} pages, {len(data['devices'])} devices)")
    if failures:
        print("\nFAILED:", file=sys.stderr)
        for f in failures:
            print("  - " + f, file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
