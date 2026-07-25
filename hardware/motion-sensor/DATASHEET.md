# Circuvent Wi-Fi Motion Sensor (PIR)

**Model:** CV-PIR · **Type id:** `motion-sensor` · **Firmware:** 2.0.0

A Wi-Fi PIR motion sensor that fires instant alerts and automations - arm/disarm from the app, with an optional local relay to switch a light.

## Key features
- **Instant motion alerts** to the app; arm/disarm remotely.
- **Automations:** trigger lights, scenes or other Circuvent devices on motion.
- **Optional local relay** to switch a light directly (on-board provision).
- **USB or battery** powered (18650 variant with an on-board charger).
- Zero-touch Wi-Fi setup; secure OTA updates.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | USB-C 5 V (or 18650 Li-ion variant) |
| Sensor | HC-SR501 PIR, ~5-7 m / 110 deg |
| Alerts | cloud push on motion; arm/disarm |
| Local out | 1x optional relay (light) - provision |
| Connectivity | Wi-Fi 2.4 GHz (ESP32) |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `motion`, `armed`, `battery` (battery variant).
- **Commands (`set`):** `{armed}`.

## Compliance (required before retail sale in India) - external
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] CISPR EMC; RoHS; e-waste marks
- [ ] BIS for the bundled USB adapter (if included)

## In the box
Motion sensor · USB-C cable · mounting pad + screws · quick-start (`MANUAL.md`) · warranty card.
