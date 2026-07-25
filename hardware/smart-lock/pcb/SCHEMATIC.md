# Smart Lock - Schematic / Netlist

ESP32 electric-lock controller. A relay switches a 12 V strike/solenoid/motor; a flyback + snubber protect against the coil kick. A reed input senses the door. DC input; no mains on-board.

## Power
```
J1(+12V) -> U3 buck (MP1584) -> 5V -> U2 AMS1117 -> 3V3 (ESP32)
J1(GND) -> GND ; C1 470u on 12V (solenoid inrush) ; C2 100u 5V ; C3 100u 3V3 ; C4..C6 100n
D3 (SS34) reverse-polarity + F1 on the 12 V input
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/smart-lock/smart-lock.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| LOCK_RELAY | 26 | -> PC1 -> Q1 -> K1 coil -> J2 lock output |
| LED_PIN | 2 | -> LED1 (on = locked) |
| BTN_PIN | 0 | SW1 lock/unlock (also BOOT) |

## Lock drive (relay + flyback)
```
IO26 --[1k]--> PC1.anode ; PC1.collector-> Q1.base -> K1 coil(-) ; K1 coil(+)->5V ; D1 across coil
K1 COM-> +12V ; K1 NO/NC -> J2 (pick fail-secure/fail-safe) ; D2 (1N5408) + RC snubber across the lock coil
Status: IO2 -> LED1 (on = locked)
```

## Door sensor (optional provision)
```
J3 reed switch -> IO33 (INPUT_PULLUP), closes to GND when the door is shut
Firmware hook publishes door state + can auto-lock on close
```

## Layout / safety rules
- The 12 V coil needs a flyback (D2) + optional RC snubber to protect the relay contacts.
- Bulk cap on 12 V for solenoid inrush; size the relay for the lock's coil current.
- Fail-safe (unlocks on power loss) vs fail-secure: choose per local egress/fire code.
- Fuse + reverse-polarity diode on the 12 V input; strain-relieve the lock cable.

See README.md for the KiCad project + Gerber/fab checklist.
