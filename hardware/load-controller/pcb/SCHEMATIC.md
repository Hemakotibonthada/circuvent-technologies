# Dual-Channel Load Controller - Schematic / Netlist

Ultra-compact 2-layer ESP32-C3 load controller. Channel 1 is an opto-isolated,
MOSFET-driven mechanical relay for a mains or DC load. Channel 2 is a direct
N-channel MOSFET low-side switch for fast PWM. Powered from USB-C (which is
also the programming and debug port, using the C3's native USB) or from a
3.5 mm screw terminal. All passives are 0402/0603.

## Power
```
USB-C VBUS -> D1 (SS14) -.
                          >-- +5V -- U2 AP2112K-3.3 -> +3V3 (ESP32-C3, logic)
J2 5V screw in -> D2 ----'
C1 10u + C2 100n on +5V ; C3 10u + C4 100n + C5 100n on +3V3
R1/R2 5.1k CC1/CC2 pulldowns  (advertise a USB-C sink)
U3 USBLC6-2SC6 ESD array across D+/D- and VBUS
```

The two source diodes are a true OR: neither supply can back-feed the other,
so the board is safe with USB and the terminal connected at the same time.

## MCU (U1 ESP32-C3-WROOM-02) - I/O map
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| RELAY_CTL | 4 | -> R5 -> PC1 -> Q1 -> K1 coil (channel 1 load relay) |
| PULSE_PWM | 5 | -> R7 -> Q2 gate -> J4 pulse output (channel 2 PWM) |
| RELAY_LED | 6 | -> R10 -> LED2 (relay energised) |
| PULSE_LED | 7 | -> R11 -> LED3 (pulse active) |
| BOOT_N | 9 | <- SW2 boot/flash button, INPUT_PULLUP via R4 |

IO18/IO19 are the C3's native USB D-/D+ and go straight to the USB-C
receptacle through U3. There is no USB-UART bridge on this board.

## Reset and boot
```
SW1 -> EN to GND ; R3 10k EN pull-up to +3V3 ; C6 100n EN to GND (debounce)
SW2 -> IO9 to GND ; R4 10k pull-up to +3V3
Both are 3x4x2 mm SMD tactile switches (SKQG).
```

## Channel 1 - opto-isolated relay
```
IO4 -> R5 1k -> PC1 pin1 (LED anode) ; PC1 pin2 (LED cathode) -> GND
PC1 pin4 (collector) -> +3V3 ; PC1 pin3 (emitter) -> RELAY_GATE
R6 10k RELAY_GATE -> GND (holds the FET off while the MCU is in reset)
Q1 AO3400A: gate=RELAY_GATE, source=GND, drain=RELAY_COIL
K1 Omron G5Q-1A 5VDC: coil = +5V .. RELAY_COIL ; contacts COM/NO -> J3
D3 SS14 flyback: cathode +5V, anode RELAY_COIL
J3 = 3-pole 3.5 mm terminal: 1 = LOAD_COM (line in), 2 = LOAD_NO (switched
     out), 3 = PE. Treat all three as mains.
```

## Channel 2 - direct MOSFET PWM
```
IO5 -> R7 100R -> PULSE_GATE ; R8 100k PULSE_GATE -> GND
Q2 AO3400A: gate=PULSE_GATE, source=GND, drain=PULSE_OUT
D4 SS14 clamp: cathode +5V, anode PULSE_OUT (for inductive loads)
J4 JST-XH 2-pin: 1 = +5V, 2 = PULSE_OUT  (load sits between +5V and the drain)
```

## Indicators
```
LED1 power   : +3V3 -> R9 1k -> LED1 -> GND (always on)
LED2 relay   : IO6  -> R10 1k -> LED2 -> GND
LED3 pulse   : IO7  -> R11 1k -> LED3 -> GND
All 0603. KiCad LED footprints are pad 1 = cathode, pad 2 = anode.
```

## Layout / safety rules
- 2 layers, GND pour on both, stitched with vias around the MCU and the
  channel-2 return path.
- K1 is the only isolation barrier on the board. Its contact side (J3, LOAD_COM,
  LOAD_NO, PE) is a separate copper island with an 8 mm creepage gap and a
  milled slot; nothing else crosses.
- Load traces are on the MAINS netclass (1.5 mm / ~59 mil, 2.0 mm clearance),
  which exceeds the 30-40 mil requirement.
- Keep the ESP32-C3 antenna keep-out clear of copper on both layers.
- Channel 2 is a low-side switch: the load's positive side stays at +5V, so
  never earth the load's return.

See README.md for the KiCad project + Gerber/fab checklist.
