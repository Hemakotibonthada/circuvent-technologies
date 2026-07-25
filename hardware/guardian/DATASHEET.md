# Circuvent Guardian GPS + GSM SOS Beacon

**Model:** CV-SOS · **Type id:** `guardian` · **Firmware:** 2.0.0

A pocket SOS beacon - one press sends your live GPS location by SMS to a trusted contact, places an emergency call, and raises a cloud alert.

## Key features
- **One-press SOS:** sends GPS location by SMS + places a call (SIM800L) + a cloud alert.
- **Live GPS location**, battery telemetry and remote arm/disarm.
- **Rechargeable** 18650 with USB-C charging; a loud buzzer confirms each action.
- **Works anywhere with 2G/GSM** - no Wi-Fi needed in the field.
- Secure OTA updates when on Wi-Fi.

## Specifications
| Parameter | Value |
| --- | --- |
| Power | 18650 Li-ion + USB-C charging |
| Cellular | SIM800L 2G GSM (SMS + voice) |
| GPS | NEO-6M / L80 (lat/lng) |
| Trigger | 1x SOS button + buzzer |
| Telemetry | battery %, GPS, armed |
| Connectivity | Wi-Fi 2.4 GHz (OTA) + GSM |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `sos`, `lat`, `lng`, `battery`, `armed`.
- **Commands (`set`):** `{armed}`, `{clear}` (acknowledge SOS).

## Compliance (required before retail sale in India) - external
- [ ] WPC/ETA for the 2.4 GHz + GSM radios
- [ ] SIM/telecom KYC for any bundled SIM
- [ ] CISPR EMC; RoHS; battery transport UN 38.3; e-waste marks

## In the box
Guardian beacon · USB-C cable · lanyard · quick-start (`MANUAL.md`) · warranty card. (2G SIM sold separately.)

> SAFETY: Not a certified medical alarm. Test coverage and the trusted number regularly, and keep the battery charged.
