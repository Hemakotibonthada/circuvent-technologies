# Circuvent Smart Light Controller (RGBW)

**Model:** CV-LED · **Type id:** `smart-light` · **Firmware:** 2.0.0

A Wi-Fi RGBW controller for LED strips and fixtures - millions of colours, tunable white, scenes and smooth dimming, plus a physical button.

## Key features
- **RGBW strip driver:** 4 PWM channels (R, G, B + dedicated white) for 12-24 V strips.
- **Aux fixture relay:** switch a separate lamp on/off from the same unit.
- **Scenes + dimming:** smooth 8-bit PWM, colour scenes, schedules, wake/sleep fades.
- **Local button:** cycles on/off and presets, online or offline.
- Zero-touch Wi-Fi setup; secure OTA updates.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | 12-24 V DC (strip PSU) |
| Outputs | 4x N-MOSFET PWM (R/G/B/W), common-anode |
| Aux | 1x SPDT dry-contact relay |
| Max current | ~3 A/channel (heatsink-dependent) |
| PWM | 5 kHz, 8-bit |
| Connectivity | Wi-Fi 2.4 GHz (ESP32) |
| Operating temp | 0-45 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `power`, `white`, `r`, `g`, `b`, `brightness`, `scene`.
- **Commands (`set`):** `{power}`, `{white}`, `{rgb:[r,g,b]}`, `{brightness}`, `{scene}`.

## Compliance (required before retail sale in India) - external
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] EN 55015 (lighting EMC) + LVD; RoHS; e-waste marks
- [ ] BIS where applicable for the bundled DC PSU

## In the box
LED controller · wiring guide (`MANUAL.md`) · warranty card. (Strip + DC PSU sold separately.)

> SAFETY: Match the strip voltage to your DC PSU; do not exceed the per-channel current.
