# Circuvent Documentation

Everything about how Circuvent is built, deployed, operated and extended.

These documents are written from the code, not from memory. Where a document
describes behaviour, that behaviour was read out of the file it names. Where
something is unverified or inconsistent, it says so rather than guessing.

## Start here

**New to the team? Read [00 — Start here](./00-start-here.md) first.** It gets all
four deployables running on your machine and proves each one works. Everything
below is reference material that assumes you can already run things.

| If you want to… | Read |
| --- | --- |
| **Set up your machine on day one** | [00 — Start here](./00-start-here.md) |
| Understand how the pieces fit together | [01 — Architecture](./01-architecture.md) |
| Work on the website / console | [02 — Web application](./02-web-application.md) |
| Work on the control-plane API | [03 — Control plane API](./03-control-plane-api.md) |
| Understand device messaging | [04 — MQTT protocol](./04-mqtt-protocol.md) |
| Know where data lives | [05 — Databases](./05-databases.md) |
| Understand the device fleet | [06 — Devices and firmware](./06-devices-and-firmware.md) |
| **Add a brand-new device type** | [07 — Adding a new device](./07-adding-a-new-device.md) |
| Build or release the app | [08 — Mobile application](./08-mobile-application.md) |
| Ship code to production | [09 — Deployment](./09-deployment.md) |
| Know which URL is which | [10 — Environments and domains](./10-environments-and-domains.md) |
| Find or rotate a credential | [11 — Secrets](./11-secrets.md) |
| Operate or rebuild the VM | [12 — VM runbook](./12-vm-runbook.md) |
| Keep it healthy | [13 — Maintenance](./13-maintenance.md) |
| Handle growth | [14 — Scaling](./14-scaling.md) |
| Fix something that is broken | [15 — Troubleshooting](./15-troubleshooting.md) |
| Understand the AI assistant | [16 — AI assistant](./16-ai-assistant.md) |
| **Understand sessions, revocation and lockout** | [17 — Session security](./17-session-security.md) |
| Add Siri voice control (and why Apple Home is different) | [18 — Siri and Apple Home](./18-siri-and-apple-home.md) |
| **Read vehicle number plates (ANPR)** | [20 — ANPR](./20-anpr.md) |
| **Fly and log a drone** | [21 — Drone Link](./21-drone.md) |
| **Fly our own aircraft** | [22 — Drone X1](./22-drone-x1.md) |
| **Understand the two-part water tank and its radio link** | [28 — WaterTank radio link](./28-watertank-radio-link.md) |
| **Recognise a face at a door** | [29 — FaceDoor](./29-facedoor.md) |
| **Take attendance, or control room access, with RFID** | [30 — Attendance](./30-attendance.md) |
| **Measure electricity — and know what the number means** | [31 — Metering](./31-metering.md) |
| **Call for help from a button in a shoe** | [32 — Guardian](./32-guardian.md) |
| **Start a farm pump from a phone with no internet** | [33 — Agri Starter](./33-agri-starter.md) |
| **Let the right cars through a barrier** | [34 — RFID Gate](./34-rfid-gate.md) |
| **Drive a curtain to a position it cannot measure** | [35 — Smart Curtain](./35-curtain.md) |
| **Build a switchboard to order, on site** | [36 — Configurable Switchboard](./36-switchboard.md) |
| **Understand why the shop showed a customer no devices** | [37 — The two device registries](./37-shop-fleet.md) |
| **Drive a car from a phone, without the video stalling the steering** | [38 — The RC platform](./38-rc-platform.md) |

### Working here

| If you want to… | Read |
| --- | --- |
| Know how we write code, and why | [23 — Conventions](./23-conventions.md) |
| Run or write tests | [24 — Testing](./24-testing.md) |
| Branch, review and release | [25 — Git and releases](./25-git-and-releases.md) |
| Look up a word | [26 — Glossary](./26-glossary.md) |
| **Pick up your first task** | [27 — First tasks](./27-first-tasks.md) |

### Business documents

`Docs/business/` holds the customer- and investor-facing documents (PPTX, DOCX,
PDF). They are **generated** from the live catalogue by
`npm run docs:business`, so a price change in `src/lib/shop-data.ts` reaches
every document instead of leaving a stale figure in a deck nobody remembers to
edit. See [business/README.md](./business/README.md).

### Knowledge transfer

`Docs/kt/` holds the engineering handover pack — a session deck (PPTX), a
handbook (DOCX) and a two-page quick reference (PDF). Like the business
documents these are **generated**, by `npm run docs:kt`: the device list is the
firmware tree, the document index is this folder, and the traps table is parsed
out of [00 — Start here](./00-start-here.md), so the pack cannot quietly fall
behind the system it describes.

It is an index with opinions, not a replacement for these documents. See
[kt/README.md](./kt/README.md).

## The system in one paragraph

Circuvent sells and operates smart-home hardware. A **Next.js site** on Vercel is
the marketing site, the shop and the smart-home console. A **self-hosted control
plane** on a single VM — Mosquitto, a Node/TypeScript API, Postgres and Caddy,
all in Docker — owns the device fleet: devices speak MQTT to the broker, the API
bridges MQTT to REST and WebSocket, and the apps talk to the API. An **Expo
React Native app** is the same console on a phone. **ESP32 firmware** in
`firmware/` runs on the devices themselves.

The shop and the control plane are separate systems with separate databases,
joined only by a single-sign-on bridge.

## Repository layout

| Path | What it is |
| --- | --- |
| `src/` | The Next.js application — marketing site, shop, smart-home console, admin |
| `platform/` | The self-hosted control plane (Docker Compose: broker, API, Postgres, Caddy) |
| `platform/api/` | The control-plane API source (Express + TypeScript) |
| `mobile/` | The Expo / React Native app |
| `firmware/` | ESP32 firmware, one folder per device type, plus the shared `CircuventDevice` library |
| `hardware/` | KiCad projects, datasheets, manuals and marketplace listings per device |
| `public/` | Static assets served by Next.js, including product artwork |
| `scripts/` | Repository tooling (product art generation, database checks) |
| `e2e/`, `tests/` | Playwright end-to-end tests and Jest unit tests |
| `Docs/` | These documents |

`circuvent-platform/` is a separate Turborepo workspace that is **not** part of
the deployed system described here. Nothing in this documentation depends on it.

## A note on trust

Two things in this repository were found to be out of date while these documents
were being written, and are called out where they matter:

- `platform/README.md` steps 6 and 7.2 tell you to run `mosquitto_passwd` for the
  control-plane user and for every device. The broker is configured for the
  **Dynamic Security plugin** instead and the API creates device credentials
  automatically. See [04 — MQTT protocol](./04-mqtt-protocol.md).
- `mobile/app.json` carries `extra.apiBase`, which nothing reads. The app's real
  endpoint is hard-coded in `mobile/src/config.ts`. See
  [08 — Mobile application](./08-mobile-application.md).

If you find another, fix the document as well as the code.
