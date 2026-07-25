# Circuvent Smart Plug 16A (Energy Metering)

**Model:** CV-PLUG · **Type id:** `smart-plug` · **Firmware:** 2.0.0

A 16 A Wi-Fi smart plug that switches any appliance and meters live power and energy - with a physical button that keeps working even without the internet.

## Key features
- **16 A load** - run geysers, ACs (within rating), pumps and washers from the app, web or the on-plug button.
- **Live energy metering (BL0937):** watts now, plus cumulative kWh and cost estimates.
- **Local-first button:** toggle the load instantly, online or offline.
- **Boot-state restore:** returns to its last state after a power cut.
- Schedules + timers; over-current protection via the mains fuse.
- Zero-touch Wi-Fi setup (phone captive portal); secure OTA updates.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | 100-240 V AC, 50/60 Hz |
| Max load | 16 A resistive (3680 W @ 230 V) |
| Switching | 1x SPDT relay (16 A) |
| Metering | BL0937 - W, kWh, V, A |
| Connectivity | Wi-Fi 802.11 b/g/n 2.4 GHz (ESP32) |
| Local control | 1 push-button (offline-capable) |
| Socket | India 6/16 A universal (variant) |
| Operating temp | 0-45 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `power`, `watts`, `kwh`, `voltage`, `current`, `uptime`.
- **Commands (`set`):** `{power}`, `{restore}`, `{rule:{onMin,offMin,en}}`.

## Compliance (required before retail sale in India) - external
- [ ] BIS / CRS registration (mains appliance, IS 302)
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] IEC 60335 safety + CISPR EMC; RoHS; e-waste marks

## In the box
Smart plug unit · quick-start guide (`MANUAL.md`) · warranty card.

> SAFETY: Do not exceed the rated load. A mains fuse protects the board; stay within the socket + relay current limits.
