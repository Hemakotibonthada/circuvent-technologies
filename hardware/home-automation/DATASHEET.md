# Circuvent Home Automation Hub

**Model:** CV-HUB · **Type id:** `home-hub` · **Firmware:** 2.0.0

A 4-channel Wi-Fi mains controller that makes lights, fans and appliances smart -
with real physical buttons that keep working even when the internet is down.

## Key features
- **4 independent channels** - control lights/fans/appliances from the app, web,
  or the built-in buttons.
- **Local-first:** buttons toggle loads instantly, with or without Wi-Fi.
- **Scenes:** one tap for Home / Away / Night / Movie.
- **Schedules:** NTP-synced daily on/off times per channel.
- **Boot-state restore:** channels return to their last state after a power cut.
- Zero-touch Wi-Fi setup (phone captive portal); secure OTA updates.

## Specifications
| Parameter | Value |
|---|---|
| Supply | 100-240 V AC, 50/60 Hz |
| Channels | 4 x SPDT relay, 10 A (recommend <= 6 A/ch resistive) |
| Total load | Limited by 6 A mains fuse + PSU + copper |
| Connectivity | Wi-Fi 802.11 b/g/n 2.4 GHz (ESP32) |
| Local control | 4 push-buttons (offline-capable) |
| Clock | NTP (schedules) |
| Enclosure | ABS wall box (modular/DIN option) |
| Operating temp | 0-50 degC |
| Warranty | 12 months |

## Telemetry / control (cloud contract)
- **State:** `power`, `power2`, `power3`, `power4`, `scene`, `channels`, `uptime`, `clock`.
- **Commands (`set`):** `{ch,on}`, `{power}`, `{relays:[..]}`, `{scene}`,
  `{rule:{idx,ch,onMin,offMin,en}}`, `{restore}`.

## Compliance (required before retail sale in India) - external
- [ ] BIS / CRS registration (mains appliance)
- [ ] WPC/ETA for the 2.4 GHz radio
- [ ] IEC 60335 safety + CISPR EMC reports; RoHS; e-waste marks

## In the box
Hub unit · mounting screws · wiring guide (`MANUAL.md`) · warranty card.

> SAFETY: Mains wiring must be done by a qualified electrician. Observe the
> per-channel and total current limits.
