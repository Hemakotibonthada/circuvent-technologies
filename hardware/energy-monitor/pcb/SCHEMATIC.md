# Energy Monitor - Schematic / Netlist

ESP32 energy monitor. A clamp-on CT feeds a burden resistor biased to mid-rail; the ESP32 samples Irms on an ADC pin and computes W/kWh. An optional ZMPT101B adds voltage sensing for true power. Powered by a small isolated mains PSU (or USB).

## Power
```
J1(L) --[F1 500mA]--> PS1.AC-L (HLK-PM01) ; J1(N) -> PS1.AC-N
PS1.+5V -> U2 AMS1117 -> 3V3 (ESP32 + analog bias) ; C1 100u 5V ; C2 100u 3V3
USB variant: USB-C 5V -> U2 (omit PS1)
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/energy-monitor/energy-monitor.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| CT_PIN | 34 | <- J3 CT jack -> burden -> mid-rail bias -> IO34 (ADC1) |

## CT front-end + optional voltage sense
```
CT jack J3 -> burden Rb (33R for SCT-013-030 => ~1 V at 30 A) across the CT secondary
Mid-rail bias: 2x 10k (3V3/GND) at the ADC node + 10u decouple => 1.65 V bias
IO34 (ADC1) samples; firmware computes Irms * V * PF (energy-monitor.ino)
Optional: ZMPT101B voltage transformer -> conditioned -> IO35 for true power/PF
```

## Layout / safety rules
- Clamp a single INSULATED live conductor - never bare wire; keep the burden across the CT (open-secondary CTs develop dangerous voltage).
- The mains PSU section is isolated; the analog CT front-end sits on the LV side.
- Fuse the mains input; keep meter/DB-box work to a qualified electrician.
- Star-ground the analog bias; guard IO34 from digital noise.

See README.md for the KiCad project + Gerber/fab checklist.
