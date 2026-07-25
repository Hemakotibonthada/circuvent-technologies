# Curtain Control PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-curt.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 70 x 50 mm; 2x M3.
- Cross-wire the relay NC contacts for the hardware interlock; label OPEN/CLOSE on silk.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] Hardware interlock (NC cross-wire) verified on the netlist
- [ ] Fuse + MOV at entry; relay pads wide
- [ ] Test points: 5V, 3V3, GND, IO26/27, IO32/33/0
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Open + close each drive the motor; both-on is physically impossible
- [ ] Buttons work offline; travel-time calibration sets 0-100%
- [ ] Cloud sync self-test; schedule fires
