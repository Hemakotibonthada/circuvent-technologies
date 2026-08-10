# Touch Switchboard - Schematic / Netlist

ESP32-based **3-gang** capacitive wall switchboard with per-board energy
metering. Three touch pads drive three opto-isolated relays; a PWM LED
backlight makes the plate findable at night. Matches
`firmware/touchboard/touchboard.ino`.

## Power
```
J1(L) --[F1 6A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1..K3 coils, U3..U5.IN) ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u on 5V ; C2 100u 3V3 ; C3..C8 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/touchboard/touchboard.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| RELAY1 | 25 | -> PC1 -> Q1 -> K1 coil (gang 1); LED1 status |
| RELAY2 | 26 | -> PC2 -> Q2 -> K2 coil (gang 2); LED2 status |
| RELAY3 | 33 | -> PC3 -> Q3 -> K3 coil (gang 3); LED3 status |
| TOUCH1 (T0) | 4 | TP1 copper touch pad (gang 1) |
| TOUCH2 (T3) | 15 | TP2 copper touch pad (gang 2) |
| TOUCH3 (T4) | 13 | TP3 copper touch pad (gang 3) |
| BACKLIGHT | 5 | -> Q4 -> J4 LED backlight string (PWM low-side) |
| MTR_CF | 34 | U6 HLW8012 CF (active-power pulses) |
| MTR_CF1 | 35 | U6 HLW8012 CF1 (V/I pulses) |
| MTR_SEL | 18 | U6 HLW8012 SEL (V/I select) |
| BTN_PIN | 0 | SW1 reset (also BOOT/config) |

GPIO 34/35 are input-only, which is what the CF/CF1 pulse inputs need.
`EN` -> 10k to 3V3; UART TXD0/RXD0 -> JP.

## Per-gang relay drive (x3, opto-isolated) + touch
```
IOxx --[1k]--> PCn.anode ; PCn.cathode->GND
PCn.collector--[1k]--> Qn.base ; Qn.emitter->GND ; Qn.collector-> Kn coil(-)
Kn coil(+)->5V ; Dn (1N4007) across coil
Kn COM-> mains L bus ; Kn NO -> J2/J3 OUTn ; loads return to common N
Touch pads TP1..TP3 (exposed copper behind the plate) -> IO4/IO15/IO13
```

The touch pads deliberately carry **no pull-up**. `touchRead()` measures the
pad's charge/discharge time, and a resistor to 3V3 swamps exactly the signal
the firmware is looking for.

## Metering front end — isolated
```
K1 NO --> Rsh (1 mR 2512) --> AC_LOAD bus --> J2/J3 outputs
U6 HLW8012: 1=V2P(mains L) 2=V1P 3=V1N (across Rsh)
            4=GND -> MTR_GND    8=VDD -> MTR_VDD
T1 pins 7-8 : third winding, referenced to MTR_GND
              --[PD8]--> MTR_VDD --[PZ6 100u]-- MTR_GND
U7  CF  : meter drives the LED, transistor pulls IO34   (meter -> MCU)
U8  CF1 : meter drives the LED, transistor pulls IO35   (meter -> MCU)
U9  SEL : IO18 drives the LED, transistor drives meter pin 7 (MCU -> meter)
```

The metering chip measures a shunt sitting in the switched live, so **its
ground reference is a mains node**. The obvious wiring — GND and VDD to the
board's 3V3 rail — bonds the secondary to the mains through the chip and
defeats the transformer, the Y capacitor and the 8 mm barrier all at once. The
board then looks isolated and is not, which is worse than an honestly
non-isolated design because nobody treats it with the right caution.

Owning the magnetics is what makes the honest fix affordable. T1 carries a
third winding referenced to the meter's own ground, so the front end gets a
supply that floats with the shunt, and the three pulse lines cross the barrier
through optocouplers. An HLK module could never have provided that rail; this
is the concrete reason the in-house supply earns its keep on this board.

**Barrier crossings on this board, and nothing else may cross:** T1, CY1
(Y1-rated), U3/U4/U5 (gang drive optos) and U7/U8/U9 (metering optos).

## Layout / safety rules
- Single mains-L bus to the 3 relay COMs; keep switched-L outputs separated.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots under the
  optos and the PSU.
- Fuse + MOV at entry; 2 oz traces + thermal relief on relay and shunt pads.
- Kelvin-connect the shunt sense pair; keep it short and paired.
- Route touch traces short and guarded; keep them off the mains island.
- Silk: shock warning, ratings, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
