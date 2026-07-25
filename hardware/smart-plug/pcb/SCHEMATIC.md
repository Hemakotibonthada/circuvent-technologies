# Smart Plug - Schematic / Netlist

ESP32-based single-channel 16 A mains plug with non-invasive energy metering. The relay switches the socket live; a BL0937 meters the load. Mains and low-voltage logic are isolated (HLK PSU + opto barrier).

## Power
```
J1(L) --[F1 16A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1 coil, U2.IN) ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 1000u on 5V (relay inrush) ; C2 100u 3V3 ; C3..C6 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/smart-plug/smart-plug.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| RELAY_PIN | 26 | -> PC1 -> Q1 -> K1 coil (socket live) |
| LED_PIN | 2 | -> LED1 (load on) |
| BTN_PIN | 0 | SW1 manual toggle (also BOOT/config) |
| MTR_CF | 35 | <- BL0937 CF (active-power pulses) |
| MTR_CF1 | 34 | <- BL0937 CF1 (V/I pulses) |
| MTR_SEL | 25 | -> BL0937 SEL (V/I select) |

## Relay drive (opto-isolated) + metering front-end
```
IO26 --[1k]--> PC1.anode ; PC1.cathode->GND
PC1.collector--[1k]--> Q1.base ; Q1.emitter->GND ; Q1.collector-> K1 coil(-)
K1 coil(+)->5V ; D1 (1N4007) across coil
K1 COM-> mains L(in) ; K1 NO -> socket L(out) ; N + E pass straight through
BL0937: Rshunt 1mR in load-L path -> current ; Rdiv(Vmains) -> voltage ;
  CF->IO35, CF1->IO34, SEL->IO25 (on the mains island; keep away from LV)
```

## Layout / safety rules
- Single mains-L bus: IN -> K1 COM -> shunt -> socket L(out); wide 2 oz traces + thermal relief.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slot under the opto + PSU.
- 16 A fuse + MOV at entry; size the shunt for <= 1 W at full load.
- BL0937 front-end sits on the mains island; only the 3 opto/pulse lines cross to LV.
- Silk: shock warning, 16 A rating, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
