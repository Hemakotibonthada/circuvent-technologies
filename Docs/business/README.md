# Business documents

Customer-, investor- and joiner-facing documents in PowerPoint, Word and PDF.

**These files are generated. Do not edit them by hand — your edit will be
overwritten on the next build.** To change what they say, change the generator
or the catalogue they read from.

```bash
npm run docs:business          # build all seven
npm run docs:business:verify   # check the artifacts, not the build log
```

Requires Python 3.9+ with `python-pptx`, `python-docx` and `reportlab`
(`pip install python-pptx python-docx reportlab`). Verification also needs
`pymupdf`.

---

## What gets built

| File | Format | For |
| --- | --- | --- |
| `Circuvent-Investor-Deck.pptx` | PowerPoint, 11 slides | Investors, partners, anyone asking "what is this company?" |
| `Circuvent-Sales-Deck.pptx` | PowerPoint, 8 slides | Customers and channel — range and pricing |
| `Circuvent-Company-Profile.docx` | Word | The one-document answer to "what do you do?" |
| `Circuvent-Business-Plan.docx` | Word | Internal planning — **not for external distribution** |
| `Circuvent-New-Joiner-Handbook.docx` | Word | Week one, everything that is not code |
| `Circuvent-Product-Catalogue.pdf` | PDF, 9 pages | Full catalogue with descriptions and prices |
| `Circuvent-Price-List.pdf` | PDF, 1 page | Dense trade sheet, all products |

---

## Why they are generated

Business documents quote prices, and prices move.

A deck, a catalogue and a price list that each carry their own typed copy of
₹999 will disagree with the shop within a quarter — and the copy that is wrong
is usually the one a customer is holding, because nobody re-opens a PowerPoint
to check it against the website. The same drift already happened once in this
codebase with the support email address: the invoice quoted a personal address
while outbound mail used a monitored one, and customers kept replying to the
personal one for years.

So **no price, product name or count is typed into any of these documents.**
They are built from `src/lib/shop-data.ts`, `src/lib/brand.ts`,
`src/lib/shop-policy.ts` and `src/lib/warranty.ts` — the same modules the
website and every customer invoice read. Change a price in the catalogue,
re-run the build, and every figure in every document moves together.

Counts (products, firmware types, hardware projects) are derived by inspecting
the repository at build time rather than maintained by hand, for the same
reason.

Every document carries a generation date, so a printed copy can always be
matched back to the catalogue it came from.

---

## Figures that are deliberately blank

Some documents need numbers this repository does not hold — revenue, units
shipped, headcount, funding, market size. Those render as:

```
[ to be supplied ]
```

**This is intentional.** An invented figure in a business document reads as
authoritative and gets quoted back in meetings as fact. The finance or
commercial owner fills these in before the document is shared.

The verifier enforces the boundary in both directions: the business plan **must**
contain placeholders (if it does not, someone has invented figures), and the
company profile **must not** (it is externally facing).

---

## How it fits together

```
src/lib/shop-data.ts ─┐
src/lib/brand.ts      ├─▶ scripts/export-business-data.ts
src/lib/shop-policy.ts│         │
src/lib/warranty.ts  ─┘         ▼
                        _data/business-data.json
                                │
                                ▼
                   scripts/build_business_docs.py
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  business_docs/decks.py  documents.py            pdfs.py
     (PPTX)                 (DOCX)                 (PDF)
```

| File | Responsibility |
| --- | --- |
| `scripts/export-business-data.ts` | Reads the live catalogue, writes the JSON |
| `scripts/business_docs/brand.py` | Palette, type, currency, placeholder marker |
| `scripts/business_docs/decks.py` | Both PowerPoint decks |
| `scripts/business_docs/documents.py` | All three Word documents |
| `scripts/business_docs/pdfs.py` | Catalogue and price list |
| `scripts/build_business_docs.py` | Entry point; re-exports data before building |
| `scripts/verify_business_docs.py` | Opens each artifact and asserts on its contents |

The build **re-runs the export every time** and refuses to continue if it fails.
Documents built from yesterday's prices are worse than no documents, because
they look authoritative.

The palette in `brand.py` is taken from `src/app/globals.css` — the same accents
the website renders — so a deck and the site it points at look like the same
company.

---

## Verification

`npm run docs:business` printing `ok` only proves a file was written. It does
not prove the price reached the page.

`npm run docs:business:verify` opens every artifact and checks 43 things: slide
and page counts, that every product appears in both the catalogue and the price
list, that the company name and real prices are present, that rupee formatting
survived, and that placeholders appear only where they belong.

This matters. Rendering the pages during development caught a category with one
product reading **"1 products"** — every text-extraction check passed it, and
only looking at the page found it. It is now guarded.

---

## Changing a document

| To change | Edit |
| --- | --- |
| A price, product name or spec | `src/lib/shop-data.ts` — then rebuild |
| Warranty, returns, shipping | `src/lib/shop-policy.ts`, `src/lib/warranty.ts` |
| Company name, email, phone | `src/lib/brand.ts` |
| Slide wording or order | `scripts/business_docs/decks.py` |
| Word document sections | `scripts/business_docs/documents.py` |
| Catalogue or price-list layout | `scripts/business_docs/pdfs.py` |
| Colours or fonts | `scripts/business_docs/brand.py` |

After any change: rebuild, verify, and **look at the result**. The verifier
catches missing content; it cannot tell you a table is ugly.
