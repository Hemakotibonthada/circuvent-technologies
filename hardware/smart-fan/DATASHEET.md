# Circuvent Smart Fan Regulator

**Model:** CV-FAN · **Type id:** `smart-fan` · **Firmware:** 2.0.0

A Wi-Fi smart regulator for BLDC and DC fans - on/off plus smooth, buzz-free speed control from the app, voice or the on-unit button.

## Key features
- **Smooth speed control:** 25 kHz PWM filtered to a 0-10 V signal drives BLDC-fan speed (no hum).
- **Hard on/off relay:** fully cuts fan power when off.
- **6 preset speeds** + schedules; boot-state restore.
- **Local button** cycles speed, online or offline.
- Zero-touch Wi-Fi setup; secure OTA updates.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | 100-240 V AC, 50/60 Hz |
| Fan types | BLDC (PWM/0-10 V input) or DC fan (via MOSFET) |
| Speed signal | 25 kHz PWM, filtered to 0-10 V |
| On/off | 1x SPDT relay |
| Presets | 6 speeds |
| Connectivity | Wi-Fi 2.4 GHz (ESP32) |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `power`, `speed` (0-100), `preset`.
- **Commands (`set`):** `{power}`, `{speed}`, `{preset}`.

## Compliance (required before retail sale in India) - external
- [ ] BIS / CRS registration (mains appliance)
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] IEC 60335 safety + CISPR EMC; RoHS; e-waste marks

## In the box
Fan regulator · wiring guide (`MANUAL.md`) · warranty card.

> SAFETY: Install by a qualified electrician. Use only with fans that accept a 0-10 V/PWM input, or a DC fan on the MOSFET output.
