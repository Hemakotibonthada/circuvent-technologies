# FaceDoor - Schematic / Netlist

ESP32-based front-door controller. One opto-isolated relay drives an electric
strike or deadbolt; a 4x4 membrane keypad, a fingerprint module on Serial2 and
a calling-bell button provide local entry. Face recognition runs on the hub and
arrives over MQTT. Matches `firmware/facedoor/facedoor.ino`.

## Power
```
J1(L) --[F1 1A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM12)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+12V -> strike bus + K1 contact ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u on 12V ; C2 100u 3V3 ; C3..C8 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/facedoor/facedoor.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| LOCK_RELAY | 13 | -> PC1 -> Q1 -> K1 coil (electric strike) |
| LED_PIN | 2 | -> LED1 locked indicator |
| KP_ROW1 | 32 | -> J4 keypad row 1 |
| KP_ROW2 | 33 | -> J4 keypad row 2 |
| KP_ROW3 | 25 | -> J4 keypad row 3 |
| KP_ROW4 | 26 | -> J5 keypad row 4 |
| KP_COL1 | 27 | <- J5 keypad column 1 (INPUT_PULLUP) |
| KP_COL2 | 14 | <- J5 keypad column 2 (INPUT_PULLUP) |
| KP_COL3 | 23 | <- J6 keypad column 3 (INPUT_PULLUP) |
| KP_COL4 | 4 | <- J6 keypad column 4 (INPUT_PULLUP) |
| FP_RX | 16 | <- J3 fingerprint module TX (Serial2 RX) |
| FP_TX | 17 | -> J3 fingerprint module RX (Serial2 TX) |
| BELL_BTN | 39 | <- J6 calling-bell button (input-only, external pull-up) |
| BTN_PIN | 0 | SW1 reset (also BOOT/config) |

GPIO 39 is input-only and has **no internal pull-up**, so R-pool provides an
external 10k to 3V3; the button pulls it down. `EN` -> 10k to 3V3.

## Lock drive (fail-secure)
```
IO13 --[1k]--> PC1.anode ; PC1.cathode->GND
PC1.collector--[1k]--> Q1.base ; Q1.emitter->GND ; Q1.collector-> K1 coil(-)
K1 coil(+)->5V ; D1 (1N4007) across coil
K1 COM-> +12V ; K1 NO -> J2 strike(+) ; strike(-) -> J2 return
D2 (1N4007) across the strike terminals - an electric strike is a large
inductor and its collapse will otherwise weld the relay contacts.
```

The firmware boots **locked** and energises only to withdraw the bolt, so a
power failure leaves the door secured rather than open.

## Keypad + fingerprint
```
4x4 membrane: rows IO32/33/25/26 driven low one at a time,
              cols IO27/14/23/4 read with INPUT_PULLUP
Fingerprint module on Serial2: J3 pin1 RX <- IO17, pin2 TX -> IO16, pin3 GND
Module 3V3 feed is taken from the 3V3 rail at J3 (see the fab notes).
```

## Layout / safety rules
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slot under PS1 and
  the opto.
- Mains is confined to the PS1 island: F1, RV1 and J1 only. Everything the
  installer touches during commissioning is on the 12 V / LV side.
- The strike loop carries the largest current on the board - wide traces and
  thermal relief on the K1 contact pads.
- Keypad and fingerprint runs leave through glanded cable entries; keep the
  ribbon away from the relay coil.
- Silk: shock warning, strike polarity, ratings, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
