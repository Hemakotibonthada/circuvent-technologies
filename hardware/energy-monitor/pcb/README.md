# Energy Monitor PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-em.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free.
- Isolated mains PSU island (PSU variant); analog front-end on LV side.
- Size target ~ 50 x 45 mm; 2x M3.
- Keep the burden + bias tight to the jack; guard-ring the ADC node.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules
- [ ] Burden always across the CT (no open secondary)
- [ ] Bias network + ADC guard verified
- [ ] Test points: 5V, 3V3, GND, IO34 (+ IO35 add-on)
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rail before ESP32; flash test firmware over jig
- [ ] Irms reads against a known load; calibrate CT_CAL
- [ ] kWh accumulates over time; cost estimate matches
- [ ] Cloud sync self-test; high-usage alert fires
