# Curtain Control - Schematic / Netlist

ESP32-based curtain/blind controller. Two opto-isolated relays drive an AC tubular motor's open and close windings; a hardware + firmware interlock prevents both energising at once. Three buttons give local control. Mains and LV logic are isolated (HLK PSU + opto).

## Power
```
J1(L) --[F1 3A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1/K2 coils, U3/U4.IN) ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u 5V ; C2 100u 3V3 ; C3..C6 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/curtain/curtain.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| MOTOR_OPEN_PIN | 26 | -> PC1 -> Q1 -> K1 (open winding) |
| MOTOR_CLOSE_PIN | 27 | -> PC2 -> Q2 -> K2 (close winding) |
| BTN_OPEN | 32 | SW1 open (INPUT_PULLUP -> GND) |
| BTN_CLOSE | 33 | SW2 close (INPUT_PULLUP -> GND) |
| BTN_STOP | 0 | SW3 stop (also BOOT/config) |

## Interlocked motor relays (x2, opto-isolated)
```
IOxx --[1k]--> PCn.anode ; PCn.collector-> Qn.base -> Kn coil(-) ; Kn coil(+)->5V ; Dn across coil
K1 NO -> motor OPEN lead ; K2 NO -> motor CLOSE lead ; motor common -> N
Interlock: K1 NC in series with K2 coil (and vice-versa) so only one can close
Buttons SW1/2/3 -> IO32/33/0 (INPUT_PULLUP to GND): open / close / stop (offline)
```

## Layout / safety rules
- Hardware interlock (NC contacts cross-wired) plus a firmware guard: never energise both.
- Add a short reversing dead-time in firmware before changing direction.
- Fuse + MOV at entry; 2 oz copper on mains; relay pads wide.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots under optos + PSU.
- Silk: shock warning, ratings, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
