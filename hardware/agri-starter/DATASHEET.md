# Circuvent Agri GSM + Wi-Fi Pump Starter

**Model:** CV-AGRI · **Type id:** `agri-starter` · **Firmware:** 2.0.0

A Wi-Fi + GSM starter for farm pumps - start/stop by missed call, SMS or the app, with mains-presence sensing and dry-run protection. It switches the contactor coil, never the motor.

## Key features
- **Start/stop by missed call, SMS or app** - control the pump even from a basic phone.
- **Mains-presence sensing:** only runs when power is actually available (single or 3-phase).
- **Dry-run guard:** won't start without proper supply, and auto-restarts on power return.
- **Switches the contactor coil (A1/A2)** - never the motor current directly.
- Rugged IP54 enclosure; secure OTA updates on Wi-Fi.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | 100-240 V AC (from one phase) |
| Control | 1x relay -> contactor coil (A1/A2) |
| Mains sense | opto-isolated phase-present inputs (up to 3) |
| Cellular | SIM800L 2G GSM (missed call + SMS) |
| Connectivity | Wi-Fi 2.4 GHz + GSM |
| Enclosure | IP54 industrial box |
| Operating temp | 0-55 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `pump`, `power` (mains present), `uptime`.
- **Commands (`set`):** `{pump}` (on/off).

## Compliance (required before retail sale in India) - external
- [ ] BIS / CRS registration (mains device)
- [ ] WPC/ETA for the 2.4 GHz + GSM radios
- [ ] IEC 60335 / IS agri-safety + CISPR EMC; RoHS; e-waste

## In the box
Agri starter · GSM antenna · wiring guide (`MANUAL.md`) · warranty card. (2G SIM sold separately.)

> SAFETY: Wire to the contactor coil only, via a qualified electrician. Never switch the motor current directly through this board.
