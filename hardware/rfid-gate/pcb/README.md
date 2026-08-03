# RFID Gate PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-gate.kicad_pro in KiCad, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 75 x 60 mm (outdoor gate-post enclosure); 4x M3.
- Outdoor unit: conformal coat after test; glanded entries; drip loops.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] Wiegand D0/D1 pull-ups fitted; isolation upgrade reviewed (SCHEMATIC.md)
- [ ] Reader supply voltage settled - J3 carries 5 V, most UHF readers want 12 V
- [ ] External 10k pull-ups on IO34/IO35 (input-only, no internal pull-up)
- [ ] K1/K2 wired as dry contacts - board never carries motor current
- [ ] Test points: 5V, 3V3, GND, IO26/27, IO16/17 (Wiegand)
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Wiegand-26 frames decode with correct parity strip
- [ ] Open/close pulses measure 600 ms at the gate controller terminals
- [ ] Loop detector holds the gate open with a vehicle present
- [ ] Allowlist survives a power cycle; works with the network down
