# Sentinel PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-sent.kicad_pro in KiCad, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.
- Size target ~ 90 x 70 mm (distribution-board enclosure); 4x M3.
- Vent above the gas sensor header; keep it out of the PSU thermal plume.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; mains clearances as keepout
- [ ] GAS_ANALOG on ADC1 (GPIO 32-39) - ADC2 dies once Wi-Fi is up
- [ ] Relays clear of strapping pins 0/2/5/12/15; touch pads clear of 12
- [ ] Fuse + MOV at entry; single L-bus to all four relay COMs
- [ ] Test points: 5V, 3V3, GND, IO19/21/22/23, IO34/35 (gas)
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Rails before ESP32; flash test firmware over jig
- [ ] No relay clicks during boot or reset (strapping-pin check)
- [ ] All four relays click + switch; touch pads toggle offline
- [ ] Gas alarm fires the buzzer and the safety cut after heater warm-up
- [ ] DHT + PIR report; alarm latches and clears correctly
