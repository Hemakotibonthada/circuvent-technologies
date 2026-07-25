# Circuvent Wi-Fi Energy Monitor (Clamp CT)

**Model:** CV-EM · **Type id:** `energy-monitor` · **Firmware:** 2.0.0

A Wi-Fi whole-home energy monitor - clip a CT clamp around your incoming live wire to see live power (W) and cumulative energy (kWh) in the app.

## Key features
- **Non-invasive:** a clamp-on CT reads current without cutting any wire.
- **Live W + cumulative kWh** with cost estimates and daily/weekly charts.
- **Optional true-power** via the voltage-sense add-on (ZMPT101B) for real PF.
- **Alerts:** notify on high usage or a heavy load left on.
- Zero-touch Wi-Fi setup; secure OTA updates.

## Specifications
| Parameter | Value |
| --- | --- |
| Supply | 100-240 V AC (built-in PSU) or USB-C 5 V |
| Sensor | SCT-013 clamp CT (30/60/100 A) |
| Input | 3.5 mm CT jack + burden + bias network |
| Voltage sense | optional ZMPT101B (true power/PF) |
| Connectivity | Wi-Fi 2.4 GHz (ESP32) |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `watts`, `kwh`, `current`, `voltage` (with add-on).
- **Commands (`set`):** `{reset_kwh}`, `{cal:{ct_cal}}` (read-only otherwise).

## Compliance (required before retail sale in India) - external
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] CISPR EMC; RoHS; e-waste marks
- [ ] BIS for the built-in mains-PSU variant

## In the box
Energy monitor · SCT-013 clamp CT · quick-start (`MANUAL.md`) · warranty card.

> SAFETY: Clip the CT around a SINGLE insulated conductor (live only). A qualified electrician should open the meter/DB box.
