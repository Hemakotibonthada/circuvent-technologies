# Circuvent Smart Switch (2-Gang Touch)

**Model:** CV-SW2 · **Type id:** `smart-switch` · **Firmware:** 2.0.0

A 2-gang Wi-Fi switch module that hides behind your existing switches - touch pads and the app both control two loads, with Alexa and Google built in.

## Key features
- **2 independent gangs** - control two lights/fans from the app, web, touch pads or voice.
- **Capacitive touch:** built-in touch pads act as local switches (work offline).
- **Alexa & Google:** exposed as two switches via the built-in bridge (fauxmoESP).
- **Retrofit:** fits behind your existing switchboard - no new switch plate.
- **Boot-state restore** + daily schedules per gang.
- Zero-touch Wi-Fi setup; secure OTA updates.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | 100-240 V AC, 50/60 Hz |
| Gangs | 2x SPDT relay, 10 A (recommend <= 6 A/gang) |
| Local control | 2x capacitive touch (T0/T3) |
| Voice | Alexa + Google (local bridge) |
| Connectivity | Wi-Fi 802.11 b/g/n 2.4 GHz (ESP32) |
| Enclosure | fit-behind-switch module |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `power`, `power2`, `uptime`.
- **Commands (`set`):** `{ch,on}`, `{power}`, `{power2}`, `{restore}`.

## Compliance (required before retail sale in India) - external
- [ ] BIS / CRS registration (mains appliance)
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] IEC 60335 safety + CISPR EMC; RoHS; e-waste marks

## In the box
2-gang module · wire connectors · wiring guide (`MANUAL.md`) · warranty card.

> SAFETY: Install by a qualified electrician; observe the per-gang current limits.
