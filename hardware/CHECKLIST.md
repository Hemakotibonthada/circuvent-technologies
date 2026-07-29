# Circuvent — Production Readiness Checklist

A full 12-product smart-home line, taken from working prototype to **enterprise, retail‑ready** units
sold on **circuvent.com**, **Amazon.in** and **Flipkart**, plus one hardware-only
OEM board (no firmware folder of its own):

| Product | Firmware type id | Folder |
| --- | --- | --- |
| **Circuvent Home Automation Hub** (4‑channel) | `home-hub` | `firmware/home-hub`, `hardware/home-automation` |
| **Circuvent AquaGuard — Water Tank Controller** | `aquaguard` | `firmware/aquaguard`, `hardware/water-tank-controller` |
| **Circuvent Smart Plug 16A** (energy metering) | `smart-plug` | `firmware/smart-plug`, `hardware/smart-plug` |
| **Circuvent Smart Switch** (2‑gang touch) | `smart-switch` | `firmware/smart-switch`, `hardware/smart-switch` |
| **Circuvent Smart Light Controller** (RGBW) | `smart-light` | `firmware/smart-light`, `hardware/smart-light` |
| **Circuvent Smart Fan Regulator** (BLDC) | `smart-fan` | `firmware/smart-fan`, `hardware/smart-fan` |
| **Circuvent Smart Lock Controller** | `smart-lock` | `firmware/smart-lock`, `hardware/smart-lock` |
| **Circuvent Smart Curtain & Blind Controller** | `curtain` | `firmware/curtain`, `hardware/curtain` |
| **Circuvent Motion Sensor** (PIR) | `motion-sensor` | `firmware/motion-sensor`, `hardware/motion-sensor` |
| **Circuvent Energy Monitor** (clamp CT) | `energy-monitor` | `firmware/energy-monitor`, `hardware/energy-monitor` |
| **Circuvent Guardian** (GPS + GSM SOS) | `guardian` | `firmware/guardian`, `hardware/guardian` |
| **Circuvent Agri Pump Starter** (GSM) | `agri-starter` | `firmware/agri-starter`, `hardware/agri-starter` |
| **Circuvent Dual-Channel Load Controller** (USB-C, high-density) | `load-controller` | `hardware/load-controller` |

Legend: **[x]** done in this repo (code/design source) · **[~]** partial / needs review ·
**[ ]** requires an external vendor, lab, physical process, or account (cannot be produced in code).

---

## 0. Program management
- [x] Product definitions, type ids and telemetry/command contracts (`firmware/README.md`)
- [x] Single proprietary cloud protocol (`/api/devices/sync|claim|command`)
- [x] This checklist + per‑device engineering folders
- [x] Data-driven package generator (`hardware/gen-hardware.js`) regenerates the PCB / enclosure / listing sources for the 10 app-lineup devices
- [x] Data-driven **PCB layout** generator (`hardware/gen-pcb.py`) builds real `.kicad_pcb` boards + Gerbers for all 13 devices from `SCHEMATIC.md` + `BOM.csv`
- [ ] BOM costing → landed cost → MRP & margin sign‑off (finance)
- [ ] Project plan / EVT → DVT → PVT gate reviews
- [ ] Vendor selection: PCB fab, PCBA/EMS, enclosure tooling, box printer

## 1. Industrial / mechanical design
- [x] Enclosure spec + fit notes (`hardware/*/enclosure/ENCLOSURE.md`)
- [x] Product label / rating sticker artwork (`hardware/*/enclosure/label.svg`)
- [x] Retail carton die‑line (`hardware/*/enclosure/box-dieline.svg`)
- [ ] 3D CAD (STEP/STL) of enclosure + injection‑mould tooling (mech vendor)
- [ ] IP‑rating validation (AquaGuard target IP54/IP65 outdoor)
- [ ] Real product photography (studio) — SVG renders are placeholders

## 2. Electronics / PCB
- [x] Schematic / netlist (`hardware/*/pcb/SCHEMATIC.md`)
- [x] Bill of Materials (`hardware/*/pcb/BOM.csv`)
- [x] KiCad project stub + fab checklist (`hardware/*/pcb/`)
- [x] Test points + programming/UART header defined
- [x] **Board layout generated** for all 13 devices — real `.kicad_pcb` with outline,
      mounting holes, fiducials, test points, two-sided placement from the BOM, GND
      pours, silkscreen and (mains devices) a mains/SELV island split with an
      isolation band, keepout and milled slot
      (`hardware/gen-pcb.py` → `hardware/*/pcb/<model>.kicad_pcb`, documented in `pcb/LAYOUT.md`)
- [x] **Net classes + custom design rules** — MAINS / POWER / Default bound by net
      name, plus a generated `<model>.kicad_dru` carrying reinforced mains-to-SELV
      separation, mains-to-edge clearance, minimum mains track width and the fab's
      annular-ring / drill limits
- [x] **Copper routing** — every board autorouted (freerouting) and **DRC-clean:
      zero errors on all 13**. The only remaining warnings are 18
      `silk_edge_clearance` (silkscreen clipped at the board edge), which the fab
      trims. Ground pours stitched on a 3.5 mm via grid, duplicate and
      collinear-overlap segments removed, dangling stubs pruned layer by layer,
      stranded ground pads given solid zone contact — including pads the routed
      tracks fence off completely, which are wired back to the plane through a
      via — and floating pour fragments stitched, then refilled.
- [x] **Mains isolation barrier gaps closed.** The barrier keepout is cut where a
      component straddles it, because there the isolation is the part's package.
      Three linked defects made those cuts unsafe: the cut spanned the full band
      width for the part's whole height, leaving a corridor beside it that the
      router used to bring +5V within 6.99 mm of AC_N against an 8.0 mm rule;
      straddling parts can overlap in y, so cutting per part put one part's
      keepout on another's pads; and the hole was the same size as the
      `ISO_BRIDGE` area that excuses it, so a track could hug the hole's edge
      without being *inside* the area and the rule fired anyway. The hole is now
      the part's pad bbox + 0.3 mm, strictly inside `ISO_BRIDGE`.
- [x] **Gerbers + Excellon drill exported** (`hardware/*/pcb/gerbers/`), 23-file
      production package per board including IPC-D-356, ODB++ and IPC-2581
- [ ] **Residual unconnected nets — 89 across the 13 boards.** Each one is listed
      individually, with its net and both endpoints, in the "Residual unconnected
      items" table of the board's `pcb/LAYOUT.md`. Two boards are completely
      finished; the rest break down as:

      | Board | Open | Mains barrier | GND pour fragment | Low-voltage |
      | --- | ---: | ---: | ---: | ---: |
      | motion-sensor | 0 | 0 | 0 | 0 |
      | smart-lock | 0 | 0 | 0 | 0 |
      | smart-light | 1 | 0 | 1 | 0 |
      | home-automation | 2 | 1 | 0 | 1 |
      | guardian | 3 | 0 | 3 | 0 |
      | energy-monitor | 6 | 3 | 0 | 3 |
      | curtain | 7 | 2 | 0 | 5 |
      | load-controller | 8 | 2 | 5 | 1 |
      | smart-plug | 8 | 1 | 2 | 5 |
      | smart-fan | 10 | 4 | 0 | 6 |
      | smart-switch | 10 | 3 | 3 | 4 |
      | agri-starter | 14 | 4 | 0 | 10 |
      | water-tank-controller | 20 | 3 | 1 | 16 |
      | **Total** | **89** | **23** | **15** | **51** |

      This total rose from 42 when the isolation barrier was tightened. That is a
      deliberate trade: the tighter exemption leaves mains nets less room to reach
      the pads of a straddling part, so more connections are left open — but an
      open connection is a documented hand-routing item, whereas a creepage
      shortfall is a safety defect.
      *Mains barrier* (23) — blocked by the mains clearance and the isolation band
      because the parts involved sit on the barrier itself. These resolve by
      isolating the metering front end, not by re-running the router.
      *GND pour fragment* (15) — a ground pad left on a pour sliver too small to take
      a 0.8 mm stitching via. Needs a small placement nudge by hand.
      *Low-voltage* (51) — genuine routing shortfall, concentrated on the densest
      boards. Needs hand-routing. Routing is stochastic, so re-running
      `gen-pcb.py <board>` will shift these counts.
- [ ] Schematic review — the netlist is **derived by the generator** from
      `SCHEMATIC.md`, not captured from a drawn schematic. Relay contact and metering
      IC pinouts are documented inferences and must be checked against datasheets.
- [ ] Radiated performance validation — the ESP32 antenna keep-out is reduced from
      Espressif's 48 × 21 mm recommendation to an enforced 7 mm
- [ ] Board sizes — every board grew past its marketing target to satisfy the
      clearance rules; re-check the enclosure drawings against `pcb/LAYOUT.md`
- [ ] ODB++ / IPC-356 netlist + external DFM review (fab)
- [ ] Prototype assembly + bring‑up (EVT)
- [ ] Mains isolation, creepage/clearance & fusing review (safety)

## 3. Firmware
- [x] Shared client hardened: NVS creds, Wi‑Fi provisioning (SoftAP + captive portal), TLS cert‑pin hook, signed HTTP OTA + version check, watchdog, backoff, RSSI/heartbeat (`firmware/CircuventDevice/CircuventDevice.h`)
- [x] AquaGuard app logic: ultrasonic + dual‑float level, dry‑run / overflow / max‑runtime / restart‑delay protection, auto thresholds, manual override, buzzer (`firmware/aquaguard`)
- [x] Home‑Hub app logic: 4‑channel relays + buttons, scenes, schedules, boot‑state restore, safety interlock (`firmware/home-hub`)
- [x] Factory provisioning (per‑unit Device ID + Key) + `/claim` linking flow
- [ ] Build in CI (`arduino-cli`) + signed release binaries hosted for OTA
- [ ] Field OTA rollout + rollback plan; key rotation policy

## 4. Cloud / backend
- [x] Device registry, sync, claim, command APIs (`src/app/api/devices/*`)
- [x] Web dashboard control (`/shop/devices`)
- [ ] Per‑device rate limiting + key rotation endpoint (harden)
- [ ] OTA manifest endpoint (`/api/devices/firmware`) serving signed builds
- [ ] Metrics/alerting (offline device, dry‑run, overflow alerts → email/push)

## 5. Mobile app
- [x] Cross‑platform app scaffold (Expo/React Native) — auth, device list, claim, control (`mobile/`)
- [ ] Push notifications (FCM/APNs) for alerts
- [ ] Store builds → Play Store + App Store submission (accounts required)

## 6. Compliance & certification (India + export) — external labs
- [ ] **BIS** (IS 302 / CRS registration) for mains‑powered goods (mandatory in India)
- [ ] **WPC/ETA** for the 2.4 GHz radio (ESP32) in India
- [ ] EMC/EMI (CISPR), electrical safety (IEC 60335), RoHS/REACH
- [ ] CE / FCC if exporting
- [ ] E‑waste & packaging compliance markings

## 7. Manufacturing & QA
- [ ] Assembly work instructions + jigs
- [ ] End‑of‑line test fixture (relay, sensor, Wi‑Fi, cloud sync self‑test)
- [ ] Per‑unit provisioning station (writes ID/Key, prints label, registers unit)
- [ ] AQL sampling plan, burn‑in, serial/QR traceability

## 8. Packaging & documentation
- [x] Datasheet (`hardware/*/DATASHEET.md`)
- [x] Quick‑start user manual (`hardware/*/MANUAL.md`)
- [x] Box die‑line + label artwork
- [ ] Printed manual (multi‑language) + warranty card + safety sheet
- [ ] Barcode/EAN allocation per SKU

## 9. Go‑to‑market / listings
- [x] circuvent.com storefront products + specs (`src/lib/shop-data.ts`)
- [x] Amazon listing copy + A+ outline (`hardware/*/listings/amazon.md`)
- [x] Flipkart listing copy (`hardware/*/listings/flipkart.md`)
- [ ] Amazon Seller Central / Flipkart Seller accounts + brand registry
- [ ] Marketplace catalog upload (flat file), FBA/FA logistics, pricing/GST
- [ ] Product videos, review seeding, ads

---

## What is fully deliverable in this repository (software + design source)
Firmware (all logic + security), cloud APIs, web control, mobile app, PCB schematic/BOM/KiCad
source + fab checklist, enclosure spec + label + carton die‑lines, datasheets, manuals, and
marketplace listing content.

## What must happen outside this repository (physical / vendor / regulatory)
PCB fabrication & assembly, enclosure tooling & moulding, **BIS/WPC/EMC/safety certification**,
real product photography, marketplace seller accounts & catalog upload, and logistics. These are
called out with **[ ]** above and in each device's `DATASHEET.md`.
