"""
The architecture and operations deck.

WHY THERE ARE TWO KT DECKS

`deck.py` is the map: four deployables, where things live, which of the docs to
read and in what order. It is for somebody's first week, and it deliberately
stops short of detail that would date.

This one is the other half — the parts you need when you are changing
infrastructure or standing in front of something that is down. The topic
contract, the three separate TLS stories, every secret and what breaks without
it, what deploys by which mechanism, and the failure mode this system produces
more than any other.

Splitting them is not tidiness. A single deck that tried to do both would be
walked through once and never opened again, and the operational half is the half
somebody needs at 2am, on its own, without the onboarding narrative around it.

The visual system is imported from the business decks for the same reason
deck.py imports it: a second look-and-feel from the same company is a drift bug
with a design department attached.
"""

from __future__ import annotations

from pptx.util import Inches, Pt

from business_docs.brand import (
    CYAN, CYAN_BRIGHT, VIOLET, INK, INK_DEEP, SLATE, MUTED, PAPER, PAPER_ALT,
)
from business_docs.decks import (
    W, H, _new_deck, _blank, _text, _bullets, _rect, _slide_header, _footer,
)
from kt_docs.deck import _kt_title_slide, _ltable, _note
from kt_docs import arch_facts as af


def _flow(slide, y: float, steps: list[tuple[str, str]]) -> None:
    """
    A left-to-right chain of boxes.

    Drawn rather than described because the command path is the one thing
    everybody asks about in the first hour, and six bullet points do not answer
    "what talks to what" nearly as fast as six boxes in a row.
    """
    n = len(steps)
    gap = 0.22
    total = W - 1.7
    box_w = (total - gap * (n - 1)) / n
    x = 0.85
    for i, (title, sub) in enumerate(steps):
        _rect(slide, x, y, box_w, 1.15, PAPER_ALT)
        _rect(slide, x, y, box_w, 0.05, CYAN if i % 2 == 0 else VIOLET)
        _text(slide, x + 0.12, y + 0.18, box_w - 0.24, 0.35, title, size=11.5,
              bold=True, color=INK)
        _text(slide, x + 0.12, y + 0.55, box_w - 0.24, 0.5, sub, size=9, color=MUTED)
        if i < n - 1:
            _text(slide, x + box_w - 0.02, y + 0.38, gap + 0.06, 0.4, "\u203a",
                  size=17, color=CYAN)
        x += box_w + gap


def build_arch_deck(data: dict, out_path) -> int:
    prs = _new_deck()
    page = 0

    # ---------------------------------------------------------------- cover
    _kt_title_slide(
        prs, data,
        "Architecture & operations",
        "How it fits together, how it ships, and what to check when it does not",
        f"Generated {data['generatedDate']} \u00b7 {data['commit']}",
    )

    # ------------------------------------------------------------ how to use
    page += 1
    s = _blank(prs)
    _slide_header(s, "What this deck is for", "The other KT deck is the map; this is the machine room")
    _bullets(s, 0.85, 2.0, 11.6, 3.6, [
        "Read the handover deck first if you are new. It answers what the four deployables are and which documents to open.",
        "This one assumes you know that, and covers the parts you need when you are changing infrastructure or when something is down.",
        "Every fact here is derived from the repository at build time \u2014 topic names out of the firmware, limits out of mosquitto.conf, required secrets out of the schema that validates them.",
        "Where a fact could not be derived, the file that owns it is named. Go and check it rather than trusting the slide.",
    ], size=14)
    _footer(s, data, page=page)
    _note(s, "Say plainly that this deck goes stale the moment somebody edits infrastructure "
              "by hand instead of in the repo, and that is the point: it is generated, so "
              "regenerate it rather than patching a slide.")

    # ------------------------------------------------------------ the shape
    page += 1
    s = _blank(prs)
    _slide_header(s, "The shape of it", "Four deployables, one broker, two databases")
    _ltable(s, ["What", "Lives in", "Runs on", "Owns"],
            [[d.name, d.path, d.runs_on, d.owns] for d in data["deployables"]],
            left=0.85, top=1.95, width=11.6, col_widths=[2.6, 1.5, 2.9, 4.6], size=10.5)
    _text(s, 0.85, 5.35, 11.6, 0.9,
          "The broker is the hinge. Everything a customer sees is one of the first three; "
          "everything that physically happens is the fourth, and the two only ever meet over MQTT.",
          size=12, color=MUTED)
    _footer(s, data, page=page)

    # ------------------------------------------------------------ hot path
    page += 1
    s = _blank(prs)
    _slide_header(s, "The command path", "What happens between a tap and a relay")
    _flow(s, 1.95, [
        ("Browser / app", "optimistic pin applied"),
        ("Control plane", "auth, ownership, projection"),
        ("Broker", "cv/<id>/cmd, QoS 1"),
        ("Device", "acts, then publishes"),
        ("cv/<id>/state", "retained, fans back out"),
    ])
    _bullets(s, 0.85, 3.5, 11.6, 2.4, [
        "The optimistic pin is why the UI feels instant \u2014 and why projectCommand has to predict exactly what the device will report. Predict a field the firmware computes for itself and the control waits forever for a confirmation that cannot arrive.",
        "The device is the only authority on its own state. Everything upstream is displaying a belief until the retained state message replaces it.",
        "Boards in one home can now short-circuit this entirely over the local bus \u2014 see the local-bus slide.",
    ], size=12.5)
    _footer(s, data, page=page)

    # ------------------------------------------------------------ MQTT topics
    page += 1
    s = _blank(prs)
    _slide_header(s, "MQTT", "The topic contract, which four codebases depend on")
    _ltable(s, ["Topic", "Direction", "Delivery", "Why it is that way"],
            [list(r) for r in af.mqtt_topics()],
            left=0.85, top=1.95, width=11.6, col_widths=[2.5, 1.7, 1.5, 5.9], size=10)
    _text(s, 0.85, 5.5, 11.6, 0.8,
          "Rename a leaf in the sketch and the console, the app and the bridge all go quiet "
          "without a single error anywhere. These names are an interface, not an implementation detail.",
          size=11.5, color=MUTED)
    _footer(s, data, page=page)
    _note(s, "The retained/not-retained split is the part people get wrong. State is retained so "
              "a new subscriber learns reality immediately; telemetry must not be, or every "
              "reconnect replays an old reading as if it had just happened.")

    # ------------------------------------------------------------ the broker
    page += 1
    s = _blank(prs)
    _slide_header(s, "The broker", "Self-hosted, and deliberately so")
    _ltable(s, ["", "How it is set up"],
            [list(r) for r in af.mqtt_broker()],
            left=0.85, top=1.9, width=11.6, col_widths=[2.3, 9.3], size=10)
    _footer(s, data, page=page)
    _note(s, "Worth stressing: per-device credentials are minted automatically at provisioning "
              "by the control plane, so nobody touches the broker to add a device. The ACL is "
              "what keeps one compromised device from reading or driving the rest of the fleet.")

    # ------------------------------------------------------------ certs
    page += 1
    s = _blank(prs)
    _slide_header(s, "Certificates", "Three separate stories that get mistaken for one")
    _ltable(s, ["Where", "Issued by", "Renewal", "What that means for you"],
            [list(r) for r in af.certificates()],
            left=0.85, top=1.95, width=11.6, col_widths=[2.2, 2.5, 1.5, 5.4], size=10)
    _text(s, 0.85, 5.6, 11.6, 0.8,
          "Only one of these is ours to renew. It is also the one whose expiry takes the whole "
          "fleet offline, and the one no ACME client is watching.",
          size=12, color=MUTED)
    _footer(s, data, page=page)

    # ------------------------------------------------------------ pinning
    page += 1
    s = _blank(prs, INK_DEEP)
    _slide_header(s, "The pinning scare", "A worked example of the house rule", dark=True)
    _bullets(s, 0.85, 2.1, 11.6, 3.4, af.tls_pinning_trap(), size=13.5, color="CBD5E1",
             head_color=PAPER)
    _rect(s, 0.85, 5.7, 2.2, 0.045, CYAN)
    _text(s, 0.85, 5.95, 11.6, 0.6,
          "Verify by running it, not by reading it.", size=17, bold=True, color=PAPER)
    _footer(s, data, dark=True, page=page)

    # ------------------------------------------------------------ secrets
    page += 1
    s = _blank(prs)
    _slide_header(s, "Secrets", "Where each one lives \u2014 named here, never valued")
    _ltable(s, ["Class", "Lives in", "The part that catches people"],
            [list(r) for r in af.secret_homes()],
            left=0.85, top=1.9, width=11.6, col_widths=[2.4, 3.4, 5.8], size=10)
    _footer(s, data, page=page)
    _note(s, "The branch-scoping of Vercel preview variables is a real trap: pulling env without "
              "naming the branch gives you production's values under a preview name.")

    # ------------------------------------------------------- required config
    page += 1
    s = _blank(prs)
    required = af.control_plane_secrets()
    _slide_header(s, "Control plane: what it refuses to start without",
                  f"{len(required)} variables with no default, from config.ts")
    if required:
        half = (len(required) + 1) // 2
        _bullets(s, 0.85, 2.0, 5.7, 4.4, [f"{n} \u2014 {w}" for n, w in required[:half]],
                 size=12, gap=6)
        _bullets(s, 6.85, 2.0, 5.7, 4.4, [f"{n} \u2014 {w}" for n, w in required[half:]],
                 size=12, gap=6)
    _text(s, 0.85, 6.5, 11.6, 0.5,
          "Validated by a schema at boot, so a missing one is a refusal to start rather than a "
          "surprise at 3am.", size=11, color=MUTED)
    _footer(s, data, page=page)

    # ------------------------------------------------------------ integrations
    page += 1
    s = _blank(prs)
    _slide_header(s, "Integrations", "Everything this system talks to that is not ours")
    _ltable(s, ["Integration", "How", "What to know"],
            [list(r) for r in af.integrations()],
            left=0.85, top=1.9, width=11.6, col_widths=[2.4, 3.3, 5.9], size=9.5)
    _footer(s, data, page=page)
    _note(s, "The Alexa category point is the one to dwell on. It is not cosmetic: a water pump "
              "typed as a plain switch gets caught by 'turn everything off' at bedtime, which "
              "stops an irrigation cycle halfway.")

    # ------------------------------------------------------------ deployment
    page += 1
    s = _blank(prs)
    _slide_header(s, "Deployment", "Four things, four different mechanisms")
    _ltable(s, ["What", "How it ships", "The part that bites"],
            [list(r) for r in af.deployments()],
            left=0.85, top=1.9, width=11.6, col_widths=[2.4, 3.5, 5.7], size=10.5)
    _text(s, 0.85, 5.4, 11.6, 0.9,
          "A local build passing is not evidence the pushed tree builds \u2014 uncommitted files can "
          "satisfy an import. Diagnose with a worktree at the pushed commit.",
          size=12, color=MUTED)
    _footer(s, data, page=page)

    # ------------------------------------------------------------ local bus
    page += 1
    s = _blank(prs)
    _slide_header(s, "The local bus", "Boards in one home talk directly")
    _bullets(s, 0.85, 1.95, 11.6, 2.5, [
        "ESP-NOW between boards: no router, no broker, single-digit milliseconds. A hall pad can switch a bedroom light with the broadband unplugged.",
        "Authenticated with a truncated HMAC-SHA512 keyed by a per-home secret, plus a per-sender rolling sequence. An ESP-NOW frame is broadcast into a building containing other people's flats.",
        "No home key means no local bus \u2014 never an unauthenticated one.",
    ], size=12.5)
    _rect(s, 0.85, 4.6, 11.6, 1.75, PAPER_ALT)
    _rect(s, 0.85, 4.6, 0.05, 1.75, VIOLET)
    _text(s, 1.1, 4.78, 11.1, 0.35, "The hard part is the channel, not the radio",
          size=13, bold=True, color=INK)
    _text(s, 1.1, 5.18, 11.1, 1.1,
          "An ESP32 has one radio, and ESP-NOW transmits on whatever channel Wi-Fi is parked on. "
          "When the router dies each board starts scanning independently and they scatter across "
          "the band \u2014 so the local bus disintegrates during the outage it exists for. Boards now "
          "park on a fixed channel after 20s down, and all converge.",
          size=11, color=MUTED)
    _footer(s, data, page=page)

    # ------------------------------------------------------------ failures
    page += 1
    s = _blank(prs, INK_DEEP)
    _slide_header(s, "How this system fails", "Quietly, and while looking healthy", dark=True)
    _bullets(s, 0.85, 2.0, 11.6, 4.0,
             [f"{k} \u2014 {v}" for k, v in af.silent_failures()],
             size=12, color="CBD5E1", gap=9, head_color=PAPER)
    _footer(s, data, dark=True, page=page)
    _note(s, "Every one of these shipped. None threw, none logged. This is why the codebase is "
              "full of parity tests between two files that must agree: they are the only thing "
              "that catches this class at all.")

    # ------------------------------------------------------------ what changed
    page += 1
    s = _blank(prs)
    changes = af.enhancements(12)
    _slide_header(s, "Recent work", "From the log, not from memory")
    if changes:
        _ltable(s, ["Commit", "What it did"],
                [[sha, subj] for sha, subj in changes],
                left=0.85, top=1.9, width=11.6, col_widths=[1.5, 10.1], size=9.5)
    _footer(s, data, page=page)

    # ------------------------------------------------------------ close
    page += 1
    s = _blank(prs, INK_DEEP)
    _rect(s, 0, 0, 0.16, H, CYAN)
    _text(s, 1.1, 2.3, 11, 1.0, "If you change one thing here", size=40, bold=True, color=PAPER)
    _bullets(s, 1.1, 3.5, 10.8, 2.2, [
        "Regenerate this deck rather than editing a slide \u2014 it is built from the repository.",
        "Add a parity test whenever two files have to agree. That is what catches the silent class.",
        "Prove it by running it. A guard that has never failed is not a guard yet.",
    ], size=14, color="CBD5E1", head_color=PAPER)
    _text(s, 1.1, H - 0.9, 11, 0.4,
          f"Generated {data['generatedDate']} from the repository at {data['commit']}",
          size=10, color="475569")

    prs.save(str(out_path))
    return page + 1


