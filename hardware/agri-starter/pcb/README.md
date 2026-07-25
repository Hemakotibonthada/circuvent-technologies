# Agri Starter PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-agri.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolate each phase-sense input.
- Size target ~ 80 x 60 mm; 4x M3.
- 4 V buck + 1000u bulk at the SIM800L; conformal-coat + IP54 glands for the field.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] Contactor-coil relay + flyback verified; phase-sense optos isolated
- [ ] SIM800L on its own 4V buck + bulk cap
- [ ] Test points: 5V, 3V3, GND, IO26/34, UART2
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Relay drives a test contactor; mains-sense reads phase HIGH/LOW
- [ ] SIM registers; a missed call toggles the pump
- [ ] Dry-run: pump won't start with sense LOW; auto-restarts on return
