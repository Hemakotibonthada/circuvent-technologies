# AquaGuard PCB - KiCad project + fab checklist

Design source lives in `SCHEMATIC.md` (netlist) and `BOM.csv`. Open
`aquaguard.kicad_pro` in **KiCad 8**, capture the schematic from `SCHEMATIC.md`,
lay out, then export manufacturing files.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, green mask, white silk.
- Mains section: 2 oz copper, >= 8 mm creepage / 6 mm clearance to LV, isolation slot.
- Size target ~ 80 x 60 mm, 4x M3 mounting holes.

## Pre-fab (DFM) checklist
- [ ] ERC clean (no unconnected / power-flag errors)
- [ ] DRC clean at fab rules (6/6 mil min; mains clearances enforced as keepout)
- [ ] Fuse + MOV at mains entry; isolation slot milled under opto/PSU
- [ ] Test points: 5V, 3V3, GND, IO26 (relay), IO25/27 (US), IO32/33 (floats)
- [ ] UART/EN/IO0 pads exposed for the flashing jig
- [ ] Silk: model, rating, serial/QR box, shock warning, CE/BIS mark area
- [ ] Fiducials for PnP; panelize (2x2) with mouse-bites for assembly

## Export for fab / assembly
- [ ] Gerbers (RS-274X) + Excellon drill -> `gerbers/`
- [ ] IPC-356 netlist, BOM (`BOM.csv`), CPL/centroid (`pos.csv`)
- [ ] PDF assembly drawing + 3D STEP for enclosure fit
- [ ] Send to fab (JLCPCB/PCBPower); order stencil for paste

## Bring-up (EVT)
- [ ] Power rails (5V, 3V3) before populating ESP32
- [ ] Flash test firmware over UART jig; verify relay click drives contactor
- [ ] Ultrasonic distance sane; float inputs read; buzzer + LEDs
- [ ] End-of-line: cloud sync self-test (unit appears in registry)
