# FaceDoor PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-door.kicad_pro in KiCad, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 70 x 55 mm (door-frame enclosure); 4x M3.
- Strike loop carries the highest current: wide traces + thermal relief.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] Fail-secure verified: relay de-energised == bolt engaged
- [ ] D2 freewheel fitted across the strike terminals
- [ ] External 10k pull-up on IO39 (input-only, no internal pull-up)
- [ ] Test points: 12V, 5V, 3V3, GND, IO13, keypad rows/cols
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Boots locked; re-locks after the configured delay
- [ ] All 16 keypad positions decode; fingerprint enrol + match
- [ ] Bell button raises an event; hub captures the snapshot
- [ ] Power-fail during unlock leaves the door secured
