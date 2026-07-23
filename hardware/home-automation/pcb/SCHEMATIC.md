# Home Automation Hub - Schematic / Netlist

ESP32-based **4-channel** mains relay controller. Each channel switches a load
(lights/appliances) up to the relay rating via an opto-isolated driver. Mains
and low-voltage logic are isolated (HLK PSU + opto barrier).

## Power
```
J1(L) --[F1 6A]--+--[RV1 MOV]--+--> PS1.AC-L
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1..K4 coils, U2.IN) ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 1000u on 5V (relay inrush) ; C2 100u 3V3 ; C3..C8 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/home-hub/home-hub.ino)
| Channel | RELAY GPIO | BUTTON GPIO | LED |
|--------:|-----------|-------------|-----|
| 0 | 26 | 13 | LED1 |
| 1 | 27 | 14 | LED2 |
| 2 | 32 | 16 | LED3 |
| 3 | 33 | 17 | LED4 |

`EN` -> 10k to 3V3; `IO0` -> SW5 (BOOT/config); UART TXD0/RXD0 -> JP.

## Per-channel relay drive (x4, opto-isolated)
```
IOxx --[1k]--> PCn.anode ; PCn.cathode->GND
PCn.collector--[1k]--> Qn.base ; Qn.emitter->GND ; Qn.collector-> Kn coil(-)
Kn coil(+)->5V ; Dn (1N4007) across coil
Kn COM-> mains L ; Kn NO -> J2.OUTn ; loads return to J2.N (common)
Buttons SWn: GPIO(INPUT_PULLUP) -> GND (falling edge toggles channel locally)
```

## Layout / safety rules
- Single mains-L bus to the 4 relay COMs; keep switched-L outputs separated.
- **>= 8 mm creepage / 6 mm clearance** mains-to-LV; isolation slots under optos + PSU.
- Fuse + MOV at entry; wide 2 oz traces + thermal relief on relay pads.
- Per-channel current derating on the silk; total limited by F1 + PSU + copper.
- Silk: shock warning, ratings, serial/QR, CE/BIS mark area.

See `README.md` for the KiCad project + Gerber/fab checklist.
