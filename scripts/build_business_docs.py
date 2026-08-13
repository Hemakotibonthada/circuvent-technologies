#!/usr/bin/env python
"""
Build every business document from the live catalogue.

    npm run docs:business

Reads `Docs/business/_data/business-data.json` (produced by
`scripts/export-business-data.ts`) and writes PPTX, DOCX and PDF into
`Docs/business/`.

Why generate rather than hand-author: business documents quote prices, and
prices move. A deck, a catalogue and a price list that each carry their own
typed copy will disagree with the shop within a quarter, and the copy a customer
is holding is the one that is wrong. Nobody re-opens a PowerPoint to check it
against the website.

Refuses to run if the export is missing or stale rather than quietly producing
documents from yesterday's prices.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from business_docs.decks import build_investor_deck, build_sales_deck        # noqa: E402
from business_docs.documents import (                                        # noqa: E402
    build_business_plan, build_company_profile, build_onboarding_handbook,
)
from business_docs.pdfs import build_price_list, build_product_catalogue     # noqa: E402

OUT = ROOT / "Docs" / "business"
DATA_FILE = OUT / "_data" / "business-data.json"
EXPORTER = ROOT / "scripts" / "export-business-data.ts"


def load_data() -> dict:
    """Always re-export first: a document built from a stale price is worse than
    no document, because it looks authoritative."""
    print("Exporting catalogue data…")
    result = subprocess.run(
        ["npx", "tsx", str(EXPORTER)], cwd=str(ROOT),
        capture_output=True, text=True, shell=(sys.platform == "win32"),
    )
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        raise SystemExit(
            "Catalogue export failed. Refusing to build documents from stale or "
            "missing data — fix the export first."
        )
    print("  " + (result.stdout.strip().splitlines() or ["ok"])[-1].strip())

    if not DATA_FILE.exists():
        raise SystemExit(f"Expected {DATA_FILE} after export, but it is missing.")
    return json.loads(DATA_FILE.read_text(encoding="utf8"))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    data = load_data()

    jobs = [
        ("Circuvent-Investor-Deck.pptx", build_investor_deck, "Company / investor deck"),
        ("Circuvent-Sales-Deck.pptx", build_sales_deck, "Customer sales deck"),
        ("Circuvent-Company-Profile.docx", build_company_profile, "Company profile"),
        ("Circuvent-Business-Plan.docx", build_business_plan, "Business plan (internal)"),
        ("Circuvent-New-Joiner-Handbook.docx", build_onboarding_handbook, "New joiner handbook"),
        ("Circuvent-Product-Catalogue.pdf", build_product_catalogue, "Product catalogue"),
        ("Circuvent-Price-List.pdf", build_price_list, "Price list"),
    ]

    print(f"\nBuilding {len(jobs)} documents into {OUT.relative_to(ROOT)}…\n")
    failures = []
    for filename, builder, label in jobs:
        path = OUT / filename
        try:
            builder(data, path)
            size_kb = path.stat().st_size / 1024
            print(f"  ok   {filename:<38} {size_kb:7.1f} KB   {label}")
        except Exception as exc:  # noqa: BLE001 — report all, fail at the end
            failures.append((filename, exc))
            print(f"  FAIL {filename:<38}          {exc}")

    if failures:
        print(f"\n{len(failures)} document(s) failed to build.", file=sys.stderr)
        return 1

    cat = data["catalogue"]
    print(f"\nAll {len(jobs)} documents built from {cat['total']} products "
          f"({data['generatedDate']}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
