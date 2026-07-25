# Smart Light - Schematic / Netlist

ESP32 RGBW LED-strip controller. A DC input feeds a buck to 5 V/3V3; four N-MOSFETs sink the common-anode strip channels under 8-bit PWM. A small relay provides an auxiliary on/off output. No mains on-board (DC input).

## Power
```
J1(+Vin 12-24V) -> U3 buck (MP1584) -> 5V -> U2 AMS1117 -> 3V3 (ESP32)
J1(GND) -> GND (common) ; C1 470u on Vin ; C2 100u 5V ; C3 100u 3V3 ; C4..C7 100n
Strip +V taps Vin directly ; channels sink to GND through the MOSFETs
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/smart-light/smart-light.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| RGB_R_PIN | 32 | -> Q1 gate (R channel) |
| RGB_G_PIN | 33 | -> Q2 gate (G channel) |
| RGB_B_PIN | 27 | -> Q3 gate (B channel) |
| WHITE_PWM_PIN | 25 | -> Q4 gate (W channel) |
| RELAY_PIN | 26 | -> PC1 -> Q5 -> K1 (aux fixture) |
| BTN_PIN | 0 | SW1 on/off + preset (also BOOT) |

## MOSFET channels + aux relay
```
IOxx --[100R]--> Qn.gate ; Qn.gate--[100k]->GND ; Qn.source->GND ; Qn.drain-> strip channel
Strip common (+V) -> Vin ; each colour returns through its MOSFET drain
Aux: IO26 -> PC1 -> Q5 -> K1 coil ; D1 across coil ; K1 dry contact -> J3
PWM: ledc 5 kHz 8-bit on IO25/32/33/27 (firmware smart-light.ino)
```

## Layout / safety rules
- Size the MOSFETs + copper for the strip current; add a heatsink/pour above ~2 A/ch.
- Reverse-polarity diode + fuse on Vin; TVS across Vin for surge.
- Keep PWM traces short; star-ground the returns to avoid colour cross-talk.
- Aux relay contacts rated for the auxiliary load only (not the strip).

See README.md for the KiCad project + Gerber/fab checklist.
