# 00 — Start here (day one)

You have been handed a repository that builds four separate products: a website,
a server, a phone app and the software that runs inside the hardware. This
document gets all four running on your machine and proves each one works.

Budget **half a day**. Nothing here requires permission from anybody, a
production credential, or a device on your desk.

> Read this one first, all the way through, before opening any other document.
> The rest of `Docs/` is reference material — it explains how things work, and
> assumes you can already run them.

---

## 0. What you are actually working on

Four deployables. They talk over documented contracts, and each can be run,
tested and broken on its own.

| # | Deployable | Lives in | Language | Runs on |
| --- | --- | --- | --- | --- |
| 1 | Website, shop, console, admin | `src/` | TypeScript / Next.js | Vercel |
| 2 | Control plane (device API) | `platform/` | TypeScript / Express | One VM, Docker |
| 3 | Mobile app | `mobile/` | TypeScript / React Native | Android + iOS |
| 4 | Device firmware | `firmware/` | C++ / Arduino | ESP32 chips |

**You do not need all four to do useful work.** Most tasks touch one. Set up the
ones your first task needs, and come back for the others.

[01 — Architecture](./01-architecture.md) explains how they fit together. Read it
after you have something running, not before — it means much more once you have
seen the pieces move.

---

## 1. Install the prerequisites

### Everyone needs these

| Tool | Version | Check with | Where |
| --- | --- | --- | --- |
| Node.js | 20 or newer | `node --version` | <https://nodejs.org> |
| npm | ships with Node | `npm --version` | — |
| Git | any recent | `git --version` | <https://git-scm.com> |

Node 22 is what the machines that build this use. Node 18 is too old — Next.js 16
will refuse to start.

### Only if you touch firmware

| Tool | Check with |
| --- | --- |
| Python 3.9+ | `python --version` |
| PlatformIO | `python -m platformio --version` |

Install PlatformIO with `python -m pip install platformio`.

> **Trap.** On Windows the bare `pio` command usually is not on `PATH` even
> though PlatformIO installed correctly. Every firmware command in these
> documents works if you write `python -m platformio` instead of `pio`. If you
> see `pio: command not found`, this is why — PlatformIO is not missing.

### Only if you build the Android app

| Tool | Notes |
| --- | --- |
| JDK 17 | Newer JDKs break the Gradle version in use |
| Android SDK | Platform **36** and Build-Tools **36.0.0** |

Android Studio installs both. You do **not** need Android Studio to work on the
app's JavaScript — see §5.

---

## 2. Get the code and install dependencies

```bash
git clone <the repository url>
cd WebSite
npm install
```

`npm install` at the root also installs a git hook (`scripts/install-hooks.mjs`)
that blocks commits containing secrets. Leave it enabled.

Each sub-project has its **own** `node_modules` and must be installed
separately. This catches everybody once:

```bash
cd platform/api && npm install && cd ../..
cd mobile        && npm install && cd ..
```

---

## 3. Run the website

```bash
npm run dev
```

Open <http://localhost:3000>. You should get the marketing homepage.

Check these render before you believe it:

| Path | What you should see |
| --- | --- |
| `/` | Marketing homepage |
| `/shop` | 21 products with prices |
| `/smarthome` | The console login screen |

**Without any environment variables**, the site runs and the shop displays. The
catalogue is a TypeScript file (`src/lib/shop-data.ts`), not a database query, so
browsing works with nothing configured. Signing in, placing an order and the
admin area need a database — copy `.env.example` to `.env.local` and ask for
development values.

Run the tests to confirm your machine agrees with everyone else's:

```bash
npm test
```

### When it will not start

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot find module './routes.js'` | Corrupted generated types | `rm -rf .next .next/types` then re-run |
| `routes.d.ts` truncated / nonsense type errors | Two dev servers wrote the same generated files | Stop every dev server, delete `.next`, start one |
| `Another next build process is already running` | A build is running elsewhere | Wait, or stop it |
| Port 3000 busy | Something else has it | `npm run dev -- -p 3001` |

`.next/` is a build cache. **Deleting it is always safe** and fixes a
surprising share of local problems.

---

## 4. Run the control plane

The device API. It needs Postgres and an MQTT broker, both of which come up in
Docker.

```bash
cd platform
docker compose up -d
```

Then the API itself:

```bash
cd platform/api
npm install
npm run dev          # tsx watch src/index.ts
```

Verify:

```bash
curl http://localhost:8080/health
```

You want JSON reporting the database as up and listing capabilities. If `db` is
not up, Postgres has not finished starting — wait ten seconds and retry.

```bash
npm test             # ~30 test files
```

[03 — Control plane API](./03-control-plane-api.md) documents every route and
environment variable.

---

## 5. Run the mobile app

```bash
cd mobile
npm install
npm start            # expo start
```

Press `w` for a browser, or scan the QR code with **Expo Go** on your phone. Your
phone and computer must be on the same Wi-Fi.

The app talks to the **production** control plane by default. Its endpoint is
hard-coded in `mobile/src/config.ts`.

> **Trap.** `mobile/app.json` contains `extra.apiBase`. **Nothing reads it.**
> Changing it does nothing at all. Edit `mobile/src/config.ts`.

Before you commit anything in `mobile/`:

```bash
npm run typecheck
```

That is not just `tsc`. It chains a dozen checks — device types, the command
map, contrast, navigation targets, permissions, version agreement. When one
fails it tells you which file disagrees with which. Those checks exist because
each of them once shipped a bug; see [23 — Conventions](./23-conventions.md).

> **Trap.** `mobile/android/` is **generated and git-ignored**. Editing it works
> until the next `expo prebuild`, which silently discards your change. The
> version-controlled source is `app.json`. Native changes go in `app.json` or a
> config plugin.

---

## 6. Build firmware

You do not need a physical device to compile.

```bash
cd firmware/smart-plug
python -m platformio run
```

That compiles for ESP32 and prints a memory summary. To flash a connected board:

```bash
python -m platformio run --target upload
python -m platformio device monitor
```

Every device folder shares one library, `firmware/CircuventDevice/`, which
handles Wi-Fi, provisioning, MQTT and OTA. Device sketches are small because
that library is large. Read
[06 — Devices and firmware](./06-devices-and-firmware.md) before changing it —
it runs on every device in the field, so a mistake there is a fleet-wide
mistake.

---

## 7. Prove your setup works

Do these four in order. Each takes a minute and each proves something different.

1. **The site renders.** `npm run dev`, open `/shop`, count 21 products.
2. **The unit tests pass.** `npm test` at the root.
3. **The API answers.** `curl http://localhost:8080/health` reports the database up.
4. **Firmware compiles.** `python -m platformio run` in `firmware/smart-plug`.

If all four pass you have a working environment and can pick up a task. If one
fails, fix it now — it will not get easier once you are also debugging your own
code.

---

## 8. Which document to read next

| Your first task is about… | Read |
| --- | --- |
| Anything at all | [01 — Architecture](./01-architecture.md) |
| The website, shop or console | [02 — Web application](./02-web-application.md) |
| The device API | [03 — Control plane API](./03-control-plane-api.md) |
| Devices talking to the server | [04 — MQTT protocol](./04-mqtt-protocol.md) |
| The phone app | [08 — Mobile application](./08-mobile-application.md) |
| **Adding a whole new device type** | [07 — Adding a new device](./07-adding-a-new-device.md) |
| How we write code here | [23 — Conventions](./23-conventions.md) |
| Writing and running tests | [24 — Testing](./24-testing.md) |
| Branches, commits, releases | [25 — Git and releases](./25-git-and-releases.md) |
| A word you do not recognise | [26 — Glossary](./26-glossary.md) |
| **What to actually work on first** | [27 — First tasks](./27-first-tasks.md) |

---

## 9. Traps that cost other people a day

Collected from real incidents. Each one wasted somebody's afternoon.

| Trap | What happens | The truth |
| --- | --- | --- |
| `pio` not found | Firmware commands fail | Use `python -m platformio` |
| Editing `mobile/android/` | Change vanishes later | Generated; edit `app.json` |
| Editing `mobile/app.json`'s `extra.apiBase` | Nothing happens | Nothing reads it; use `src/config.ts` |
| Writing `expect(x, "message")` | `Expect takes at most one argument` | This is **Jest**, not Vitest |
| Two dev servers at once | Weird module errors | Delete `.next`, run one |
| Assuming one database | Confusion about users | Shop and control plane have **separate** databases and separate user tables |
| Adding a device type in one place | Silently no controls | A type is registered in **several** tables; see [07](./07-adding-a-new-device.md) |

That last one is the single most common source of real bugs in this codebase.
It has its own section in [23 — Conventions](./23-conventions.md), and it is
worth reading before you write any device code.

---

## 10. Asking for help

Ask early. Specifically:

- **Blocked more than an hour on setup?** Ask. Setup problems are environment
  problems and rarely worth solving alone.
- **Not sure what a task means?** Ask before writing code, not after.
- **Found a document that is wrong?** Fix it in the same pull request as your
  code. These documents are written from the code, and they only stay true if
  the person who notices the drift corrects it.

Include what you ran, what you expected and what you got. That turns a
conversation into a fix.
