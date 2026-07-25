# Smart Fan PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-fan.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 55 x 45 mm; 2x M3.
- Op-amp + RC near IO25; guard the 0-10 V trace from PWM/mains coupling.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] Fuse + MOV at entry; relay pad wide
- [ ] RC + op-amp gain verified for full 0-10 V swing
- [ ] Test points: 5V, 3V3, GND, IO26/25, 0-10 V out
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Relay clicks + powers the fan; 0-10 V ramps 0-100%
- [ ] Button cycles presets offline
- [ ] Cloud sync self-test; schedule fires
