"""
Facts for the knowledge-transfer pack, read from the repository itself.

WHY NOTHING HERE IS TYPED BY HAND

`build_business_docs.py` exists because a deck carrying its own copy of a price
disagrees with the shop within a quarter, and the copy the customer is holding
is the wrong one. Knowledge-transfer material fails the same way and worse: it
is read by somebody with no way to tell it is out of date, in their first week,
when they have nothing to check it against.

So this module derives. The device list is the firmware tree. The document index
is `Docs/`. The traps table is parsed out of `Docs/00-start-here.md` rather than
retyped, because that table is already maintained and a second copy would rot.
Counts are counted.

Where a fact cannot be derived, the pack points at the file that owns it rather
than restating it — the same rule the onboarding handbook already follows when
it defers the engineering half of week one to `Docs/00-start-here.md`.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DOCS = ROOT / "Docs"


# --------------------------------------------------------------------------
# The four deployables
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class Deployable:
    name: str
    path: str
    language: str
    runs_on: str
    owns: str


# Ordered as a new engineer meets them, not alphabetically: the thing they can
# open in a browser first, the thing everything else depends on second.
DEPLOYABLES = [
    Deployable(
        "Website, shop, console, admin", "src/", "TypeScript · Next.js 16",
        "Vercel → circuvent.com",
        "Marketing, storefront, orders, customer accounts, the /smarthome console and /admin.",
    ),
    Deployable(
        "Control plane", "platform/", "TypeScript · Express",
        "One VM, Docker Compose → api.circuvent.com",
        "Devices, telemetry, commands, automations, scenes, rooms, households, voice assistants.",
    ),
    Deployable(
        "Mobile app", "mobile/", "TypeScript · React Native (Expo)",
        "Play Store · com.circuvent.app",
        "The console, on a phone.",
    ),
    Deployable(
        "Device firmware", "firmware/", "C++ · Arduino",
        "ESP32 hardware in customers' homes",
        "Sensing and actuation, and the local behaviour that must survive losing the network.",
    ),
]


# --------------------------------------------------------------------------
# Derived counts and lists
# --------------------------------------------------------------------------

def _count_files(base: Path, patterns: list[str]) -> int:
    if not base.is_dir():
        return 0
    n = 0
    for pat in patterns:
        n += sum(1 for _ in base.rglob(pat))
    return n


def firmware_devices() -> list[str]:
    """Every device the firmware tree ships, from the tree.

    `tests/firmware-console-parity.test.ts` already asserts each of these has a
    console control surface, so this is the same list that test polices.
    """
    base = ROOT / "firmware"
    if not base.is_dir():
        return []
    out = []
    for child in sorted(base.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        if any(child.glob("*.ino")):
            out.append(child.name)
    return out


def docs_index() -> list[tuple[str, str]]:
    """(filename, title) for every numbered document in Docs/, in reading order."""
    out = []
    if not DOCS.is_dir():
        return out
    for f in sorted(DOCS.glob("*.md")):
        if f.name.lower() == "readme.md":
            continue
        title = ""
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break
        out.append((f.name, title or f.stem))
    return out


def _plain(md: str) -> str:
    """
    Markdown source to plain text.

    The traps are parsed out of a markdown table, so they arrive carrying
    markdown: `pio`, **Jest**, and [07](./07-adding-a-new-device.md). Rendered
    into a PDF or a slide those come out literally — backticks on the page, two
    asterisks around a word, and a link target printed in full beside its own
    text.

    No assertion caught this. Building the document and looking at it did, which
    is the same lesson the runbook already records about rendering a page before
    believing it.
    """
    s = md
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)      # [text](target) -> text
    s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)            # **bold** -> bold
    s = re.sub(r"(?<!\w)\*([^*]+)\*(?!\w)", r"\1", s)   # *italic* -> italic
    s = s.replace("`", "")                              # inline code ticks
    return re.sub(r"\s+", " ", s).strip()


def traps() -> list[tuple[str, str, str]]:
    """
    The "traps that cost other people a day" table, parsed from Docs/00.

    Parsed rather than copied. That table is maintained where new joiners
    already read it, and a hand-typed second copy in a KT deck would be wrong
    the first time somebody adds a row — precisely the failure this pack exists
    to prevent.
    """
    src = DOCS / "00-start-here.md"
    if not src.is_file():
        return []
    text = src.read_text(encoding="utf-8", errors="replace")
    section = re.split(r"^##\s+9\.\s+Traps", text, flags=re.M)
    if len(section) < 2:
        return []
    rows: list[tuple[str, str, str]] = []
    for line in section[1].splitlines():
        line = line.strip()
        if not line.startswith("|"):
            if rows:
                break                      # table ended
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) != 3:
            continue
        if set(cells[0]) <= set("-: ") or cells[0].lower() == "trap":
            continue                       # separator or header
        rows.append(tuple(_plain(c) for c in cells))    # type: ignore[arg-type]
    return rows


def counts() -> dict:
    """Sizes, counted rather than remembered."""
    return {
        "webTests": _count_files(ROOT / "src", ["*.test.ts", "*.test.tsx"])
                    + _count_files(ROOT / "tests", ["*.test.ts", "*.test.tsx"]),
        "planeTests": _count_files(ROOT / "platform" / "api" / "src", ["*.test.ts"]),
        "apiRoutes": _count_files(ROOT / "src" / "app" / "api", ["route.ts"]),
        "planeRoutes": _count_files(ROOT / "platform" / "api" / "src" / "routes", ["*.ts"]),
        "components": _count_files(ROOT / "src" / "components", ["*.tsx"]),
        "devices": len(firmware_devices()),
        "docs": len(docs_index()),
    }


def git_head() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT, capture_output=True, text=True, timeout=20,
        )
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def company() -> dict:
    """Reuse the business export's company block when it is present.

    Falls back to neutral values rather than inventing contact details, which
    are exactly the kind of fact that must have a single owner.
    """
    data_file = DOCS / "business" / "_data" / "business-data.json"
    if data_file.is_file():
        try:
            return json.loads(data_file.read_text(encoding="utf-8"))["company"]
        except Exception:
            pass
    return {
        "name": "Circuvent Technologies",
        "site": "circuvent.com",
        "salesEmail": "",
        "phone": "",
    }


def collect() -> dict:
    """Everything the generators need, in one dict, so each builder stays pure."""
    return {
        "generatedDate": date.today().strftime("%d %B %Y"),
        "commit": git_head(),
        "company": company(),
        "deployables": DEPLOYABLES,
        "devices": firmware_devices(),
        "docs": docs_index(),
        "traps": traps(),
        "counts": counts(),
    }
