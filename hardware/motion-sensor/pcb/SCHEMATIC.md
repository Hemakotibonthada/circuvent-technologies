# Motion Sensor - Schematic / Netlist

ESP32 PIR motion sensor. A HC-SR501 module drives a GPIO; the ESP32 debounces and publishes motion + alerts. USB-C 5 V input (battery variant adds a TP4056 charger + 18650). An optional relay provision can switch a local light. Low voltage only.

## Power
```
USB-C 5V -> U2 AMS1117 -> 3V3 (ESP32) ; PIR VCC from 5V (or 3V3 module)
C1 100u on 5V ; C2 100u 3V3 ; C3..C4 100n
Battery variant: TP4056 charge + DW01/8205 protect + 18650 holder -> 5V
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/motion-sensor/motion-sensor.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| PIR_PIN | 27 | <- HC-SR501 OUT (3V3 logic) |
| LED_PIN | 2 | -> LED1 (motion / armed status) |

## Optional light relay (provision)
```
Optional: IO26 -> Q1 -> K1 (5V relay) -> J2 dry contact ; D1 across coil
Populate U3/Q1/K1/D1 only for the local-light variant
```

## PIR sensor
```
HC-SR501: VCC->5V, GND->GND, OUT->IO27 (repeat-trigger mode, hold ~3-300 s)
LED1 on IO2 blinks on motion / shows the armed state
```

## Layout / safety rules
- Keep the PIR dome away from heat sources, AC vents and direct sunlight to cut false triggers.
- If the optional relay switches mains, treat that section as mains (creepage + fuse + opto).
- Battery variant: use a protected 18650; TP4056 + DW01 for safe charge/discharge.

See README.md for the KiCad project + Gerber/fab checklist.
