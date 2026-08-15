# Knowledge transfer

Handover material for engineers, generated from this repository.

| File | For |
| --- | --- |
| `Circuvent-KT-Deck.pptx` | A handover session, walked through by somebody who knows the system. Carries speaker notes. |
| `Circuvent-KT-Architecture.pptx` | The machine room: architecture, the MQTT contract, certificates, secrets, integrations, deployment and how this system fails. |
| `Circuvent-KT-Handbook.docx` | The same material in prose, for reading alone. |
| `Circuvent-KT-Quick-Reference.pdf` | Two pages meant to be printed and kept beside the keyboard. |

```bash
npm run docs:kt          # rebuild all four from the current tree
npm run docs:kt:verify   # open them and assert on what is inside
```

## Why there are two decks

The handover deck is the map — four deployables, where things live, which of the
documents to read and in what order. It is for somebody's first week and it
stops short of detail that would date.

The architecture deck is the other half, and it is the one somebody opens at 2am
with a broker down: the topic contract, the three separate TLS stories, every
secret and what breaks without it, what deploys by which mechanism, and the
failure mode this system produces more than any other.

Splitting them is not tidiness. One deck trying to do both gets walked through
once and never opened again, and the operational half is the half that has to
stand on its own without the onboarding narrative around it.

## This is an index, not a replacement for `Docs/`

The twenty-nine documents in `Docs/` are the source of truth. They are written
from the code, they live beside it, and they are corrected by whoever notices
they have drifted. Nothing in this pack should ever be the only place a fact is
written down.

What a new engineer actually lacks is not detail. It is knowing which of those
documents matters today, and the handful of facts that are true across all four
deployables and therefore live in none of them — that there are two databases,
that the device is the authority on its own state, that the recurring bug here
is a control which looks present and does nothing.

## Nothing in it is typed by hand

The device list is the firmware tree. The document index is `Docs/`. The traps
table is parsed out of `Docs/00-start-here.md`. The counts are counted, and the
commit the pack was built from is printed on every artifact.

That is the same reasoning as `Docs/business/`, which is generated because a
deck carrying its own copy of a price disagrees with the shop within a quarter.
Handover material fails the same way and worse: it is read by somebody with no
way to tell it is stale, in their first week, when they have nothing to check it
against. A hand-written onboarding deck is wrong the first time a device type is
added, and nobody finds out for months.

If a number in these documents looks wrong, the tree moved and the pack has not
been rebuilt. Run `npm run docs:kt`.

## Why there is a verifier

`npm run docs:kt` printing `ok` only proves four files were written. It does
not prove the deck has slides, that every device reached the page, or that the
traps table survived being parsed out of markdown.

`npm run docs:kt:verify` opens each artifact and asserts on its contents — 61
checks, including that every document in `Docs/` is listed in the handbook, that
no raw markdown reached the page, that every MQTT topic parsed out of the
firmware actually reached the slide, that no broker setting fell back to a
placeholder, and that the pack does not carry the business documents' "generated
from the live product catalogue" stamp, which is a claim it has no right to make.

Several of those checks exist because building the pack and *looking* at it
found things no assertion had: markdown backticks and `**bold**` markers
rendering literally, a link target printed beside its own text, and — on the
architecture deck — the bold lead-in of a bullet rendering near-black on a dark
slide, so half of every bullet simply vanished while the rest read normally.
That is the same lesson the runbook records about rendering a page before
believing it.

## Regenerate when

- a device type is added or removed
- a document is added to `Docs/`
- the traps table in `Docs/00-start-here.md` gains a row
- the MQTT topics, broker settings or required configuration change — the
  architecture deck reads all three out of the files that own them
- a certificate, secret or deployment mechanism changes
- before handing the pack to somebody, so the commit stamp is honest
