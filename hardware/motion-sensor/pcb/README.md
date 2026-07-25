# Motion Sensor PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-pir.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free.
- Low-voltage only (unless the optional mains relay is populated - then isolate it).
- Size target ~ 45 x 35 mm; 2x M3 / adhesive.
- Reserve a corner keep-out under the PIR dome; battery + charger on the back.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules
- [ ] PIR OUT level matches 3V3 logic
- [ ] Optional relay section isolated if it switches mains
- [ ] Test points: 5V, 3V3, GND, IO27/2
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rail before ESP32; flash test firmware over jig
- [ ] PIR triggers -> LED + cloud alert; arm/disarm works
- [ ] Battery variant: TP4056 charges; runtime measured
- [ ] Cloud sync self-test; automation fires a light
