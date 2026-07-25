# Smart Fan - Schematic / Netlist

ESP32 fan regulator. A relay switches fan power; a 25 kHz PWM output is RC-filtered and op-amp buffered to a 0-10 V speed signal for BLDC fans, or drives an N-MOSFET for DC fans. Mains and LV logic are isolated (HLK PSU + opto).

## Power
```
J1(L) --[F1 2A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1 coil, U2.IN, U3 buffer) ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u 5V ; C2 100u 3V3 ; C3..C6 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/smart-fan/smart-fan.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| FAN_RELAY | 26 | -> PC1 -> Q1 -> K1 coil (fan power) |
| SPEED_PWM_PIN | 25 | -> RC filter -> U3 buffer -> J3 (0-10 V) / Qm gate (DC) |
| BTN_PIN | 0 | SW1 speed cycle (also BOOT) |

## Relay + speed output
```
IO26 --[1k]--> PC1.anode ; PC1.collector-> Q1.base -> K1 coil(-) ; K1 coil(+)->5V ; D1 across coil
K1 COM-> mains L ; K1 NO -> J2 (fan L) ; N common
IO25 (25 kHz PWM) --[R 10k]--+--[C 1u]->GND (RC ~16 Hz) -> U3 op-amp x3.03 -> 0-10 V @ J3
DC-fan option: IO25 -> Qm (N-MOSFET) gate ; fan+ -> Vfan ; fan- -> Qm drain
```

## Layout / safety rules
- Fuse + MOV at entry; relay pad wide; 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slot under the opto + PSU.
- 0-10 V output referenced to the fan-control ground; keep the speed signal off the mains island.
- Silk: shock warning, ratings, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
