"""
Shared brand system for generated business documents.

The palette is not invented here. These are the values from
`src/app/globals.css` — the same accents the website renders — so a deck handed
to a customer and the site they visit afterwards are recognisably the same
company. A document that picks its own blue is the reason printed material
stops looking like the product.

Everything that appears on more than one document lives here: colours, type
scale, the footer line, currency formatting, and the placeholder marker.
"""

from __future__ import annotations

# --------------------------------------------------------------------------
# Palette — from src/app/globals.css (light theme values, for print)
# --------------------------------------------------------------------------

CYAN = "0891B2"          # --accent-cyan
CYAN_DARK = "155E75"     # --accent-cyan-text
CYAN_BRIGHT = "06B6D4"   # --accent-cyan (dark theme) — for dark slides
VIOLET = "7C3AED"        # --accent-violet
PINK = "DB2777"          # --accent-pink

INK = "0F1729"           # --bg-surface (dark) — our near-black
INK_DEEP = "0A0F1A"      # --bg-secondary (dark)
SLATE = "334155"
MUTED = "64748B"
LINE = "D8E0EA"
PAPER = "FFFFFF"
PAPER_ALT = "F0F4F8"     # --bg-secondary (light)

# Category accents. Keyed by the catalogue's own category names so a new
# category shows up as a missing key here rather than silently rendering grey.
CATEGORY_COLORS = {
    "Home Automation": CYAN,
    "Safety": VIOLET,
    "Water Management": "0EA5E9",
    "Energy": "F59E0B",
}

FALLBACK_CATEGORY_COLOR = MUTED


def category_color(name: str) -> str:
    return CATEGORY_COLORS.get(name, FALLBACK_CATEGORY_COLOR)


# --------------------------------------------------------------------------
# Type
# --------------------------------------------------------------------------

# Calibri and Georgia ship with Office on Windows and macOS. A document that
# names a font the reader does not have silently re-flows on their machine,
# which is how a carefully spaced deck arrives with overlapping text.
FONT_SANS = "Calibri"
FONT_SERIF = "Georgia"

# --------------------------------------------------------------------------
# Integrity
# --------------------------------------------------------------------------

# Business documents conventionally carry figures this repository does not
# contain: revenue, funding, headcount, market size. Inventing them produces a
# document that reads as authoritative and is not, and those numbers get quoted
# back in meetings. Anything unknown is marked with this token instead, so it is
# obvious on the page and greppable in the generator.
TBD = "[ to be supplied ]"

PLACEHOLDER_NOTE = (
    "Figures marked " + TBD + " are not held in the product repository this "
    "document is generated from. They must be supplied by the finance or "
    "commercial owner before this document is shared externally."
)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def rupees(amount) -> str:
    """Indian digit grouping: 12,999 and 1,24,999 — not 124,999."""
    try:
        n = int(round(float(amount)))
    except (TypeError, ValueError):
        return str(amount)
    sign = "-" if n < 0 else ""
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return f"{sign}\u20b9{s}"


def footer_line(data: dict) -> str:
    c = data["company"]
    return f"{c['name']}  ·  {c['site']}  ·  {c['salesEmail']}  ·  {c['phone']}"


def plural(n: int, singular: str, plural_form: str | None = None) -> str:
    """"1 products" on a printed catalogue reads as a mistake, because it is."""
    word = singular if n == 1 else (plural_form or singular + "s")
    return f"{n} {word}"


def ordered_categories(catalogue: dict) -> list[str]:
    """
    Categories largest first.

    The export sorts alphabetically, which is right for a data file and wrong
    for a document: it opened the catalogue on the single-product Energy
    section, giving a near-empty page immediately after the cover. Leading with
    the deepest range is also the better sales order.
    """
    counts = catalogue["categoryCounts"]
    return sorted(catalogue["categories"], key=lambda c: (-counts.get(c, 0), c))



def generated_stamp(data: dict) -> str:
    """A printed document with no date cannot be audited against a moved price."""
    return f"Generated {data['generatedDate']} from the live product catalogue"
