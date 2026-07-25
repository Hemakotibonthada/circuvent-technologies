# Circuvent Smart Curtain & Blind Controller

**Model:** CV-CURT · **Type id:** `curtain` · **Firmware:** 2.0.0

A Wi-Fi controller for curtain and blind motors - open, close, stop and set any position from the app, wall buttons or voice.

## Key features
- **Open / close / stop** an AC tubular curtain or roller-blind motor via two interlocked relays.
- **Set % position** with travel-time calibration; presets and schedules (sunrise/sunset).
- **3 wall buttons** (open/close/stop) that work offline.
- **Safe interlock:** the open and close relays can never energise together.
- Zero-touch Wi-Fi setup; secure OTA updates.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | 100-240 V AC, 50/60 Hz |
| Motor | AC tubular curtain/blind, <= 6 A |
| Outputs | 2x SPDT relay (open/close), interlocked |
| Local control | 3 buttons (open/close/stop) |
| Position | travel-time based % |
| Connectivity | Wi-Fi 2.4 GHz (ESP32) |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `position` (0-100), `moving`, `direction`.
- **Commands (`set`):** `{open}`, `{close}`, `{stop}`, `{position}`, `{calibrate}`.

## Compliance (required before retail sale in India) - external
- [ ] BIS / CRS registration (mains appliance)
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] IEC 60335 safety + CISPR EMC; RoHS; e-waste marks

## In the box
Curtain controller · wiring guide (`MANUAL.md`) · warranty card.

> SAFETY: Install by a qualified electrician. The motor must be an AC tubular type with separate open/close windings; observe the current limit.
