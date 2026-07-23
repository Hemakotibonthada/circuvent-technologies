# AquaGuard - Schematic / Netlist (source of truth for PCB layout)

ESP32-based, mains-powered water-tank pump controller. **The board switches a
contactor coil, never the pump motor directly.** All mains sections are on an
isolated island separated from the low-voltage logic by the opto-isolator and
the HLK-PM01 isolated PSU.

## Power
```
J1(L) --[F1 2A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM01)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V --> 5V rail (K1 coil, buzzer, ultrasonic, U2.IN)
PS1.-V  --> GND (LV ground)
U2(AMS1117-3.3): IN=5V, OUT=3V3 rail (ESP32, floats pull-ups), GND
C1 470u on 5V; C2 100u on 3V3; C3..C6 100n decoupling at each IC
```

## MCU (U1 ESP32-WROOM-32E)
```
3V3 -> U1.3V3 ; GND -> U1.GND ; EN -> 10k to 3V3 + SW(EN) ; IO0 -> SW2 (BOOT/config)
UART: U1.TXD0->J5.RX, U1.RXD0->J5.TX, GND->J5.GND  (factory flashing / debug)
```

## I/O map (matches firmware/aquaguard/aquaguard.ino)
| Signal        | ESP32 GPIO | Net / connector |
|---------------|-----------|-----------------|
| MOTOR_RELAY   | 26        | -> R(base) Q1 -> K1 coil -> contactor (J2) |
| US_TRIG       | 25        | -> J3.TRIG (ultrasonic) |
| US_ECHO       | 27        | <- J3.ECHO (level-shift/divide to 3V3) |
| FLOAT_LOW     | 32        | <- J4.LOW (INPUT_PULLUP, closes to GND) |
| FLOAT_HIGH    | 33        | <- J4.HIGH (overflow, closes to GND) |
| BTN_PIN       | 0         | SW1 manual override (also BOOT) |
| BUZZER_PIN    | 4         | -> FB1 buzzer |
| LED_PIN       | 2         | -> LED2 (pump/alert) |

## Relay drive (opto-isolated)
```
IO26 --[R 1k]--> PC817.anode ; PC817.cathode->GND
PC817.collector-> Q1.base via 1k ; Q1.emitter->GND ; Q1.collector-> K1 coil(-)
K1 coil(+)->5V ; D1 (1N4007) reverse across coil
K1 COM/NO -> J2 -> external contactor coil (A1/A2)
```

## Sensor / floats
```
J3: 5V, GND, TRIG(from IO25), ECHO(->voltage divider 10k/20k ->IO27)
J4: LOW->IO32, HIGH->IO33, COM->GND  (use sealed float switches)
```

## Layout / safety rules
- Mains island (J1, F1, RV1, PS1 primary) fully separated; **>= 8 mm creepage,
  >= 6 mm clearance** mains-to-LV; slot-mill under the opto and PSU isolation gap.
- Fuse + MOV at the mains entry. Y-cap optional across the isolation barrier.
- 2 oz copper + wide traces on mains; star-ground the LV side.
- Silkscreen: "RISK OF SHOCK - QUALIFIED INSTALL ONLY", CE/BIS marks area, serial/QR.

See `README.md` for the KiCad project + Gerber/fab checklist.
