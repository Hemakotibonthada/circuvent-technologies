# Circuvent Smart Lock Controller

**Model:** CV-LOCK · **Type id:** `smart-lock` · **Firmware:** 2.0.0

A Wi-Fi controller for electric strikes, solenoid bolts and motorized locks - lock/unlock from the app or a button, with door-state sensing and auto-lock.

## Key features
- **Drives 12 V strikes/solenoids/motor bolts** via a rated relay + flyback protection.
- **Door sensor input** (reed) reports open/closed and can auto-lock on close.
- **Auto-lock timer** + manual button + status LED (on = locked).
- **Fail-safe / fail-secure** wiring options for local codes.
- Zero-touch Wi-Fi setup; secure OTA updates.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | 12 V DC (lock PSU) |
| Output | 1x SPDT relay for 12 V strike/solenoid/motor |
| Protection | Flyback + RC snubber on the lock coil |
| Door sensor | 1x reed/dry-contact input |
| Local control | 1 button + status LED |
| Connectivity | Wi-Fi 2.4 GHz (ESP32) |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `locked`, `door`, `uptime`.
- **Commands (`set`):** `{lock}`, `{unlock}`, `{autolock:sec}`.

## Compliance (required before retail sale in India) - external
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] CISPR EMC; RoHS; e-waste marks
- [ ] Fail-safe egress behaviour per local fire/building code (installer)

## In the box
Lock controller · flyback diode · wiring guide (`MANUAL.md`) · warranty card. (Lock + 12 V PSU sold separately.)

> SAFETY: For access control, follow local fire/egress codes. Verify fail-safe (unlock-on-power-loss) or fail-secure behaviour matches your requirement.
