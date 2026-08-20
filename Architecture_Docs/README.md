# website — Architecture Documentation

Reverse-engineered technical documentation for the repository called `website` — which is a marketing site, an e-commerce store, an admin console, an IoT SaaS platform, a developer portal, firmware for a 17-product hardware line, PCB designs, and two native mobile codebases.

---

## Where to start

| You are… | Read this |
| --- | --- |
| **New to the team** | `01_SYSTEM_OVERVIEW.md` §1–§5. **Do not start with the repository's own README** — see below |
| **A backend engineer** | `02_DATABASE_AND_DATA_MODELS.md` in full, especially §5 |
| **A firmware or hardware engineer** | `03_INTEGRATIONS_AND_ECOSYSTEM.md` §4–§8 |
| **On call** | `04_MAINTENANCE_AND_OPERATIONS.md` §11 and §12 |
| **A security reviewer** | `03` §5 (OTA), `02` §6 (no access control), `01` §6 (five auth schemes) |
| **A CTO or EM** | `01` §1 and §11, then `05` §2 and §7 |
| **In a hurry** | `05` §7 — *If you only do five things* |

---

## Source documents

| File | Covers |
| --- | --- |
| `01_SYSTEM_OVERVIEW.md` | Five products in one Next app · module map · the 150 routes · the home-grown HMAC session scheme · commerce · **the comment convention** · health scorecard |
| `02_DATABASE_AND_DATA_MODELS.md` | **Schema created at runtime** · 10 tables · `store_kv`'s 23 single-row collections · **the ~27 modules with no database behind them** · the four-process durability proof · secrets |
| `03_INTEGRATIONS_AND_ECOSYSTEM.md` | The six sub-projects · `platform/` vs `circuvent-platform/` · the MQTT device protocol · **firmware OTA has no signature verification** · mobile release reality · the capability table written four times |
| `04_MAINTENANCE_AND_OPERATIONS.md` | **The CI that has never run** · the git hook · eight audit scripts with real exit codes · the Python documentation pipeline · 4,328 tests · deployment · observability |
| `05_AREAS_OF_ENHANCEMENT.md` | Gap analysis · 34-item debt log · the four things that would keep me awake · **the incident-comment pattern** · phased roadmap · what must not change |

## Generated deliverables

| File | Format |
| --- | --- |
| `Architecture_Guide.md` | All five documents aggregated into one master reference |
| `Architecture_Guide.docx` | Word — styled headings, tables, callouts |
| `Architecture_Guide.pdf` | PDF — cover page, table of contents, vector diagrams |
| `Architecture_Overview.pptx` | Slide deck — overview, topology, data flow, integrations, roadmap |

Regenerate all four with:

```bash
python generate_docs.py
```

Requires `python-docx`, `python-pptx`, `reportlab`, `markdown`.

---

## Headline findings

```
   ╔══════════════════════════════════════════════════════════════════════╗
   ║  START HERE: THE README IS WRONG BY AN ORDER OF MAGNITUDE            ║
   ║                                                                      ║
   ║    It says:   "18 routes"  ·  "50+ React components"                 ║
   ║    Measured:  151 route.ts  ·  108 page.tsx  ·  1,810 src files      ║
   ║               428,355 lines  ·  plus firmware, hardware and two      ║
   ║               native mobile codebases                                ║
   ╠══════════════════════════════════════════════════════════════════════╣
   ║  WHAT IS ACTUALLY IN HERE                                            ║
   ║    A marketing site · an e-commerce store with Razorpay payments ·   ║
   ║    an 83-route admin back office · a smart-home IoT console with     ║
   ║    60+ sections · a public developer portal · firmware for a         ║
   ║    17-SKU retail hardware line sold on Amazon and Flipkart ·         ║
   ║    real KiCad PCB designs · a self-hosted MQTT cloud on one Oracle   ║
   ║    VM · a shipped Play Store app · a drone · an RC car · and a       ║
   ║    completely separate internal HR and payroll SaaS.                 ║
   ╠══════════════════════════════════════════════════════════════════════╣
   ║  WHAT IS GENUINELY EXCELLENT                                         ║
   ║    • Modules that name the production incident they exist to         ║
   ║      prevent — eleven quoted across these documents                  ║
   ║    • Verification that PROVES rather than asserts: four real OS      ║
   ║      processes instead of a mocked cold start; computed CSS read in  ║
   ║      a real browser; a generated deck opened and checked for a real  ║
   ║      catalogue price                                                 ║
   ║    • A complete security-header set, applied at the edge AND         ║
   ║      globally                                                        ║
   ║    • Separate session secrets for staff and customers, with a        ║
   ║      version counter added after a departing employee's token        ║
   ║      stayed valid forever                                            ║
   ║    • Passkey scopes that "must never be interchangeable"             ║
   ║    • Payment capture re-fetched from the gateway, so a forged        ║
   ║      client signature cannot credit an order                         ║
   ║    • Business documents generated from the live catalogue, which     ║
   ║      refuse to build from a stale export                             ║
   ║    • Git history provably free of any committed secret               ║
   ╠══════════════════════════════════════════════════════════════════════╣
   ║  WHAT NEEDS ATTENTION                                                ║
   ║    🔴 ~27 storage modules are MEMORY-ONLY in production — CMS, CRM,  ║
   ║       pricing, tax, developer tokens and PASSKEYS vanish on every    ║
   ║       serverless cold start. The repo found this bug, wrote it down, ║
   ║       and fixed it for exactly one module.                           ║
   ║    🔴 Firmware OTA has NO image signature verification, on devices   ║
   ║       that switch mains relays and door locks. The pull-OTA manifest ║
   ║       endpoint devices poll does not exist.                          ║
   ║    🔴 CI has NEVER executed — 27 runs, 27 startup_failures — so      ║
   ║       thirteen hard gates and 4,328 tests are decorative.            ║
   ║    🔴 The payment webhook verifies its signature correctly and then  ║
   ║       does nothing.                                                  ║
   ║    🔴 Database schema is created at runtime by the app booting. No   ║
   ║       migrations, no foreign keys, no access control of any kind.    ║
   ╚══════════════════════════════════════════════════════════════════════╝
```

---

## Accuracy

Every claim in these documents is traceable to a file in the repository, the output of a command executed during the audit, or a comment in the source itself.

**Commands actually executed**, with results reported as observed: the Jest suite (236 suites, 4,328 tests, 1 failing, 49.5 s), `tsc --noEmit`, `npm run lint`, `verify-icm-durability.ts`, `check-no-secrets.js`, `audit-images.mjs`, `verify_business_docs.py`, `verify_kt_docs.py`, `audit-code-contrast.mjs`, and the GitHub Actions run history via the API.

**A note on file counts.** `firmware/` holds 13,003 files on disk; `git ls-files firmware` returns **84**. The rest is gitignored PlatformIO build cache. Where this distinction matters, these documents state both numbers.

*Audit date: 2026-01 · Repository state: `develop`, 533 commits, 5 remotes*
