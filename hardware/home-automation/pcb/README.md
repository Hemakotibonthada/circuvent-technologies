# Home Automation Hub PCB - KiCad project + fab checklist

Design source: `SCHEMATIC.md` (netlist) + `BOM.csv`. Open `homehub.kicad_pro`
in **KiCad 8**, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 90 x 65 mm; 4x M3 mounts. Relay pads wide + thermal relief.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] Fuse + MOV at entry; single L-bus to 4 relay COMs
- [ ] Per-channel derating printed on silk; total load <= fuse/PSU/copper limit
- [ ] Test points: 5V, 3V3, GND, IO26/27/32/33 (relays), buttons
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials; panelize

## Export for fab / assembly
- [ ] Gerbers + Excellon -> `gerbers/`; IPC-356 netlist
- [ ] BOM (`BOM.csv`) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Each relay clicks + switches its output; buttons toggle locally (offline)
- [ ] Cloud sync self-test; scenes + schedule fire
