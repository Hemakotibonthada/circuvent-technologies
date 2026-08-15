#!/usr/bin/env python
"""
Build the knowledge-transfer pack.

    npm run docs:kt

Writes a deck, a handbook and a quick reference into `Docs/kt/`, all derived
from the repository itself: the device list is the firmware tree, the document
index is `Docs/`, the traps table is parsed out of `Docs/00-start-here.md`, and
the counts are counted.

Why generate rather than hand-author. `build_business_docs.py` exists because a
deck carrying its own copy of a price disagrees with the shop within a quarter.
Handover material fails the same way and worse: it is read by somebody with no
way to tell it is stale, in their first week, when they have nothing to check it
against. A hand-written onboarding deck is out of date the first time a device
type is added and nobody finds out for months.

This pack does not replace `Docs/`. It is the index that says which of those
documents to open and in what order, plus the few facts that are true across all
four deployables and therefore live in none of them.

Verify what it produced with `npm run docs:kt:verify`.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from kt_docs import facts                                    # noqa: E402
from kt_docs.deck import build_kt_deck                       # noqa: E402
from kt_docs.arch_deck import build_arch_deck                # noqa: E402
from kt_docs.handbook import build_kt_handbook               # noqa: E402
from kt_docs.quickref import build_kt_quickref               # noqa: E402

OUT = ROOT / "Docs" / "kt"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    data = facts.collect()
    c = data["counts"]

    # Refuse rather than produce a document that quietly describes nothing. An
    # empty device list or an empty document index means this is being run
    # somewhere other than the repository root, and a handover pack claiming the
    # product has no devices is worse than no pack at all.
    if not data["devices"]:
        print("No firmware devices found — is this the repository root?", file=sys.stderr)
        return 1
    if not data["docs"]:
        print("No documents found under Docs/ — is this the repository root?", file=sys.stderr)
        return 1

    print(f"Building from {data['commit']}: "
          f"{c['devices']} devices, {c['docs']} documents, {len(data['traps'])} traps")

    deck = OUT / "Circuvent-KT-Deck.pptx"
    arch = OUT / "Circuvent-KT-Architecture.pptx"
    handbook = OUT / "Circuvent-KT-Handbook.docx"
    quickref = OUT / "Circuvent-KT-Quick-Reference.pdf"

    slides = build_kt_deck(data, deck)
    print(f"  {deck.name}  ({slides} slides)")

    arch_slides = build_arch_deck(data, arch)
    print(f"  {arch.name}  ({arch_slides} slides)")

    paras = build_kt_handbook(data, handbook)
    print(f"  {handbook.name}  ({paras} paragraphs)")

    pages = build_kt_quickref(data, quickref)
    print(f"  {quickref.name}  ({pages} pages)")

    print("\nok - now run `npm run docs:kt:verify`, because a file being written "
          "is not the same as a document being right.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
