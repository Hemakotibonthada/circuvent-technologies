# Smart Plug PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-plug.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 50 x 50 mm (plug body); 2x M3 / snap bosses.
- Relay + shunt pads wide; keep the metering divider tight to the shunt.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] Fuse + MOV at entry; single L-bus IN->relay->shunt->OUT
- [ ] Shunt power + trace width verified at 16 A
- [ ] Test points: 5V, 3V3, GND, IO26, IO35/34/25 (meter)
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] Relay clicks + switches the socket; button toggles offline
- [ ] BL0937 reads W/kWh against a known load; calibrate
- [ ] Cloud sync self-test; schedule fires
