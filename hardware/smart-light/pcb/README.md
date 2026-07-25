# Smart Light PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-led.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 1-2 oz copper on channels.
- Low-voltage DC only - no mains isolation required.
- Size target ~ 55 x 40 mm; 2x M3.
- Copper pour + optional heatsink on the MOSFET drains for high-current strips.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules
- [ ] Reverse-polarity diode + fuse on Vin
- [ ] MOSFET + trace width sized for per-channel current
- [ ] Test points: Vin, 5V, 3V3, GND, IO25/32/33/27/26
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Each colour + white fades smoothly; aux relay clicks
- [ ] Button cycles presets offline
- [ ] Cloud sync self-test; scene fires
