# Smart Switch PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-sw2.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 45 x 45 mm (fits a modular back-box); 2x M3.
- Touch pads on the top copper under the plate; guard ring around each.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] Fuse + MOV at entry; single L-bus to both relay COMs
- [ ] Per-gang derating on silk; total <= fuse/PSU/copper
- [ ] Test points: 5V, 3V3, GND, IO26/27, IO4/15 (touch)
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Both relays click + switch; touch pads toggle offline
- [ ] Alexa/Google discovery finds two switches
- [ ] Cloud sync self-test; schedule fires
