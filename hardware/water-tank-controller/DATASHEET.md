# Circuvent AquaGuard - Water Tank Controller

**Model:** CV-AQUA · **Type id:** `aquaguard` · **Firmware:** 2.0.0

Fully automatic water-tank pump controller with app + web control, ultrasonic
level sensing, and a full motor-protection suite. Made in India by Circuvent.

## Key features
- Automatic pump start/stop by tank level (configurable % thresholds).
- Ultrasonic level measurement (waterproof probe) + dual float-switch backup.
- **Protections:** dry-run, overflow (hardware float cutoff), maximum-runtime,
  and minimum restart-delay (motor cool-down).
- Manual override button; buzzer + LED alerts.
- Wi-Fi (2.4 GHz), controlled from the Circuvent app / circuvent.com dashboard.
- Zero-touch Wi-Fi setup (phone captive portal); secure OTA updates.

## Specifications
| Parameter | Value |
|---|---|
| Supply | 100-240 V AC, 50/60 Hz |
| Switching | Drives external contactor coil (recommend up to 1.5 HP single-phase via contactor) |
| Relay | 5 V SPDT, 10 A (contactor coil only) |
| Level sensor | Ultrasonic JSN-SR04T (waterproof), range 20-450 cm |
| Float inputs | 2 x dry-contact (low + overflow) |
| Connectivity | Wi-Fi 802.11 b/g/n 2.4 GHz (ESP32) |
| Controls | App, web, physical button |
| Protections | Dry-run, overflow, max-runtime, restart-delay, sensor-fault fallback |
| Enclosure | ABS, wall-mount, target IP54 |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `level`, `pump`, `auto`, `dryRun`, `overflow`, `sensorFault`, `distanceCm`, `startPct`, `stopPct`.
- **Commands (`set`):** `{auto}`, `{pump}`, `{startPct}`, `{stopPct}`, `{maxRuntimeMin}`.

## Compliance (required before retail sale in India) - external
- [ ] BIS / CRS registration (mains appliance)
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] Electrical safety (IEC 60335) + EMC (CISPR) test reports
- [ ] RoHS, e-waste and packaging markings

## In the box
Controller unit · ultrasonic probe (5 m cable) · 2 float switches · mounting
screws · quick-start guide (`MANUAL.md`) · warranty card.

> SAFETY: Mains wiring and contactor connection must be done by a qualified
> electrician. Always switch a motor via a correctly rated contactor/starter.
