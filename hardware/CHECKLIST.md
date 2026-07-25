# Circuvent — Production Readiness Checklist

A full 12-product smart-home line, taken from working prototype to **enterprise, retail‑ready** units
sold on **circuvent.com**, **Amazon.in** and **Flipkart**:

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

Legend: **[x]** done in this repo (code/design source) · **[~]** partial / needs review ·
**[ ]** requires an external vendor, lab, physical process, or account (cannot be produced in code).

---

## 0. Program management
- [x] Product definitions, type ids and telemetry/command contracts (`firmware/README.md`)
- [x] Single proprietary cloud protocol (`/api/devices/sync|claim|command`)
- [x] This checklist + per‑device engineering folders
- [x] Data-driven package generator (`hardware/gen-hardware.js`) regenerates the PCB / enclosure / listing sources for the 10 app-lineup devices
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
- [ ] PCB layout → Gerbers/ODB++ → DFM review (EDA + fab)
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
