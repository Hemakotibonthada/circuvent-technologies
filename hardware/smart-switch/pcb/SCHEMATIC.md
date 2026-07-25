# Smart Switch - Schematic / Netlist

ESP32-based 2-gang mains switch module. Two opto-isolated relays switch two loads; two capacitive-touch pads give local control. Mains and LV logic are isolated (HLK PSU + opto barrier).

## Power
```
J1(L) --[F1 6A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1/K2 coils, U3/U4.IN) ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u on 5V ; C2 100u 3V3 ; C3..C6 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/smart-switch/smart-switch.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| RELAY1 | 26 | -> PC1 -> Q1 -> K1 coil (gang 1) |
| RELAY2 | 27 | -> PC2 -> Q2 -> K2 coil (gang 2) |
| TOUCH1 (T0) | 4 | <- TP1 copper touch pad (gang 1) |
| TOUCH2 (T3) | 15 | <- TP2 copper touch pad (gang 2) |

## Per-gang relay drive (x2, opto-isolated) + touch
```
IOxx --[1k]--> PCn.anode ; PCn.cathode->GND
PCn.collector--[1k]--> Qn.base ; Qn.emitter->GND ; Qn.collector-> Kn coil(-)
Kn coil(+)->5V ; Dn (1N4007) across coil
Kn COM-> mains L ; Kn NO -> J2.OUTn ; loads return to common N
Touch pads TP1/TP2 (exposed copper behind the plate) -> IO4/IO15 (ESP32 touch)
```

## Layout / safety rules
- Single mains-L bus to the 2 relay COMs; keep switched-L outputs separated.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots under optos + PSU.
- Fuse + MOV at entry; 2 oz traces + thermal relief on relay pads.
- Route touch traces short + guarded; keep them off the mains island.
- Silk: shock warning, ratings, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
