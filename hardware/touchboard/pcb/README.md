# Touch Switchboard PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-tb3.kicad_pro in KiCad, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 80 x 60 mm (3-gang plate); 4x M3.
- Touch pads on the top copper under the plate; guard ring around each.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] **Resolve the metering isolation question in SCHEMATIC.md before fab**
- [ ] Fuse + MOV at entry; single L-bus to all three relay COMs
- [ ] Kelvin sense pair on Rsh, short and paired
- [ ] Per-gang derating on silk; total <= fuse/PSU/copper
- [ ] Test points: 5V, 3V3, GND, IO25/26/33, IO4/15/13 (touch)
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] All three relays click + switch; touch pads toggle offline
- [ ] Backlight dims across the full 0-100 range
- [ ] Metering reads V/A/W/PF against a reference load
- [ ] Cloud sync self-test; schedule fires
