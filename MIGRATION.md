# Moving this project to another machine

Everything installable was deleted to make the copy small. Nothing that cannot
be reinstalled was touched — but a few things in this folder are **not in git**
and cannot be recovered if the copy loses them. Those are listed first, because
they are the only part of this move that is actually irreversible.

## Read this first: what is not in git

These are ignored by git on purpose, so they exist **only** in this folder.

| Path | What it is | If lost |
|---|---|---|
| `Creds/` | SSH key for the control-plane VM, **three Android upload keystores** | The Play Store app can never be updated again — Google will not accept a different signing key |
| `mobile/credentials/` | The same keystores, where the Android build expects them | As above |
| `.env.local` | Web console secrets | Recoverable from Vercel, but tedious |
| `circuvent-platform/.env` | Control-plane secrets | Also on the VM at `~/circuvent-platform/.env` |
| `.vercel/`, `circuvent-platform/.vercel/` | Vercel project linkage | Recoverable with `vercel link` |
| `.data/` | **Live admin data** — CMS, ICM, currency, feature flags | Gone. This is the durable store those panels write to |
| `hardware/**/*.dsn`, `*.ses`, `*.step`, `gerbers/*.xml` | PCB routing sessions, 3D models, manufacturing files | Re-routing a board by hand is days of work |
| `mobile/android/` | The native Android project | `npx expo prebuild` regenerates it, but any hand edits are lost |
| `Docs/business/_data/`, `Docs/kt/_assets/` | Business data and KT assets | Gone |

**Verify these survived the copy before deleting anything on the old machine.**
The keystores are the ones that genuinely cannot be replaced.

## Restoring on the new machine

Nothing is Windows-specific except the deleted binaries, so a Mac needs no
changes to the code. Reinstall in any order; they are independent.

```bash
# Web console + everything at the root
npm ci

# Control plane
cd platform/api && npm ci && cd ../..

# Mobile app
cd mobile && npm ci && cd ..
```

Use `npm ci`, not `npm install`. All three lockfiles were kept, so `ci`
reproduces the exact tree that was here. `install` may quietly resolve
different versions.

### Firmware

```bash
pip install platformio          # if not already present
cd firmware/rfid-only && pio run # downloads the toolchain on first build
```

The first build of any sketch re-downloads the ESP32 toolchain and libraries
into `.pio/`. That is why those folders were ~1.9 GB and why deleting them was
safe.

### Windows desk app

`windows/AttendanceDesk` is a WPF app and **will not build on macOS** — WPF is
Windows-only. The source is intact and unchanged; it needs a Windows machine or
a VM. Nothing about the move breaks it.

Note: there is a workaround in `windows/Directory.Packages.props` for a
zero-byte `Directory.Packages.props` in the old machine's user profile. On a
clean machine it is harmless.

## What was deleted, and why it was safe

| Removed | Size | Comes back with |
|---|---|---|
| `node_modules` (root, mobile, platform/api) | 1,769 MB | `npm ci` |
| `firmware/**/.pio` (32 dirs) | 1,918 MB | `pio run` |
| `mobile/dist` — 26 superseded builds | 1,598 MB | rebuilding; the newest `.aab` and `.apk` were kept |
| `mobile/android/**/build`, `.gradle` | 581 MB | `gradlew` |
| `.next`, `.next-audit`, `.swc` | 279 MB | `npm run build` |
| `native/android/**/build` | 143 MB | gradle |
| `platform/api/dist`, `packages/*/dist` | ~2 MB | `npm run build` |
| `windows/AttendanceDesk/bin`, `obj` | ~1 MB | `dotnet build` |

**≈ 6.3 GB removed; the folder went from ~6.9 GB to ~444 MB.**

Two build outputs were deliberately kept in `mobile/dist`:

- `circuvent-1.13.2-25.aab` — the most recent Play Store bundle
- `circuvent-1.13.1-24.apk` — the most recent installable build

They are reproducible in principle, but a rebuilt bundle is not byte-identical
to the one already on a release track, and having the exact artefact that was
uploaded is worth 100 MB.

## How it was verified

Before deleting anything, every credential-bearing and unrecoverable file was
checksummed. Afterwards all 19 hashed files matched byte for byte, `.data` still
held its 29 files, and `git status` was clean — which is the strongest check
available, because a clean tree means no file git tracks was removed or
modified.

If you want to repeat that check after the copy lands on the Mac:

```bash
git status --short          # must be empty
ls Creds mobile/credentials # keystores must be present
ls .data | wc -l            # 29
```

## Git

Everything is pushed. All three remotes were at the same commit when this was
written:

- `hema/develop`, `hema/main` — `github.com/Hemakotibonthada/circuvent-technologies`
- `origin/develop` — `github.com/Hemakotibonthada/WebSite.circuvent`

So the code itself is safe regardless of what happens to the copy. It is only
the table at the top of this file that depends on the folder arriving intact.
