# 26 — Glossary

Words used here that either mean something specific to Circuvent, or mean
something different from what you might expect.

---

## The systems

**Web app** — the Next.js application in `src/`. Marketing site, shop, smart-home
console and admin, all one deployable on Vercel.

**Control plane** — the self-hosted API in `platform/` that owns the device
fleet. Runs on a single VM under Docker: Mosquitto, a Node/TypeScript API,
Postgres and Caddy. Reached at `api.circuvent.com`. **Not** the same server as
the website, and it has its own database.

**Console** — the smart-home control UI at `/smarthome`. The same product as the
mobile app, in a browser.

**Mobile app** — the Expo / React Native app in `mobile/`. Android and iOS.

**Firmware** — the C++ that runs on the ESP32 inside a device, in `firmware/`.

**Deployable** — one of the four things above. They ship separately and can be
broken independently.

---

## Devices

**Device type** — a lowercase hyphenated id such as `smart-plug`. The same
string appears in firmware, the API, both apps and the shop. Getting it wrong in
one place is the most common bug in this codebase.

The 23 types the console knows:

`aquaguard`, `home-hub`, `smart-plug`, `smart-light`, `smart-fan`, `curtain`,
`smart-lock`, `smart-switch`, `energy-monitor`, `guardian`, `motion-sensor`,
`agri-starter`, `watertank`, `rfid-gate`, `facedoor`, `touchboard`, `sentinel`,
`camera`, `cctv`, `doorbell`, `anpr-cam`, `drone-link`, `drone-x1`

**State key** — a named field in the JSON a device publishes, such as `power` or
`level`. **A public contract.** Both apps read them, so renaming one breaks every
device already installed in a customer's home.

**Claiming / unclaiming** — attaching a device to a user account, or detaching
it. Ownership is checked on every command *and every camera frame*, so unclaiming
cuts a feed immediately.

**Provisioning** — a factory-fresh device joining Wi-Fi and getting its identity
and credentials for the first time.

**Setup mode / AP mode** — when a device has no Wi-Fi credentials it opens its
own hotspot so a phone can hand it some. It should open **only** after a reset or
when an app asks for it — never as a fallback from a temporary network problem,
or a power cut would strand a whole neighbourhood's devices in setup mode.

**OTA** — over-the-air firmware update.

**Capability** — what a device can actually do, which drives what controls the UI
offers. Derived from the device type.

---

## Messaging

**MQTT** — the lightweight publish/subscribe protocol devices use. Devices do not
speak HTTP.

**Mosquitto** — the MQTT broker. Runs in Docker on the VM.

**Topic** — an address in MQTT, always `cv/<deviceId>/<channel>` here:

| Channel | Direction | Meaning |
| --- | --- | --- |
| `cmd` | to device | Do something |
| `state` | from device | Everything I currently am (**retained**) |
| `telemetry` | from device | A reading, appended to history |
| `status` | from device | Online / offline (**retained**) |
| `frame` | from device | A camera picture (never retained, never stored) |

**Retained** — the broker keeps the last message on that topic and gives it to
anything that subscribes later. It is why a freshly opened app shows current
state instantly instead of waiting for the next change. Frames are deliberately
**not** retained — a retained frame would hand the camera's last picture to
whatever subscribed next.

**QoS 1** — "at least once" delivery. Commands use it.

**Bridge** — the part of the API that translates between MQTT and REST/WebSocket
so the apps never speak MQTT.

**Dynamic Security** — the Mosquitto plugin that manages per-device broker
credentials. The API creates them automatically. `platform/README.md` still tells
you to run `mosquitto_passwd` by hand; that is out of date.

---

## The applications

**Server Component** — a React component rendered on the server. The default in
this app. Cannot use state or effects.

**Client Component** — one marked `"use client"`, shipped to the browser.
Required for interactivity, and a real cost.

**Optimistic update** — applying a change in the UI immediately, then reconciling
against what the device actually reports. The device is the authority.

**Tile** — the card for one device on the dashboard. Encodes level as a static
ring and speed/glow as motion, so turning motion off removes movement without
removing information.

**Scene** — a set of device actions applied together. "Movie night."

**Automation / rule** — a trigger and an action. "If motion after sunset, turn on
the porch light."

**SSO bridge** — the HMAC-signed, server-to-server handshake that lets the shop
and the control plane vouch for a user each has authenticated separately. They
have different user tables; this joins them. The secret never reaches a browser.

---

## Shop

**SKU** — one sellable product. 21 in the catalogue.

**Catalogue** — `src/lib/shop-data.ts`. A TypeScript file, not a database table,
which is why the shop renders with no configuration at all.

**compareAt** — the struck-through "was" price.

**Bundle** — several products sold together at a discount. The discount is
computed **server-side**; client-supplied prices are discarded.

**Coming soon** — a product with a future `releaseAt`. Visible, not orderable,
and it turns itself on at the right moment rather than waiting for someone to
remember.

**Discontinued** — permanently withdrawn. Different from out of stock: it is not
coming back.

---

## Operations

**Vercel** — the managed platform hosting the website.

**Neon** — the managed Postgres the shop uses. Distinct from the control plane's
Postgres.

**Caddy** — the reverse proxy on the VM. Obtains TLS certificates automatically.

**Docker Compose** — how the VM's four containers are defined and run.

**Health check** — `GET /health` on the control plane. Reports database state and
capabilities. The first thing to check after a deploy.

---

## Hardware

**ESP32** — the Wi-Fi microcontroller inside the devices.

**PlatformIO** — the firmware build tool. Invoke it as `python -m platformio`;
the bare `pio` command is usually not on `PATH` on Windows.

**KiCad** — the PCB design tool. Projects are in `hardware/`.

**ANPR** — Automatic Number Plate Recognition. Reading vehicle plates from a
camera. See [20 — ANPR](./20-anpr.md).

**Dry-run protection** — stopping a water pump before it runs without water,
which destroys it.

---

## Build and release

**AAB** — Android App Bundle. What Google Play requires.

**APK** — a directly installable Android package. Used for sideloading and
testing.

**targetSdk** — the Android version an app declares it is built for. Play
enforces a floor and raises it annually.

**Prebuild** — Expo generating the native `android/` and `ios/` folders from
`app.json`. Those folders are **generated and git-ignored**; editing them works
until the next prebuild silently discards the change.

**Upload key** — the key an app is signed with before Play re-signs it. Losing it
is a serious problem and recovering from one takes days.

---

## How we talk about bugs here

**Parity** — two places that must agree about the same fact.

**Parity guard** — a test whose only job is to fail when they stop agreeing.
`tests/` is full of them.

**Silent failure** — the house term for the dominant bug class: a control that
is offered and does nothing, a saved setting that vanishes, an action counted as
sent that was never sent. Nothing errors, nothing logs, and the customer reports
it as broken hardware.
