# Smart Lock PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-lock.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free.
- Low-voltage DC only; keep the 12 V coil loop tight with its flyback.
- Size target ~ 50 x 40 mm; 2x M3.
- Snubber + flyback right at the relay; bulk cap near J1 for inrush.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules
- [ ] Flyback + snubber across the lock coil verified
- [ ] Reverse-polarity diode + fuse on Vin
- [ ] Test points: 12V, 5V, 3V3, GND, IO26/2/33
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Relay drives the lock; LED shows locked; button toggles offline
- [ ] Reed reads door open/closed; auto-lock fires
- [ ] Cloud sync self-test
